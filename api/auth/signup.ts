import {
  pool,
  hashPasswordNode,
  generateSessionToken,
  setCorsHeaders,
  parseBody,
  sendJson,
} from "../_shared.ts";

export default async function handler(req: any, res: any) {
  setCorsHeaders(res);

  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    return res.end();
  }

  if (req.method !== "POST") {
    return sendJson(res, 405, { success: false, error: "Method Not Allowed" });
  }

  const body = parseBody(req);
  const { name, email, phone, password, avatarColor, bio } = body;
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
  if (!inputPassword || inputPassword.length < 6) {
    return sendJson(res, 400, { success: false, error: "Password must be at least 6 characters long." });
  }

  if (!pool) {
    return sendJson(res, 503, { success: false, error: "Database connection not initialized." });
  }

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

    const userId = `u_${Math.random().toString(36).substring(2, 9)}_${Date.now().toString(36)}`;
    const hashedPassword = hashPasswordNode(inputPassword);

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

    const userAccount = {
      id: userId,
      name: trimmedName,
      email: trimmedEmail,
      phone: rawPhone || undefined,
      avatarColor: avatarColor || "#E39A2D",
      bio: bio || "Travel Enthusiast",
      createdAt: new Date().toISOString(),
    };

    const sessionToken = generateSessionToken(userId, trimmedEmail, trimmedName);
    return sendJson(res, 200, { success: true, token: sessionToken, user: userAccount });
  } catch (err: any) {
    console.error("Error in /api/auth/signup:", err);
    return sendJson(res, 500, { success: false, error: "Unable to create account. Please try again." });
  }
}
