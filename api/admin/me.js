const { isAdminAuthed } = require("../_lib/admin-auth");

const ADMIN_USER = process.env.ADMIN_USER || "largfrg";
const ADMIN_SESSION_SECRET = process.env.ADMIN_SESSION_SECRET || "dev-admin-secret";

module.exports = async (req, res) => {
  const admin = isAdminAuthed(req, ADMIN_USER, ADMIN_SESSION_SECRET);
  res.json({ ok: true, admin });
};
