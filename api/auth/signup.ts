import {
  pool,
  hashPasswordNode,
  validatePasswordStrength,
  generateSessionToken,
  verifyCsrfRequest,
  setSessionCookie,
  setCorsHeaders,
  parseBody,
  sendJson,
  findLocalUser,
  saveLocalUser,
  linkUserToTripMembersInDb,
  checkRateLimit,
  sendRateLimitExceeded,
  getClientIp,
  logSecurityEvent,
  signupBodySchema,
  validateWithSchema,
  withSentry,
  type LocalUserRecord,
} from "../_shared.js";

async function handler(req: any, res: any) {
  setCorsHeaders(res, req);

  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    return res.end();
  }

  if (req.method !== "POST") {
    return sendJson(res, 405, { success: false, error: "Method Not Allowed" });
  }

  const csrf = verifyCsrfRequest(req);
  if (!csrf.valid) {
    return sendJson(res, 403, { success: false, error: csrf.error || "CSRF validation failed" });
  }

  if (process.env.NODE_ENV === "production" && (!process.env.SESSION_SECRET || !process.env.SESSION_SECRET.trim())) {
    console.error("CRITICAL SECURITY ERROR: SESSION_SECRET environment variable is required in production.");
    return sendJson(res, 500, {
      success: false,
      error: "Server configuration error: SESSION_SECRET is missing.",
    });
  }

  const clientIp = getClientIp(req);
  const ipRate = await checkRateLimit(`signup_ip_${clientIp}`, 8, 10 * 60 * 1000);
  if (!ipRate.allowed) {
    logSecurityEvent("RATE_LIMIT_EXCEEDED", { scope: "signup_ip", ip: clientIp });
    return sendRateLimitExceeded(
      res,
      ipRate.retryAfterSec,
      `Too many registration attempts. Please wait ${Math.ceil(ipRate.retryAfterSec / 60)} minutes before trying again.`
    );
  }

  const body = parseBody(req);
  const parsed = validateWithSchema(signupBodySchema, body);
  if (!parsed.success) {
    return sendJson(res, 400, { success: false, error: parsed.error });
  }

  const { name, email, phone, password, avatarColor, bio } = parsed.data;
  const trimmedName = (name || "").trim();
  const trimmedEmail = (email || "").trim().toLowerCase();
  const rawPhone = (phone || "").trim();
  const cleanDigits = rawPhone.replace(/\D/g, "");
  const inputPassword = password || "";

  if (!trimmedName) {
    return sendJson(res, 400, { success: false, error: "Please enter your full name." });
  }
  if (!trimmedEmail || !trimmedEmail.includes("@")) {
    return sendJson(res, 400, { success: false, error: "Please enter a valid email address." });
  }

  const strength = validatePasswordStrength(inputPassword);
  if (!strength.valid) {
    return sendJson(res, 400, {
      success: false,
      error: strength.error || "Password must be at least 8 characters long.",
    });
  }

  if (process.env.NODE_ENV !== "production") {
    const existingLocal = findLocalUser(trimmedEmail) || (cleanDigits.length >= 7 ? findLocalUser(cleanDigits) : null);
    if (existingLocal) {
      return sendJson(res, 409, {
        success: false,
        error: "An account with this email or phone already exists. Please log in with your password.",
      });
    }
  }

  if (pool) {
    try {
      const existingRes = await pool.query(
        `SELECT id, email, phone FROM public.users
         WHERE LOWER(TRIM(email)) = $1
            OR ($2 <> '' AND regexp_replace(COALESCE(phone, ''), '\\D', '', 'g') = $2)
         LIMIT 1;`,
        [trimmedEmail, cleanDigits.length >= 7 ? cleanDigits : ""]
      );

      if (existingRes.rows.length > 0) {
        return sendJson(res, 409, {
          success: false,
          error: "An account with this email or phone already exists. Please log in with your password.",
        });
      }
    } catch {
      if (process.env.NODE_ENV === "production") {
        return sendJson(res, 503, { success: false, error: "Database unavailable" });
      }
    }
  } else if (process.env.NODE_ENV === "production") {
    return sendJson(res, 503, { success: false, error: "Database unavailable" });
  }

  const userId = `u_${Math.random().toString(36).substring(2, 9)}_${Date.now().toString(36)}`;
  const hashedPassword = hashPasswordNode(inputPassword);
  const createdAt = new Date().toISOString();

  if (process.env.NODE_ENV !== "production") {
    const localUserRecord: LocalUserRecord = {
      id: userId,
      email: trimmedEmail,
      name: trimmedName,
      phone: rawPhone || null,
      avatar_color: avatarColor || "#E39A2D",
      bio: bio || "Travel Enthusiast",
      password_hash: hashedPassword,
      created_at: createdAt,
      updated_at: createdAt,
    };
    saveLocalUser(localUserRecord);
  }

  if (pool) {
    try {
      await pool.query(
        `INSERT INTO public.users (id, email, name, phone, avatar_color, bio, password_hash, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW());`,
        [
          userId,
          trimmedEmail,
          trimmedName,
          rawPhone || null,
          avatarColor || "#E39A2D",
          bio || "Travel Enthusiast",
          hashedPassword,
        ]
      );
    } catch {
      if (process.env.NODE_ENV === "production") {
        return sendJson(res, 503, { success: false, error: "Database unavailable" });
      }
    }
  }

  await linkUserToTripMembersInDb(pool, userId, trimmedEmail, rawPhone || null, trimmedName);

  const userAccount = {
    id: userId,
    name: trimmedName,
    email: trimmedEmail,
    phone: rawPhone || undefined,
    avatarColor: avatarColor || "#E39A2D",
    bio: bio || "Travel Enthusiast",
    createdAt,
  };

  logSecurityEvent("AUTH_SIGNUP_SUCCESS", { userId, ip: clientIp });

  const sessionToken = generateSessionToken(userId, trimmedEmail, trimmedName);
  setSessionCookie(res, sessionToken, req);
  return sendJson(res, 200, { success: true, user: userAccount });
}

export default withSentry(handler);
