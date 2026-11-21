import {
  pool,
  hashPasswordNode,
  verifyPasswordMatchNode,
  validatePasswordStrength,
  generateSessionToken,
  verifyAuthRequest,
  verifyCsrfRequest,
  setSessionCookie,
  clearSessionCookie,
  setCorsHeaders,
  parseBody,
  sendJson,
  findLocalUser,
  saveLocalUser,
  getLocalStore,
  saveLocalStore,
  linkUserToTripMembersInDb,
  checkRateLimit,
  resetRateLimit,
  sendRateLimitExceeded,
  getClientIp,
  logSecurityEvent,
  updatePasswordBodySchema,
  validateWithSchema,
} from "../_shared.js";

export default async function handler(req: any, res: any) {
  setCorsHeaders(res, req);

  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    return res.end();
  }

  if (req.method !== "POST") {
    return sendJson(res, 405, { success: false, error: "Method Not Allowed" });
  }

  if (process.env.NODE_ENV === "production" && (!process.env.SESSION_SECRET || !process.env.SESSION_SECRET.trim())) {
    console.error("CRITICAL SECURITY ERROR: SESSION_SECRET environment variable is required in production.");
    return sendJson(res, 500, {
      success: false,
      error: "Server configuration error: SESSION_SECRET is missing.",
    });
  }

  const url = String(req.url || "");
  const body = parseBody(req);
  const queryAction = String(req.query?.action || body?.action || "").trim();
  const clientIp = getClientIp(req);

  // 0. Handle /api/auth/logout (or ?action=logout)
  if (queryAction === "logout" || url.includes("/logout")) {
    const csrf = verifyCsrfRequest(req);
    if (!csrf.valid) {
      return sendJson(res, 403, { success: false, error: csrf.error || "CSRF validation failed" });
    }
    clearSessionCookie(res);
    return sendJson(res, 200, {
      success: true,
      message: "Logged out successfully.",
    });
  }

  // 1. Handle /api/auth/revoke-all-sessions (or ?action=revoke-all-sessions)
  if (queryAction === "revoke-all-sessions" || url.includes("/revoke-all-sessions")) {
    const authResult = await verifyAuthRequest(req);
    if (!authResult.authorized || !authResult.userId) {
      return sendJson(res, authResult.statusCode || 401, {
        success: false,
        error: authResult.error || "Unauthorized",
      });
    }

    const userId = authResult.userId;
    if (pool) {
      try {
        await pool.query(
          "UPDATE public.users SET token_version = COALESCE(token_version, 1) + 1, updated_at = NOW() WHERE id = $1;",
          [userId]
        );
      } catch {
        if (process.env.NODE_ENV === "production") {
          return sendJson(res, 503, { success: false, error: "Database unavailable" });
        }
      }
    } else if (process.env.NODE_ENV === "production") {
      return sendJson(res, 503, { success: false, error: "Database unavailable" });
    }

    if (process.env.NODE_ENV !== "production") {
      const store = getLocalStore();
      const u = store.users.find((u) => u.id === userId);
      if (u) {
        (u as any).token_version = ((u as any).token_version || 1) + 1;
        saveLocalStore(store);
      }
    }

    clearSessionCookie(res);
    logSecurityEvent("AUTH_SESSIONS_REVOKED", { userId, ip: clientIp });
    return sendJson(res, 200, {
      success: true,
      message: "All existing sessions have been revoked. Please log in again with new credentials.",
    });
  }

  // 2. Handle /api/auth/update-password (or ?action=update-password)
  if (queryAction === "update-password" || url.includes("/update-password")) {
    const pwRate = await checkRateLimit(`pw_ip_${clientIp}`, 5, 5 * 60 * 1000);
    if (!pwRate.allowed) {
      logSecurityEvent("RATE_LIMIT_EXCEEDED", {
        scope: "update-password",
        ip: clientIp,
      });
      return sendRateLimitExceeded(
        res,
        pwRate.retryAfterSec,
        "Too many password update attempts. Please try again later."
      );
    }

    let resolvedUserId = "";
    let resolvedEmail = "";

    const authResult = await verifyAuthRequest(req);
    if (authResult.statusCode === 403) {
      return sendJson(res, 403, {
        success: false,
        error: authResult.error || "CSRF validation failed",
      });
    }
    if (authResult.authorized && authResult.userId) {
      resolvedUserId = authResult.userId;
      if (authResult.session?.email) {
        resolvedEmail = authResult.session.email.trim().toLowerCase();
      }
    } else {
      const authHeader = String(req.headers?.authorization || req.headers?.Authorization || "");
      const bearerToken = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";
      const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || "";
      const supabaseKey =
        process.env.SUPABASE_SERVICE_ROLE_KEY ||
        process.env.VITE_SUPABASE_ANON_KEY ||
        process.env.SUPABASE_ANON_KEY ||
        "";

      if (bearerToken && supabaseUrl && supabaseKey) {
        const csrf = verifyCsrfRequest(req);
        if (!csrf.valid) {
          return sendJson(res, 403, { success: false, error: csrf.error || "CSRF validation failed" });
        }
        try {
          const userResp = await fetch(`${supabaseUrl.replace(/\/$/, "")}/auth/v1/user`, {
            headers: {
              Authorization: `Bearer ${bearerToken}`,
              apikey: supabaseKey,
            },
          });
          if (userResp.ok) {
            const supaUser = await userResp.json();
            if (supaUser && (supaUser.id || supaUser.email)) {
              resolvedUserId = supaUser.id || "";
              resolvedEmail = supaUser.email ? String(supaUser.email).trim().toLowerCase() : "";
            }
          }
        } catch {}
      }
    }

    if (!resolvedUserId && !resolvedEmail) {
      return sendJson(res, 401, {
        success: false,
        error: "Unauthorized: Valid session or recovery token required to update password.",
      });
    }

    const pwValidation = validateWithSchema(updatePasswordBodySchema, body);
    if (!pwValidation.success) {
      return sendJson(res, 400, {
        success: false,
        error: pwValidation.error,
      });
    }

    const { newPassword } = pwValidation.data;
    const strength = validatePasswordStrength(newPassword);
    if (!strength.valid) {
      return sendJson(res, 400, {
        success: false,
        error: strength.error || "Password does not meet security requirements.",
      });
    }

    const newHashed = hashPasswordNode(newPassword);
    let updatedUser: any = null;
    let newTokenVersion = 1;

    if (pool) {
      try {
        const updateRes = resolvedUserId
          ? await pool.query(
              `UPDATE public.users
               SET password_hash = $1,
                   token_version = COALESCE(token_version, 1) + 1,
                   updated_at = NOW()
               WHERE id = $2
               RETURNING id, email, name, token_version;`,
              [newHashed, resolvedUserId]
            )
          : await pool.query(
              `UPDATE public.users
               SET password_hash = $1,
                   token_version = COALESCE(token_version, 1) + 1,
                   updated_at = NOW()
               WHERE LOWER(TRIM(COALESCE(email, ''))) = $2
               RETURNING id, email, name, token_version;`,
              [newHashed, resolvedEmail]
            );
        updatedUser = updateRes.rows[0];
        if (updatedUser) {
          newTokenVersion = Number(updatedUser.token_version || 1);
        }
      } catch {
        if (process.env.NODE_ENV === "production") {
          return sendJson(res, 503, { success: false, error: "Database unavailable" });
        }
      }
    } else if (process.env.NODE_ENV === "production") {
      return sendJson(res, 503, { success: false, error: "Database unavailable" });
    }

    if (process.env.NODE_ENV !== "production") {
      const store = getLocalStore();
      const localU = store.users.find((u) =>
        resolvedUserId
          ? u.id === resolvedUserId
          : Boolean(resolvedEmail && u.email && u.email.trim().toLowerCase() === resolvedEmail)
      );
      if (localU) {
        localU.password_hash = newHashed;
        localU.updated_at = new Date().toISOString();
        (localU as any).token_version = ((localU as any).token_version || 1) + 1;
        newTokenVersion = (localU as any).token_version;
        saveLocalStore(store);
        if (!updatedUser) {
          updatedUser = localU;
        }
      }
    }

    const finalUserId = updatedUser?.id || resolvedUserId;
    const finalEmail = updatedUser?.email || resolvedEmail;
    const finalName = updatedUser?.name || "Traveler";
    if (finalUserId) {
      const freshToken = generateSessionToken(finalUserId, finalEmail, finalName, newTokenVersion);
      setSessionCookie(res, freshToken);
    }

    logSecurityEvent("AUTH_PASSWORD_UPDATED", {
      userId: finalUserId,
      ip: clientIp,
    });

    return sendJson(res, 200, {
      success: true,
      message: "Password updated and synchronized across all sign-in methods.",
    });
  }

  // 3. Standard Login Flow
  const loginCsrf = verifyCsrfRequest(req);
  if (!loginCsrf.valid) {
    return sendJson(res, 403, { success: false, error: loginCsrf.error || "CSRF validation failed" });
  }

  const ipRate = await checkRateLimit(`login_ip_${clientIp}`, 10, 5 * 60 * 1000);
  if (!ipRate.allowed) {
    logSecurityEvent("RATE_LIMIT_EXCEEDED", { scope: "login_ip", ip: clientIp });
    return sendRateLimitExceeded(
      res,
      ipRate.retryAfterSec,
      `Too many login attempts. Please try again in ${Math.ceil(ipRate.retryAfterSec / 60)} minutes.`
    );
  }

  const rawIdentifier = body?.emailOrPhone ?? body?.identifier ?? body?.email ?? body?.phone;
  const rawPassword = body?.password;

  if (typeof rawIdentifier !== "string" || !rawIdentifier.trim()) {
    return sendJson(res, 400, { success: false, error: "Please enter your email or phone number." });
  }
  if (rawIdentifier.trim().length > 160) {
    return sendJson(res, 400, { success: false, error: "Identifier exceeds maximum length." });
  }
  if (typeof rawPassword !== "string" || !rawPassword) {
    return sendJson(res, 400, { success: false, error: "Please enter your password." });
  }
  if (rawPassword.length > 128) {
    return sendJson(res, 400, { success: false, error: "Password exceeds maximum length." });
  }

  const rawInput = rawIdentifier.trim();
  const inputPassword = rawPassword;

  const cleanDigits = rawInput.replace(/\D/g, "");
  const trimmedLower = rawInput.toLowerCase();

  const accountKey = `login_acc_${trimmedLower || cleanDigits}`;
  const accountRate = await checkRateLimit(accountKey, 5, 5 * 60 * 1000);
  if (!accountRate.allowed) {
    logSecurityEvent("RATE_LIMIT_EXCEEDED", {
      scope: "login_account",
      ip: clientIp,
      identifier: trimmedLower.slice(0, 3) + "***",
    });
    return sendRateLimitExceeded(
      res,
      accountRate.retryAfterSec,
      `Too many failed login attempts. Please try again in ${Math.ceil(accountRate.retryAfterSec / 60)} minutes.`
    );
  }

  let candidateUsers: any[] = [];
  let usedPostgres = false;
  let dbDownError = false;

  if (pool) {
    try {
      const phoneTail = cleanDigits.length >= 10 ? cleanDigits.slice(-10) : "";
      const usersQuery = `
        SELECT id, email, name, phone, avatar_color, avatar_url, bio, password_hash, COALESCE(token_version, 1) AS token_version, created_at
        FROM public.users
        WHERE LOWER(TRIM(COALESCE(email, ''))) = $1
           OR ($2 <> '' AND RIGHT(regexp_replace(COALESCE(phone, ''), '\\D', '', 'g'), 10) = $2)
        ORDER BY
          CASE WHEN LOWER(TRIM(COALESCE(email, ''))) = $1 THEN 0 ELSE 1 END,
          updated_at DESC NULLS LAST,
          created_at DESC
        LIMIT 5;
      `;
      const userRes = await pool.query(usersQuery, [trimmedLower, phoneTail]);
      candidateUsers = userRes.rows || [];
      usedPostgres = true;
    } catch {
      dbDownError = true;
    }
  } else {
    dbDownError = true;
  }

  if (candidateUsers.length === 0 && process.env.NODE_ENV !== "production") {
    const localUser = findLocalUser(rawInput);
    if (localUser) {
      candidateUsers = [localUser];
    }
  }

  if (candidateUsers.length === 0) {
    const supabaseUrl = (
      process.env.VITE_SUPABASE_URL ||
      process.env.NEXT_PUBLIC_SUPABASE_URL ||
      process.env.SUPABASE_URL ||
      ""
    ).replace(/\/$/, "");
    const supabaseKey = (
      process.env.VITE_SUPABASE_ANON_KEY ||
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
      process.env.SUPABASE_ANON_KEY ||
      ""
    ).trim();
    const serviceRoleKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();

    if (supabaseUrl && supabaseKey) {
      try {
        let emailsToTry: string[] = [];
        if (trimmedLower.includes("@")) {
          emailsToTry = [trimmedLower];
        } else if (serviceRoleKey) {
          const rpcRes = await fetch(`${supabaseUrl}/rest/v1/rpc/resolve_email_for_login`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              apikey: serviceRoleKey,
              Authorization: `Bearer ${serviceRoleKey}`,
            },
            body: JSON.stringify({ p_identifier: rawInput }),
          });
          if (rpcRes.ok) {
            const rows = await rpcRes.json();
            if (Array.isArray(rows)) {
              emailsToTry = rows.map((r: any) => String(r?.email || "").trim().toLowerCase()).filter(Boolean);
            }
          }
        }

        for (const emailCandidate of emailsToTry) {
          const tokenRes = await fetch(`${supabaseUrl}/auth/v1/token?grant_type=password`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              apikey: supabaseKey,
            },
            body: JSON.stringify({
              email: emailCandidate,
              password: inputPassword,
            }),
          });

          if (tokenRes.ok) {
            const authData = await tokenRes.json();
            const supaUser = authData?.user;
            const accessToken = authData?.access_token;
            if (supaUser && supaUser.id) {
              let profileRow: any = null;
              if (accessToken) {
                try {
                  const profRes = await fetch(
                    `${supabaseUrl}/rest/v1/users?id=eq.${encodeURIComponent(supaUser.id)}&select=id,name,email,phone,avatar_color,avatar_url,bio,created_at`,
                    {
                      headers: {
                        apikey: supabaseKey,
                        Authorization: `Bearer ${accessToken}`,
                      },
                    }
                  );
                  if (profRes.ok) {
                    const profRows = await profRes.json();
                    if (Array.isArray(profRows) && profRows[0]) {
                      profileRow = profRows[0];
                    }
                  }
                } catch {}
              }

              const meta = supaUser.user_metadata || {};
              const userAccount = {
                id: profileRow?.id || supaUser.id,
                name: profileRow?.name || meta.name || (supaUser.email ? supaUser.email.split("@")[0] : "Traveler"),
                email: profileRow?.email || supaUser.email || emailCandidate,
                phone: profileRow?.phone || meta.phone || undefined,
                avatarColor: profileRow?.avatar_color || meta.avatarColor || meta.avatar_color || "#E39A2D",
                avatarUrl: profileRow?.avatar_url || meta.avatarUrl || undefined,
                bio: profileRow?.bio || meta.bio || "Travel Enthusiast",
                createdAt: profileRow?.created_at || supaUser.created_at || new Date().toISOString(),
              };

              await resetRateLimit(accountKey);
              logSecurityEvent("AUTH_LOGIN_SUCCESS", {
                ip: clientIp,
                userId: userAccount.id,
                via: "supabase_https_fallback",
              });

              const sessionToken = generateSessionToken(userAccount.id, userAccount.email, userAccount.name, 1);
              setSessionCookie(res, sessionToken);
              return sendJson(res, 200, {
                success: true,
                user: userAccount,
              });
            }
          }
        }
      } catch {}
    } else if (process.env.NODE_ENV === "production" && dbDownError) {
      return sendJson(res, 503, { success: false, error: "Database unavailable" });
    }
  }

  if (process.env.NODE_ENV === "production" && dbDownError && candidateUsers.length === 0) {
    return sendJson(res, 503, { success: false, error: "Database unavailable" });
  }

  if (candidateUsers.length === 0) {
    logSecurityEvent("AUTH_LOGIN_FAILED", {
      ip: clientIp,
      identifier: trimmedLower.slice(0, 3) + "***",
      reason: "user_not_found",
    });
    return sendJson(res, 401, {
      success: false,
      error: "Invalid email/phone or password. Please verify your credentials or create an account.",
    });
  }

  let foundUser: any = candidateUsers[0];
  let passCheck = verifyPasswordMatchNode(inputPassword, foundUser.password_hash);

  if (!passCheck.valid && candidateUsers.length > 1) {
    for (let i = 1; i < candidateUsers.length; i++) {
      const check = verifyPasswordMatchNode(inputPassword, candidateUsers[i].password_hash);
      if (check.valid) {
        foundUser = candidateUsers[i];
        passCheck = check;
        break;
      }
    }
  }

  if (!passCheck.valid) {
    logSecurityEvent("AUTH_LOGIN_FAILED", { ip: clientIp, userId: foundUser.id, reason: "invalid_password" });
    return sendJson(res, 401, {
      success: false,
      error: "Invalid email/phone or password. Please verify your credentials or create an account.",
    });
  }

  await resetRateLimit(accountKey);
  logSecurityEvent("AUTH_LOGIN_SUCCESS", {
    ip: clientIp,
    userId: foundUser.id,
    rehashUpgraded: passCheck.needsRehash,
  });

  if (passCheck.needsRehash || !foundUser.password_hash?.startsWith("$2")) {
    const modernHash = hashPasswordNode(inputPassword);
    if (usedPostgres && pool) {
      try {
        await pool.query("UPDATE public.users SET password_hash = $1, updated_at = NOW() WHERE id = $2;", [
          modernHash,
          foundUser.id,
        ]);
      } catch {}
    }
    if (process.env.NODE_ENV !== "production") {
      foundUser.password_hash = modernHash;
      saveLocalUser(foundUser);
    }
  }

  await linkUserToTripMembersInDb(pool, foundUser.id, foundUser.email, foundUser.phone, foundUser.name);

  const userAccount = {
    id: foundUser.id,
    name: foundUser.name || (foundUser.email ? foundUser.email.split("@")[0] : "Traveler"),
    email: foundUser.email || (trimmedLower.includes("@") ? trimmedLower : ""),
    phone: foundUser.phone || undefined,
    avatarColor: foundUser.avatar_color || "#E39A2D",
    avatarUrl: foundUser.avatar_url || undefined,
    bio: foundUser.bio || "Travel Enthusiast",
    createdAt: foundUser.created_at || new Date().toISOString(),
  };

  const tokenVersion = Number(foundUser.token_version || 1);
  const sessionToken = generateSessionToken(foundUser.id, foundUser.email, foundUser.name, tokenVersion);
  setSessionCookie(res, sessionToken);
  return sendJson(res, 200, { success: true, user: userAccount });
}
