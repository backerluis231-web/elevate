const { clearSessionCookie, isSecureRequest } = require("../_lib/admin-auth");

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, message: "Method not allowed" });
  }

  clearSessionCookie(res, isSecureRequest(req));
  return res.json({ ok: true });
};
