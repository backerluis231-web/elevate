const { kv } = require("@vercel/kv");
const { getJsonBody } = require("./_lib/parse-body");
const { isAdminAuthed } = require("./_lib/admin-auth");

const ADMIN_USER = process.env.ADMIN_USER || "largfrg";
const ADMIN_SESSION_SECRET = process.env.ADMIN_SESSION_SECRET || "dev-admin-secret";
const LIST_KEY = "coming_soon_emails";

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

module.exports = async (req, res) => {
  if (req.method === "POST") {
    const body = await getJsonBody(req);
    const email = String(body.email || "").trim().toLowerCase();
    if (!isValidEmail(email)) {
      return res.status(400).json({ ok: false, message: "Invalid email" });
    }

    const exists = await kv.hget(LIST_KEY, email);
    if (!exists) {
      await kv.hset(LIST_KEY, { [email]: new Date().toISOString() });
    }
    return res.json({ ok: true });
  }

  if (req.method === "GET") {
    if (!isAdminAuthed(req, ADMIN_USER, ADMIN_SESSION_SECRET)) {
      return res.status(401).json({ ok: false, message: "Unauthorized" });
    }
    const data = await kv.hgetall(LIST_KEY);
    const list = Object.entries(data || {}).map(([email, createdAt]) => ({
      email,
      createdAt
    }));
    return res.json({ ok: true, data: list });
  }

  return res.status(405).json({ ok: false, message: "Method not allowed" });
};
