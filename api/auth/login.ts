import {
  pool,
  hashPasswordNode,
  verifyPasswordMatchNode,
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
  const { emailOrPhone, password } = body;
  const rawInput = (emailOrPhone || "").trim();
  const inputPassword = password || "";

  if (!rawInput) {
    return sendJson(res, 400, { success: false, error: "Please enter your email or phone number." });
  }
  if (!inputPassword) {
    return sendJson(res, 400, { success: false, error: "Please enter your password." });
  }

  const cleanDigits = rawInput.replace(/\D/g, "");
  const trimmedLower = rawInput.toLowerCase();

  if (!pool) {
    return sendJson(res, 503, { success: false, error: "Database connection not initialized." });
  }

  try {
    const usersQuery = `
      SELECT id, email, name, phone, avatar_color, avatar_url, bio, password_hash, created_at
      FROM public.users
      WHERE LOWER(TRIM(COALESCE(email, ''))) = $1
         OR ($2 <> '' AND regexp_replace(COALESCE(phone, ''), '\\D', '', 'g') LIKE '%' || $2 || '%')
         OR LOWER(TRIM(COALESCE(name, ''))) = $1
      LIMIT 1;
    `;
    const userRes = await pool.query(usersQuery, [trimmedLower, cleanDigits.length >= 7 ? cleanDigits : ""]);
    let foundUser = userRes.rows[0];

    if (!foundUser && cleanDigits.length >= 7) {
      const allUsersRes = await pool.query(
        "SELECT id, email, name, phone, avatar_color, avatar_url, bio, password_hash, created_at FROM public.users LIMIT 200;"
      );
      foundUser = allUsersRes.rows.find((u) => {
        const uPhone = (u.phone || "").replace(/\D/g, "");
        return uPhone.length >= 7 && (uPhone.endsWith(cleanDigits) || cleanDigits.endsWith(uPhone));
      });
    }

    if (!foundUser) {
      try {
        const memberRes = await pool.query(
          `SELECT id, user_id, name, email, phone, avatar_color, joined_at
           FROM public.trip_members
           WHERE LOWER(TRIM(COALESCE(email, ''))) = $1
              OR ($2 <> '' AND regexp_replace(COALESCE(phone, ''), '\\D', '', 'g') LIKE '%' || $2 || '%')
           LIMIT 1;`,
          [trimmedLower, cleanDigits.length >= 7 ? cleanDigits : ""]
        );
        const foundMember = memberRes.rows[0];
        if (foundMember) {
          const newUserId = foundMember.user_id || foundMember.id || `u_${Date.now()}`;
          const newHashed = hashPasswordNode(inputPassword);
          await pool.query(
            `INSERT INTO public.users (id, email, name, phone, avatar_color, password_hash, created_at, updated_at)
             VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())
             ON CONFLICT (id) DO UPDATE SET password_hash = $6;`,
            [
              newUserId,
              foundMember.email || (trimmedLower.includes("@") ? trimmedLower : null),
              foundMember.name || "Traveler",
              foundMember.phone || (cleanDigits.length >= 7 ? rawInput : null),
              foundMember.avatar_color || "#E39A2D",
              newHashed,
            ]
          );

          const sessionToken = generateSessionToken(newUserId, foundMember.email, foundMember.name);
          return sendJson(res, 200, {
            success: true,
            token: sessionToken,
            user: {
              id: newUserId,
              name: foundMember.name || "Traveler",
              email: foundMember.email || (trimmedLower.includes("@") ? trimmedLower : ""),
              phone: foundMember.phone || undefined,
              avatarColor: foundMember.avatar_color || "#E39A2D",
              bio: "Travel Enthusiast",
              createdAt: foundMember.joined_at || new Date().toISOString(),
            },
          });
        }
      } catch (e) {
        console.warn("Notice querying trip_members:", e);
      }
    }

    if (!foundUser) {
      return sendJson(res, 404, {
        success: false,
        error: "No account found matching this email or phone number. Please check your credentials or click 'Create Account' to sign up.",
      });
    }

    const isPassValid = verifyPasswordMatchNode(inputPassword, foundUser.password_hash);
    if (!isPassValid) {
      return sendJson(res, 401, {
        success: false,
        error: "Incorrect password for this account. Please verify your password or use 'Forgot Password?' to reset it.",
      });
    }

    const modernHash = hashPasswordNode(inputPassword);
    if (foundUser.password_hash !== modernHash) {
      try {
        await pool.query("UPDATE public.users SET password_hash = $1, updated_at = NOW() WHERE id = $2;", [
          modernHash,
          foundUser.id,
        ]);
      } catch (e) {}
    }

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

    const sessionToken = generateSessionToken(foundUser.id, foundUser.email, foundUser.name);
    return sendJson(res, 200, { success: true, token: sessionToken, user: userAccount });
  } catch (err: any) {
    console.error("Error in /api/auth/login:", err);
    return sendJson(res, 500, { success: false, error: "Internal authentication error. Please try again." });
  }
}
