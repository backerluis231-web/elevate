import "dotenv/config";
import express from "express";
import session from "express-session";
import { Issuer, generators } from "openid-client";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const app = express();
const PORT = 3000;
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.join(__dirname, "data");
const comingSoonPath = path.join(dataDir, "coming-soon.json");
const ADMIN_USER = process.env.ADMIN_USER || "largfrg";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "7f89#elevate@admin";

app.use(session({
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    sameSite: "lax",
    secure: false // in production: true (HTTPS)
  }
}));
app.use(express.json());

function requireAdmin(req, res, next) {
  if (!req.session?.admin) {
    return res.status(401).json({ ok: false, message: "Unauthorized" });
  }
  return next();
}

// ---- Discover OIDC providers (Google + Microsoft) ----
const googleIssuer = await Issuer.discover("https://accounts.google.com");
const msIssuer = await Issuer.discover(
  `https://login.microsoftonline.com/${process.env.MICROSOFT_TENANT}/v2.0/.well-known/openid-configuration`
);

const googleClient = new googleIssuer.Client({
  client_id: process.env.GOOGLE_CLIENT_ID,
  client_secret: process.env.GOOGLE_CLIENT_SECRET,
  redirect_uris: [`${process.env.BASE_URL}/auth/google/callback`],
  response_types: ["code"],
});

const msClient = new msIssuer.Client({
  client_id: process.env.MICROSOFT_CLIENT_ID,
  client_secret: process.env.MICROSOFT_CLIENT_SECRET,
  redirect_uris: [`${process.env.BASE_URL}/auth/microsoft/callback`],
  response_types: ["code"],
});

// Helper: start auth with PKCE + state + nonce
function startAuth(req, res, client, provider, scope) {
  const code_verifier = generators.codeVerifier();
  const code_challenge = generators.codeChallenge(code_verifier);
  const state = generators.state();
  const nonce = generators.nonce();

  req.session[provider] = { code_verifier, state, nonce };

  const url = client.authorizationUrl({
    scope,
    state,
    nonce,
    code_challenge,
    code_challenge_method: "S256",
  });

  res.redirect(url);
}

// ---- Routes: Start login ----
app.get("/auth/google", (req, res) => {
  startAuth(req, res, googleClient, "google", "openid email profile");
});

app.get("/auth/microsoft", (req, res) => {
  // minimal scopes for sign-in:
  startAuth(req, res, msClient, "microsoft", "openid profile email");
});

// ---- Routes: Callback ----
async function handleCallback(req, res, client, provider) {
  try {
    const data = req.session[provider];
    if (!data) return res.status(400).send("Missing session state");

    const params = client.callbackParams(req);

    const tokenSet = await client.callback(
      `${process.env.BASE_URL}/auth/${provider}/callback`,
      params,
      { state: data.state, nonce: data.nonce, code_verifier: data.code_verifier }
    );

    const claims = tokenSet.claims();

    req.session.user = {
      provider,
      sub: claims.sub,
      name: claims.name || claims.preferred_username || "User",
      email: claims.email || "",
    };

    // cleanup provider temp data
    delete req.session[provider];

    // back to frontend
    res.redirect("/");
  } catch (e) {
    console.error(e);
    res.status(500).send("Auth callback failed");
  }
}

app.get("/auth/google/callback", (req, res) => handleCallback(req, res, googleClient, "google"));
app.get("/auth/microsoft/callback", (req, res) => handleCallback(req, res, msClient, "microsoft"));

// ---- API: who am I? ----
app.get("/api/me", (req, res) => {
  if (!req.session.user) return res.status(401).json({ ok: false });
  res.json({ ok: true, user: req.session.user });
});

// ---- Logout ----
app.post("/auth/logout", (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});

// ---- API: coming soon signup ----
app.post("/api/coming-soon", async (req, res) => {
  const email = String(req.body?.email || "").trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ ok: false, message: "Invalid email" });
  }

  await fs.mkdir(dataDir, { recursive: true });

  let list = [];
  try {
    const raw = await fs.readFile(comingSoonPath, "utf8");
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) list = parsed;
  } catch {
    list = [];
  }

  if (!list.some((entry) => entry?.email === email)) {
    list.push({ email, createdAt: new Date().toISOString() });
    await fs.writeFile(comingSoonPath, JSON.stringify(list, null, 2), "utf8");
  }

  return res.json({ ok: true });
});

app.get("/api/coming-soon", requireAdmin, async (_req, res) => {
  try {
    const raw = await fs.readFile(comingSoonPath, "utf8");
    const parsed = JSON.parse(raw);
    const list = Array.isArray(parsed) ? parsed : [];
    return res.json({ ok: true, data: list });
  } catch {
    return res.json({ ok: true, data: [] });
  }
});

app.post("/api/admin/login", (req, res) => {
  const user = String(req.body?.username || "");
  const pass = String(req.body?.password || "");
  if (user === ADMIN_USER && pass === ADMIN_PASSWORD) {
    req.session.admin = true;
    return res.json({ ok: true });
  }
  return res.status(401).json({ ok: false, message: "Invalid credentials" });
});

app.post("/api/admin/logout", (req, res) => {
  req.session.admin = false;
  res.json({ ok: true });
});

app.get("/api/admin/me", (req, res) => {
  res.json({ ok: true, admin: Boolean(req.session?.admin) });
});

// Serve your static files (index.html, css, js) from project root
app.use(express.static(new URL("..", import.meta.url).pathname));

app.listen(PORT, () => console.log(`Auth server running on http://localhost:${PORT}`));
