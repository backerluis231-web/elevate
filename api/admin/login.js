const { getJsonBody } = require("../_lib/parse-body");
const { isSecureRequest, setSessionCookie, signSession } = require("../_lib/admin-auth");

const ADMIN_USER = process.env.ADMIN_USER || "largfrg";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "7f89#elevate@admin";
const ADMIN_SESSION_SECRET = process.env.ADMIN_SESSION_SECRET || "dev-admin-secret";

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, message: "Method not allowed" });
  }

  const body = await getJsonBody(req);
  const username = String(body.username || "");
  const password = String(body.password || "");

  if (username === ADMIN_USER && password === ADMIN_PASSWORD) {
    const token = signSession(username, ADMIN_SESSION_SECRET);
    setSessionCookie(res, token, isSecureRequest(req));
    return res.json({ ok: true });
  }

  return res.status(401).json({ ok: false, message: "Invalid credentials" });
};
