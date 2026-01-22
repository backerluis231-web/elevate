const crypto = require("crypto");

const COOKIE_NAME = "admin_session";
const MAX_AGE_MS = 1000 * 60 * 60 * 24 * 30;

function parseCookies(header) {
  if (!header) return {};
  return header.split(";").reduce((acc, part) => {
    const [key, ...rest] = part.trim().split("=");
    if (!key) return acc;
    acc[key] = decodeURIComponent(rest.join("="));
    return acc;
  }, {});
}

function signSession(username, secret) {
  const ts = Date.now().toString();
  const sig = crypto.createHmac("sha256", secret).update(`${username}.${ts}`).digest("hex");
  return `${ts}.${sig}`;
}

function verifySession(token, username, secret) {
  if (!token) return false;
  const [ts, sig] = token.split(".");
  if (!ts || !sig) return false;
  const tsNum = Number(ts);
  if (!Number.isFinite(tsNum)) return false;
  if (Date.now() - tsNum > MAX_AGE_MS) return false;
  const expected = crypto.createHmac("sha256", secret).update(`${username}.${ts}`).digest("hex");
  return crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected));
}

function setSessionCookie(res, token, secure) {
  const secureFlag = secure ? " Secure;" : "";
  res.setHeader(
    "Set-Cookie",
    `${COOKIE_NAME}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${Math.floor(MAX_AGE_MS / 1000)};${secureFlag}`
  );
}

function clearSessionCookie(res, secure) {
  const secureFlag = secure ? " Secure;" : "";
  res.setHeader(
    "Set-Cookie",
    `${COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0;${secureFlag}`
  );
}

function isSecureRequest(req) {
  const proto = req.headers["x-forwarded-proto"];
  return proto === "https";
}

function isAdminAuthed(req, adminUser, secret) {
  const cookies = parseCookies(req.headers.cookie || "");
  return verifySession(cookies[COOKIE_NAME], adminUser, secret);
}

module.exports = {
  clearSessionCookie,
  isAdminAuthed,
  isSecureRequest,
  parseCookies,
  setSessionCookie,
  signSession
};
