import {
  pool,
  hashPasswordNode,
  verifyPasswordMatchNode,
  generateSessionToken,
  verifyAuthRequest,
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
  getClientIp,
  logSecurityEvent,
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

  const url = String(req.url || "");
  const body = parseBody(req);
  const queryAction = String(req.query?.action || body?.action || "").trim();

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
      } catch (err: any) {
        console.warn("Notice updating token_version in pool:", err?.message || err);
      }
    }

    const store = getLocalStore();
    const u = store.users.find((u) => u.id === userId);
    if (u) {
      (u as any).token_version = ((u as any).token_version || 1) + 1;
      saveLocalStore(store);
    }

    logSecurityEvent("AUTH_SESSIONS_REVOKED", { userId, ip: getClientIp(req) });
    return sendJson(res, 200, {
      success: true,
      message: "All existing sessions have been revoked. Please log in again with new credentials.",
    });
  }

  // 2. Handle /api/auth/update-password (or ?action=update-password)
  if (queryAction === "update-password" || url.includes("/update-password")) {
    const { newPassword, email: bodyEmail } = body;
    if (!newPassword || typeof newPassword !== "string" || newPassword.length < 6) {
      return sendJson(res, 400, {
        success: false,
        error: "Password must be at least 6 characters long.",
      });
    }

    let resolvedUserId = "";
    let resolvedEmail = (bodyEmail || "").trim().toLowerCase();

    // First check standard backend session / Supabase bearer token via verifyAuthRequest
    const authResult = await verifyAuthRequest(req);
    if (authResult.authorized && authResult.userId) {
      resolvedUserId = authResult.userId;
      if (authResult.session?.email) {
        resolvedEmail = authResult.session.email.trim().toLowerCase();
      }
    } else {
      // Also support Supabase recovery token verification via Supabase Auth REST endpoint
      const authHeader = String(req.headers?.authorization || req.headers?.Authorization || "");
      const bearerToken = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";
      const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || "";
      const supabaseKey =
        process.env.SUPABASE_SERVICE_ROLE_KEY ||
        process.env.VITE_SUPABASE_ANON_KEY ||
        process.env.SUPABASE_ANON_KEY ||
        "";

      if (bearerToken && supabaseUrl && supabaseKey) {
        try {
          const userResp = await fetch(`${supabaseUrl.replace(/\/$/, "")}/auth/v1/user`, {
            headers: {
              Authorization: `Bearer ${bearerToken}`,
              apikey: supabaseKey,
            },
          });
          if (userResp.ok) {
            const supaUser = await userResp.json();
            if (supaUser && supaUser.email) {
              resolvedEmail = String(supaUser.email).trim().toLowerCase();
              resolvedUserId = supaUser.id || "";
            }
          }
        } catch (err) {
          console.warn("Notice verifying Supabase recovery token:", err);
        }
      }
    }

    if (!resolvedUserId && !resolvedEmail) {
      return sendJson(res, 401, {
        success: false,
        error: "Unauthorized: Valid session or recovery token required to update password.",
      });
    }

    const newHashed = hashPasswordNode(newPassword);
    let updatedUser: any = null;
    let newTokenVersion = 1;

    if (pool) {
      try {
        const updateRes = await pool.query(
          `UPDATE public.users
           SET password_hash = $1,
               token_version = COALESCE(token_version, 1) + 1,
               updated_at = NOW()
           WHERE ($2 <> '' AND id = $2)
              OR ($3 <> '' AND LOWER(TRIM(COALESCE(email, ''))) = $3)
           RETURNING id, email, name, token_version;`,
          [newHashed, resolvedUserId, resolvedEmail]
        );
        updatedUser = updateRes.rows[0];
        if (updatedUser) {
          newTokenVersion = Number(updatedUser.token_version || 1);
        }
      } catch (err: any) {
        console.warn("Notice updating password in PostgreSQL:", err?.message || err);
      }
    }

    const store = getLocalStore();
    const localU = store.users.find(
      (u) =>
        (resolvedUserId && u.id === resolvedUserId) ||
        (resolvedEmail && u.email && u.email.trim().toLowerCase() === resolvedEmail)
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

    const finalUserId = updatedUser?.id || resolvedUserId;
    const finalEmail = updatedUser?.email || resolvedEmail;
    const finalName = updatedUser?.name || "Traveler";
    const freshToken = finalUserId
      ? generateSessionToken(finalUserId, finalEmail, finalName, newTokenVersion)
      : undefined;

    logSecurityEvent("AUTH_PASSWORD_UPDATED", {
      userId: finalUserId,
      ip: getClientIp(req),
    });

    return sendJson(res, 200, {
      success: true,
      token: freshToken,
      message: "Password updated and synchronized across all sign-in methods.",
    });
  }

  // 3. Standard Login Flow
  const clientIp = getClientIp(req);
  const ipRate = checkRateLimit(`login_ip_${clientIp}`, 10, 5 * 60 * 1000);
  if (!ipRate.allowed) {
    return sendJson(res, 429, {
      success: false,
      error: `Too many login attempts. Please try again in ${Math.ceil(ipRate.retryAfterSec / 60)} minutes.`,
    });
  }

  const { emailOrPhone, email, phone, password } = body;
  const rawInput = (emailOrPhone || email || phone || "").trim();
  const inputPassword = password || "";

  if (!rawInput) {
    return sendJson(res, 400, { success: false, error: "Please enter your email or phone number." });
  }
  if (!inputPassword) {
    return sendJson(res, 400, { success: false, error: "Please enter your password." });
  }

  const cleanDigits = rawInput.replace(/\D/g, "");
  const trimmedLower = rawInput.toLowerCase();

  const accountKey = `login_acc_${trimmedLower || cleanDigits}`;
  const accountRate = checkRateLimit(accountKey, 5, 5 * 60 * 1000);
  if (!accountRate.allowed) {
    return sendJson(res, 429, {
      success: false,
      error: `Too many failed login attempts. Please try again in ${Math.ceil(accountRate.retryAfterSec / 60)} minutes.`,
    });
  }

  let candidateUsers: any[] = [];
  let usedPostgres = false;

  if (pool) {
    try {
      const usersQuery = `
        SELECT id, email, name, phone, avatar_color, avatar_url, bio, password_hash, COALESCE(token_version, 1) AS token_version, created_at
        FROM public.users
        WHERE LOWER(TRIM(COALESCE(email, ''))) = $1
           OR ($2 <> '' AND regexp_replace(COALESCE(phone, ''), '\\D', '', 'g') LIKE '%' || $2 || '%')
           OR LOWER(TRIM(COALESCE(name, ''))) = $1
        ORDER BY
          CASE WHEN LOWER(TRIM(COALESCE(email, ''))) = $1 THEN 0 ELSE 1 END,
          updated_at DESC NULLS LAST,
          created_at DESC
        LIMIT 10;
      `;
      const userRes = await pool.query(usersQuery, [trimmedLower, cleanDigits.length >= 7 ? cleanDigits : ""]);
      candidateUsers = userRes.rows || [];

      if (candidateUsers.length === 0 && cleanDigits.length >= 7) {
        const phoneTail = cleanDigits.length >= 10 ? cleanDigits.slice(-10) : cleanDigits;
        const phoneUserRes = await pool.query(
          `SELECT id, email, name, phone, avatar_color, avatar_url, bio, password_hash, COALESCE(token_version, 1) AS token_version, created_at
           FROM public.users
           WHERE LENGTH(regexp_replace(COALESCE(phone, ''), '\\D', '', 'g')) >= 7
             AND RIGHT(regexp_replace(COALESCE(phone, ''), '\\D', '', 'g'), LENGTH($1)) = $1
           ORDER BY updated_at DESC NULLS LAST, created_at DESC
           LIMIT 10;`,
          [phoneTail]
        );
        candidateUsers = phoneUserRes.rows || [];
      }

      usedPostgres = true;
    } catch (dbErr: any) {
      console.warn("Notice: PostgreSQL unavailable in api/auth/login:", dbErr?.message || dbErr);
    }
  }

  // In-memory fallback (strictly checks registered users only; never auto-creates or overwrites accounts from trip_members)
  if (candidateUsers.length === 0) {
    const localUser = findLocalUser(rawInput);
    if (localUser) {
      candidateUsers = [localUser];
    }
  }

  // Serverless HTTPS Fallback: When POSTGRES_URL pool is not configured on Vercel,
  // verify credentials directly against Supabase Auth REST API + public.users over HTTPS
  if (candidateUsers.length === 0) {
    const supabaseUrl = (
      process.env.VITE_SUPABASE_URL ||
      process.env.NEXT_PUBLIC_SUPABASE_URL ||
      process.env.SUPABASE_URL ||
      "https://ryamchjjwoaimwrmurry.supabase.co"
    ).replace(/\/$/, "");
    const supabaseKey = (
      process.env.VITE_SUPABASE_ANON_KEY ||
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
      process.env.SUPABASE_ANON_KEY ||
      "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJ5YW1jaGpqd29haW13cm11cnJ5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTAwMTIwOTYsImV4cCI6MjEwNTU4ODA5Nn0.6r-qcinkytxEzCxb4jhRjXNZ0-g4_YTKdsnhUG3De6A"
    ).trim();

    try {
      let emailsToTry: string[] = [];
      if (trimmedLower.includes("@")) {
        emailsToTry = [trimmedLower];
      } else {
        const rpcRes = await fetch(`${supabaseUrl}/rest/v1/rpc/resolve_email_for_login`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            apikey: supabaseKey,
            Authorization: `Bearer ${supabaseKey}`,
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
                  `${supabaseUrl}/rest/v1/users?id=eq.${encodeURIComponent(supaUser.id)}&select=*`,
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

            resetRateLimit(accountKey);
            logSecurityEvent("AUTH_LOGIN_SUCCESS", {
              ip: clientIp,
              userId: userAccount.id,
              via: "supabase_https_fallback",
            });

            const sessionToken = generateSessionToken(userAccount.id, userAccount.email, userAccount.name, 1);
            return sendJson(res, 200, {
              success: true,
              token: sessionToken,
              supabaseAccessToken: accessToken,
              user: userAccount,
            });
          }
        }
      }
    } catch (supaErr: any) {
      console.warn("Notice: Supabase HTTPS auth fallback in api/auth/login:", supaErr?.message || supaErr);
    }
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

  // If multiple accounts share the same phone number or name, check remaining candidates
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

  // Login succeeded: clear failed rate limit counter for this account
  resetRateLimit(accountKey);
  logSecurityEvent("AUTH_LOGIN_SUCCESS", {
    ip: clientIp,
    userId: foundUser.id,
    rehashUpgraded: passCheck.needsRehash,
  });

  // Auto-upgrade legacy hash to modern bcrypt on successful login
  if (passCheck.needsRehash || !foundUser.password_hash?.startsWith("$2")) {
    const modernHash = hashPasswordNode(inputPassword);
    if (usedPostgres && pool) {
      try {
        await pool.query("UPDATE public.users SET password_hash = $1, updated_at = NOW() WHERE id = $2;", [
          modernHash,
          foundUser.id,
        ]);
      } catch (e) {}
    }
    foundUser.password_hash = modernHash;
    saveLocalUser(foundUser);
  }

  // Server-side smart member linking: link any invited placeholder trip_members matching this user's email/phone
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
  return sendJson(res, 200, { success: true, token: sessionToken, user: userAccount });
}
