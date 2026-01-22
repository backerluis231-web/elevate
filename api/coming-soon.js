const { getJsonBody } = require("./_lib/parse-body");
const { isAdminAuthed } = require("./_lib/admin-auth");
const { getSupabaseAdmin } = require("./_lib/supabase");

const ADMIN_USER = process.env.ADMIN_USER || "largfrg";
const ADMIN_SESSION_SECRET = process.env.ADMIN_SESSION_SECRET || "dev-admin-secret";
const TABLE = "coming_soon_signups";

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

module.exports = async (req, res) => {
  const supabase = getSupabaseAdmin();

  if (req.method === "POST") {
    const body = await getJsonBody(req);
    const email = String(body.email || "").trim().toLowerCase();
    if (!isValidEmail(email)) {
      return res.status(400).json({ ok: false, message: "Invalid email" });
    }

    const { error } = await supabase
      .from(TABLE)
      .upsert({ email, created_at: new Date().toISOString() }, { onConflict: "email" });

    if (error) {
      return res.status(500).json({ ok: false, message: "Insert failed" });
    }
    return res.json({ ok: true });
  }

  if (req.method === "GET") {
    if (!isAdminAuthed(req, ADMIN_USER, ADMIN_SESSION_SECRET)) {
      return res.status(401).json({ ok: false, message: "Unauthorized" });
    }

    const { data, error } = await supabase
      .from(TABLE)
      .select("email, created_at")
      .order("created_at", { ascending: false });

    if (error) {
      return res.status(500).json({ ok: false, message: "Fetch failed" });
    }

    const list = (data || []).map((row) => ({
      email: row.email,
      createdAt: row.created_at
    }));
    return res.json({ ok: true, data: list });
  }

  return res.status(405).json({ ok: false, message: "Method not allowed" });
};
