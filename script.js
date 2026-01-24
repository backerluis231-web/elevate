/*******************************
 * Elevate - script.js (Supabase Auth)
 * Uses Supabase OAuth providers.
 *******************************/

const LS = {
  theme: "elevate_theme",
  skills: "elevate_skills", // legacy
  skillCatalog: "elevate_skill_catalog",
  userSkills: "elevate_user_skills",
  skillAnalyses: "elevate_skill_analyses",
  localUserId: "elevate_local_user_id",
  view: "elevate_view",
  selectedSkillId: "elevate_selected_skill_id",
  quests: "elevate_quests", // { [userSkillId]: Quest[] }
  lastLevel: "elevate_last_level",
  sidebarCollapsed: "elevate_sidebar_collapsed"
};

function $(id){ return document.getElementById(id); }
function saveJSON(key, val){ localStorage.setItem(key, JSON.stringify(val)); }
function loadJSON(key, fallback){
  try { return JSON.parse(localStorage.getItem(key)) ?? fallback; }
  catch { return fallback; }
}
function clamp(n, min, max){ return Math.max(min, Math.min(max, n)); }
function escapeHTML(str){
  return String(str)
    .replaceAll("&","&amp;")
    .replaceAll("<","&lt;")
    .replaceAll(">","&gt;")
    .replaceAll('"',"&quot;")
    .replaceAll("'","&#039;");
}
function uid(){
  if (crypto?.randomUUID) return crypto.randomUUID();
  if (!crypto?.getRandomValues) {
    return String(Date.now()) + "_" + Math.random().toString(16).slice(2);
  }
  const buf = new Uint8Array(16);
  crypto.getRandomValues(buf);
  buf[6] = (buf[6] & 0x0f) | 0x40;
  buf[8] = (buf[8] & 0x3f) | 0x80;
  const hex = Array.from(buf, b => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
function sleep(ms){ return new Promise(r => setTimeout(r, ms)); }

let currentUser = null;
function setCurrentUser(user){ currentUser = user || null; }
function getLocalUserId(){
  let id = localStorage.getItem(LS.localUserId);
  if (!id) {
    id = uid();
    localStorage.setItem(LS.localUserId, id);
  }
  return id;
}
function getCurrentUserId(){
  return currentUser?.id || getLocalUserId();
}

function isSupabaseReady(){
  return Boolean(supabaseClient && currentUser);
}

function getSkillAnalysisMap(){ return loadJSON(LS.skillAnalyses, {}); }
function setSkillAnalysisMap(map){ saveJSON(LS.skillAnalyses, map); }

const RANKS = ["Bronze", "Silber", "Gold", "Platin", "Champion"];
function getRankLabel(index){
  const safe = clamp(Number(index) || 0, 0, RANKS.length - 1);
  return RANKS[safe];
}
function getSkillDifficultyScore(skillId){
  const analysis = getSkillAnalysisMap()[skillId];
  const score = Number(analysis?.difficultyScore ?? 5);
  return clamp(score, 1, 10);
}
function applyDifficultyToPoints(points, difficultyScore){
  if (!Number.isFinite(points)) return 0;
  if (points === 0) return 0;
  if (points < 0) return points;
  const scale = 1 + (difficultyScore - 5) * 0.08;
  return Math.max(1, Math.round(points / Math.max(0.4, scale)));
}

/* ========= Toasts ========= */
const toastsEl = $("toasts");
function toast(title, sub){
  if (!toastsEl) return;
  const el = document.createElement("div");
  el.className = "toast";
  el.innerHTML = `
    <div class="toast-title">${escapeHTML(title)}</div>
    ${sub ? `<div class="toast-sub">${escapeHTML(sub)}</div>` : ""}
  `;
  toastsEl.appendChild(el);

  setTimeout(() => {
    el.style.opacity = "0";
    el.style.transform = "translateY(6px)";
    el.style.transition = "opacity 180ms ease, transform 180ms ease";
  }, 2200);

  setTimeout(() => el.remove(), 2500);
}

/* ========= Landing Reveal ========= */
document.documentElement.classList.add("js");
const autoReveal = document.querySelectorAll(
  "body:not(.authed) .section-head, " +
  "body:not(.authed) .problem-card, " +
  "body:not(.authed) .solution-card, " +
  "body:not(.authed) .process-head, " +
  "body:not(.authed) .process-step, " +
  "body:not(.authed) .process-demo, " +
  "body:not(.authed) .signal-copy, " +
  "body:not(.authed) .signal-line, " +
  "body:not(.authed) .proof-stat, " +
  "body:not(.authed) .proof-panel, " +
  "body:not(.authed) .proof-logos, " +
  "body:not(.authed) .proof-tabs, " +
  "body:not(.authed) .proof-tab-buttons, " +
  "body:not(.authed) .price-card, " +
  "body:not(.authed) .price-mini, " +
  "body:not(.authed) .price-tag, " +
  "body:not(.authed) .faq-feature, " +
  "body:not(.authed) .faq-item, " +
  "body:not(.authed) .cta-panel, " +
  "body:not(.authed) .cta-copy, " +
  "body:not(.authed) .cta-points, " +
  "body:not(.authed) .cta-actions, " +
  "body:not(.authed) .cta-mini-proof, " +
  "body:not(.authed) .footer-layout"
);
autoReveal.forEach(el => el.classList.add("reveal"));
const reveals = document.querySelectorAll(".reveal");
const io = new IntersectionObserver((entries) => {
  for (const e of entries) {
    e.target.classList.toggle("show", e.isIntersecting);
  }
}, { threshold: 0.18, rootMargin: "0px 0px -8% 0px" });
reveals.forEach(el => io.observe(el));

/* ========= Hero Particles (public) ========= */
function initHeroParticles(){
  if (document.body.classList.contains("authed")) return;
  if (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const wrap = document.querySelector(".hero-sentence-wrap");
  if (!wrap || wrap.querySelector(".hero-particles")) return;

  const canvas = document.createElement("canvas");
  canvas.className = "hero-particles";
  wrap.appendChild(canvas);
  const ctx = canvas.getContext("2d");
  let w = 0;
  let h = 0;
  let dpr = window.devicePixelRatio || 1;
  let target = { x: 0, y: 0, r: 24 };
  let targetRect = null;
  const targetEl = document.querySelector(".hero-sentence span");

  function updateTarget(){
    const rect = wrap.getBoundingClientRect();
    w = rect.width;
    h = rect.height;
    dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    if (targetEl) {
      const t = targetEl.getBoundingClientRect();
      const cs = getComputedStyle(targetEl);
      const em = parseFloat(cs.fontSize) || 16;
      const parentLeft = t.left - rect.left;
      const parentRight = parentLeft + t.width;
      const parentTop = t.top - rect.top;
      const parentBottom = t.bottom - rect.top;

      function num(val){
        const n = Number.parseFloat(val);
        return Number.isFinite(n) ? n : null;
      }
      function pseudoBox(ps){
        const height = num(ps.height);
        const bottomOffset = num(ps.bottom);
        if (height == null || bottomOffset == null) return null;
        const bottom = parentBottom - bottomOffset;
        return { top: bottom - height, bottom };
      }

      const before = getComputedStyle(targetEl, "::before");
      const after = getComputedStyle(targetEl, "::after");

      const leftPad = Math.max(
        0,
        -(num(before.left) ?? 0),
        -(num(after.left) ?? 0),
        0.2 * em
      );
      const rightPad = Math.max(
        0,
        -(num(before.right) ?? 0),
        -(num(after.right) ?? 0),
        0.2 * em
      );

      const beforeRect = pseudoBox(before);
      const afterRect = pseudoBox(after);
      let top = parentTop + 0.12 * em;
      let bottom = top + Math.max(18, 0.9 * em);
      if (beforeRect || afterRect) {
        top = Math.min(beforeRect?.top ?? parentTop, afterRect?.top ?? parentTop);
        bottom = Math.max(beforeRect?.bottom ?? parentBottom, afterRect?.bottom ?? parentBottom);
      }

      const left = parentLeft - leftPad;
      const right = parentRight + rightPad;
      if (targetEl.matches(".hero-sentence span")) {
        const offset = -0.02 * em;
        const height = Math.max(10, 0.5 * em);
        targetRect = { left, top: bottom + offset, right, bottom: bottom + offset + height };
        target.x = (left + right) / 2 + 0.65 * em;
        target.y = (targetRect.top + targetRect.bottom) / 2;
      } else {
        targetRect = { left, top, right, bottom };
        target.x = (left + right) / 2;
        target.y = (top + bottom) / 2;
      }
      target.r = Math.max(10, Math.min(20, (right - left) * 0.2));
    } else {
      target.x = w / 2;
      target.y = h / 2;
      target.r = Math.max(18, Math.min(w, h) * 0.12);
      targetRect = null;
    }
  }
  updateTarget();
  window.addEventListener("resize", updateTarget);

  const particles = [];
  let lastTime = performance.now();
  let spawnAcc = 0;

  function parseRgb(str, fallback){
    const parts = str.split(",").map(s => Number(s.trim()));
    if (parts.length === 3 && parts.every(n => Number.isFinite(n))) return parts;
    return fallback;
  }

  function spawn(){
    const pad = 16;
    const side = Math.floor(Math.random() * 4);
    let x = 0;
    let y = 0;
    if (side === 0) { x = Math.random() * w; y = -pad; }
    if (side === 1) { x = w + pad; y = Math.random() * h; }
    if (side === 2) { x = Math.random() * w; y = h + pad; }
    if (side === 3) { x = -pad; y = Math.random() * h; }
    const dx = target.x - x;
    const dy = target.y - y;
    const dist = Math.hypot(dx, dy) || 1;
    const speed = 46 + Math.random() * 60;
    const vx = (dx / dist) * speed;
    const vy = (dy / dist) * speed;
    particles.push({
      x,
      y,
      vx,
      vy,
      size: 1.1 + Math.random() * 1.2,
      color: Math.floor(Math.random() * 3)
    });
  }

  function tick(now){
    updateTarget();
    const dt = Math.min(0.033, (now - lastTime) / 1000);
    lastTime = now;
    spawnAcc += dt;
    while (spawnAcc > 0.08) {
      spawn();
      spawnAcc -= 0.08;
    }

    ctx.clearRect(0, 0, w, h);

    const style = getComputedStyle(document.body);
    const accent = parseRgb(style.getPropertyValue("--accent-rgb") || "14,165,233", [14, 165, 233]);
    const accent2 = parseRgb(style.getPropertyValue("--accent2-rgb") || "125,211,252", [125, 211, 252]);
    const neutral = [31, 35, 40];
    const colors = [accent, accent2, neutral];

    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      const dx = target.x - p.x;
      const dy = target.y - p.y;
      const dist = Math.hypot(dx, dy) || 1;
      const pull = Math.min(120, 30 + (1 - Math.min(dist / Math.max(w, h), 1)) * 120);
      p.vx += (dx / dist) * pull * dt;
      p.vy += (dy / dist) * pull * dt;
      p.vx *= 0.985;
      p.vy *= 0.985;
      p.x += p.vx * dt;
      p.y += p.vy * dt;

      const distAfter = Math.hypot(target.x - p.x, target.y - p.y);
      const maxDist = Math.max(w, h) * 0.75;
      const alpha = Math.max(0, Math.min(1, distAfter / maxDist));
      const opacity = 0.2 + alpha * 0.8;

      const hitRect = targetRect
        ? (p.x >= targetRect.left && p.x <= targetRect.right && p.y >= targetRect.top && p.y <= targetRect.bottom)
        : false;
      if (hitRect || distAfter < target.r) {
        particles.splice(i, 1);
        continue;
      }

      const c = colors[p.color];
      ctx.fillStyle = `rgba(${c[0]},${c[1]},${c[2]},${opacity})`;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
    }

    requestAnimationFrame(tick);
  }

  requestAnimationFrame(tick);
}
initHeroParticles();

/* ========= Feature Showcase ========= */
function initFeatureShowcase(){
  const tabs = Array.from(document.querySelectorAll(".feature-tab"));
  if (!tabs.length) return;
  const story = document.querySelector(".feature-story");
  const panels = Array.from(document.querySelectorAll(".story-panel"));
  if (!story || !panels.length) return;

  function setActive(tab){
    tabs.forEach(t => {
      const isActive = t === tab;
      t.classList.toggle("active", isActive);
      t.setAttribute("aria-selected", isActive ? "true" : "false");
    });
    const key = tab.dataset.story;
    panels.forEach(panel => {
      panel.classList.toggle("active", panel.dataset.story === key);
    });
    story.classList.remove("is-swapping");
    void story.offsetWidth;
    story.classList.add("is-swapping");
  }

  tabs.forEach(tab => {
    tab.addEventListener("click", () => setActive(tab));
    tab.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        setActive(tab);
      }
    });
  });
}
initFeatureShowcase();

/* ========= Orbit Showcase ========= */
function initOrbitShowcase(){
  const steps = Array.from(document.querySelectorAll(".lab-tab"));
  const panels = Array.from(document.querySelectorAll(".lab-panel"));
  if (!steps.length || !panels.length) return;

  function setActive(step){
    steps.forEach(btn => {
      const isActive = btn === step;
      btn.classList.toggle("active", isActive);
      btn.setAttribute("aria-selected", isActive ? "true" : "false");
    });
    const key = step.dataset.orbit;
    panels.forEach(panel => {
      panel.classList.toggle("active", panel.dataset.orbit === key);
    });
  }

  steps.forEach(step => {
    step.addEventListener("click", () => setActive(step));
    step.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        setActive(step);
      }
    });
  });
}
initOrbitShowcase();


/* ========= Theme ========= */
function applyTheme(theme){
  if (theme === "dark") document.body.setAttribute("data-theme", "dark");
  else document.body.removeAttribute("data-theme");
  localStorage.setItem(LS.theme, theme);
}
applyTheme(localStorage.getItem(LS.theme) || "light");
$("themeToggle")?.addEventListener("click", () => {
  const isDark = document.body.getAttribute("data-theme") === "dark";
  applyTheme(isDark ? "light" : "dark");
});

/* ========= Login (page section) ========= */
const emailLogin = $("emailLogin");
const passwordLogin = $("passwordLogin");
const loginEmailBtn = $("loginEmailBtn");
const signupEmailBtn = $("signupEmailBtn");
const resetPasswordBtn = $("resetPasswordBtn");
const signupEmailBtnPrimary = $("signupEmailBtnPrimary");
const backToLoginBtn = $("backToLoginBtn");
const signupExtras = $("signupExtras");
const loginActions = $("loginActions");
const signupActions = $("signupActions");
const oauthBlock = $("oauthBlock");
const oauthDivider = $("oauthDivider");
const fullName = $("fullName");
const userName = $("userName");

function setSignupMode(active){
  if (!signupExtras || !loginActions || !signupActions) return;
  signupExtras.classList.toggle("hidden", !active);
  loginActions.classList.toggle("hidden", active);
  signupActions.classList.toggle("hidden", !active);
  oauthBlock?.classList.toggle("hidden", active);
  oauthDivider?.classList.toggle("hidden", active);
}
signupEmailBtn?.addEventListener("click", () => setSignupMode(true));
backToLoginBtn?.addEventListener("click", () => setSignupMode(false));
signupEmailBtnPrimary?.addEventListener("click", () => emailAuth("signup"));

/* ========= Supabase Auth ========= */
const SUPABASE_URL = "https://rippjxcshbgynurtttar.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJpcHBqeGNzaGJneW51cnR0dGFyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjgyMzYxMjIsImV4cCI6MjA4MzgxMjEyMn0.dtkW8ENJldBYkYwOa5IfB7E2GHI5LOaFuce5-ovM2W4";
const supabaseClient = window.supabase?.createClient
  ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
  : null;

const googleLoginBtn = $("googleLoginBtn");
const microsoftLoginBtn = $("microsoftLoginBtn");
const logoutTop = $("logoutTop");
const logoutSide = $("logoutSide");
const userNameLabel = $("userNameLabel");
const userEmailLabel = $("userEmailLabel");
const avatarInitials = $("avatarInitials");
const settingsUsername = $("settingsUsername");
const settingsFullName = $("settingsFullName");
const settingsEmail = $("settingsEmail");
const saveProfileBtn = $("saveProfileBtn");

function getInitials(name, email){
  const base = (name || "").trim();
  if (base) {
    const parts = base.split(/\s+/).filter(Boolean);
    if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    return parts[0].slice(0, 2).toUpperCase();
  }
  if (email) return email.slice(0, 2).toUpperCase();
  return "EU";
}

function displayUser(user){
  const meta = user.user_metadata || {};
  const email = user.email || "";
  const emailName = email ? email.split("@")[0] : "";
  const display = meta.username || meta.full_name || meta.name || emailName || email || "User";
  if (userNameLabel) userNameLabel.textContent = display;
  if (userEmailLabel) {
    userEmailLabel.textContent = email;
    userEmailLabel.title = email;
  }
  if (avatarInitials) avatarInitials.textContent = getInitials(display, user.email);
  if (settingsUsername) settingsUsername.value = meta.username || "";
  if (settingsFullName) settingsFullName.value = meta.full_name || meta.name || "";
  if (settingsEmail) settingsEmail.value = email;
}

async function isUsernameAvailable(username){
  if (!supabaseClient) return false;
  const { data, error } = await supabaseClient
    .from("profiles")
    .select("id")
    .eq("username", username)
    .maybeSingle();
  if (error) {
    toast("Fehler", "Profiles Tabelle fehlt oder keine Berechtigung.");
    return false;
  }
  return !data;
}

async function syncProfile(user){
  if (!supabaseClient || !user) return;
  const meta = user.user_metadata || {};
  const username = (meta.username || "").trim();
  const fullName = (meta.full_name || meta.name || "").trim();
  if (!username) return;
  await supabaseClient
    .from("profiles")
    .upsert({ id: user.id, username, full_name: fullName, email: user.email || "" }, { onConflict: "id" });
}

async function checkAuth() {
  try {
    if (!supabaseClient) {
      document.body.classList.remove("authed");
      setCurrentUser(null);
      return null;
    }
    const { data, error } = await supabaseClient.auth.getSession();
    if (error || !data?.session) {
      document.body.classList.remove("authed");
      setCurrentUser(null);
      return null;
    }
    const user = data.session.user;
    document.body.classList.add("authed");
    setCurrentUser(user);
    displayUser(user);
    syncProfile(user);
    return user;
  } catch {
    document.body.classList.remove("authed");
    setCurrentUser(null);
    return null;
  }
}

async function startOAuth(provider){
  if (!supabaseClient) {
    toast("Login Fehler", "Supabase nicht geladen.");
    return;
  }
  const { error } = await supabaseClient.auth.signInWithOAuth({
    provider,
    options: { redirectTo: window.location.origin + "/index.html" }
  });
  if (error) toast("Login fehlgeschlagen", error.message);
}

async function resolveLoginEmail(identifier){
  const value = (identifier || "").trim();
  if (!value) return "";
  if (value.includes("@")) return value;
  if (!supabaseClient) return "";

  const { data, error } = await supabaseClient
    .from("profiles")
    .select("email")
    .eq("username", value)
    .maybeSingle();
  if (error || !data?.email) return "";
  return data.email;
}

async function emailAuth(mode){
  if (!supabaseClient) {
    toast("Login Fehler", "Supabase nicht geladen.");
    return;
  }
  const identifier = (emailLogin?.value || "").trim();
  const password = (passwordLogin?.value || "").trim();
  if (!identifier || !password) {
    toast("Fehlende Daten", "E-Mail/Username und Passwort eingeben.");
    return;
  }
  const email = await resolveLoginEmail(identifier);
  if (!email) {
    toast("Login fehlgeschlagen", "E-Mail oder Username nicht gefunden.");
    return;
  }

  if (mode === "signup") {
    const username = (userName?.value || "").trim();
    const fullNameValue = (fullName?.value || "").trim();
    if (!username) {
      toast("Fehlender Username", "Bitte einen Username eingeben.");
      return;
    }
    if (!/^[a-zA-Z0-9._-]{3,20}$/.test(username)) {
      toast("Ungültiger Username", "3-20 Zeichen: a-z, 0-9, Punkt, Bindestrich, Unterstrich.");
      return;
    }
    const available = await isUsernameAvailable(username);
    if (!available) {
      toast("Username vergeben", "Bitte einen anderen Wählen.");
      return;
    }
    const { data, error } = await supabaseClient.auth.signUp({
      email,
      password,
      options: { data: { username, full_name: fullNameValue } }
    });
    if (error) {
      const msg = (error.message || "").toLowerCase();
      if (msg.includes("already registered") || msg.includes("already exists") || msg.includes("user already")) {
        toast("E-Mail bereits registriert", "Bitte einloggen oder Passwort zurücksetzen.");
      } else {
        toast("Signup fehlgeschlagen", error.message);
      }
      return;
    }
    if (data?.session) {
      window.location.href = "./index.html";
    } else {
      toast("Check deine E-Mail", "Falls die E-Mail schon existiert, bitte einloggen.");
    }
    return;
  }

  const { error } = await supabaseClient.auth.signInWithPassword({ email, password });
  if (error) toast("Login fehlgeschlagen", error.message);
  else window.location.href = "./index.html";
}

async function logout(){
  try {
    await supabaseClient?.auth.signOut();
  } catch {}
  try {
    Object.keys(localStorage).forEach((key) => {
      if (key.startsWith("sb-")) localStorage.removeItem(key);
    });
  } catch {}
  setCurrentUser(null);
  location.href = "/";
}

googleLoginBtn?.addEventListener("click", () => startOAuth("google"));
microsoftLoginBtn?.addEventListener("click", () => startOAuth("microsoft"));
logoutTop?.addEventListener("click", logout);
logoutSide?.addEventListener("click", logout);
loginEmailBtn?.addEventListener("click", () => emailAuth("login"));
resetPasswordBtn?.addEventListener("click", async () => {
  if (!supabaseClient) {
    toast("Fehler", "Supabase nicht geladen.");
    return;
  }
  const email = (emailLogin?.value || "").trim();
  if (!email) {
    toast("E-Mail fehlt", "Bitte zuerst deine E-Mail eingeben.");
    return;
  }
  const redirectTo = window.location.origin + "/login.html";
  const { error } = await supabaseClient.auth.resetPasswordForEmail(email, { redirectTo });
  if (error) toast("Fehler", error.message);
  else toast("E-Mail gesendet", "Check dein Postfach.");
});

let appInitialized = false;
async function initAppUI(){
  if (appInitialized) return;
  appInitialized = true;

  initStorageOnce({ seed: !isSupabaseReady() });
  if (isSupabaseReady()) {
    await syncFromSupabase();
  }

  renderRecommended();
  renderSkills();
  hydrateSkillSelects();
  renderQuests();
  updateStats();
  renderTutorials();
  initSettingsControls();

  const last = localStorage.getItem(LS.view) || "dashboard";
  setView(last, { animate: false });
}

supabaseClient?.auth.onAuthStateChange(async (_event, session) => {
  if (session?.user) {
    document.body.classList.add("authed");
    setCurrentUser(session.user);
    displayUser(session.user);
    syncProfile(session.user);
    await initAppUI();
    if (window.location.pathname.endsWith("/login.html")) {
      window.location.href = "./index.html";
    }
  } else {
    document.body.classList.remove("authed");
    setCurrentUser(null);
  }
});

/* ========= Storage init ========= */
function initStorageOnce(opts = {}){
  const shouldSeed = opts.seed !== false;
  migrateLegacySkills();

  if (!localStorage.getItem(LS.skillCatalog)) {
    saveJSON(LS.skillCatalog, []);
  }
  if (!localStorage.getItem(LS.userSkills)) {
    saveJSON(LS.userSkills, []);
  }
  if (!localStorage.getItem(LS.quests)) {
    saveJSON(LS.quests, {}); // mapping
  }

  const userId = getCurrentUserId();
  const userSkills = getUserSkillRows().filter(row => row.userId === userId);
  if (shouldSeed && !userSkills.length) {
    createSkillAndTrack({
      name: "JavaScript",
      category: "Code",
      description: "",
      progress: 40
    }, { silent: true, skipRemote: true });
    createSkillAndTrack({
      name: "Web Design",
      category: "Design",
      description: "",
      progress: 60
    }, { silent: true, skipRemote: true });
  }
}

async function syncFromSupabase(){
  if (!isSupabaseReady()) return;
  const userId = getCurrentUserId();

  const userSkillsResult = await supabaseClient
    .from("user_skills")
    .select("id, skill_id, active, progress, rank_index, created_at, updated_at")
    .eq("user_id", userId);
  if (userSkillsResult.error) {
    toast("Sync Fehler", "User Skills nicht geladen.");
    return;
  }

  const userSkillsRows = userSkillsResult.data || [];
  const skillIds = userSkillsRows.map(r => r.skill_id).filter(Boolean);

  let skillRows = [];
  if (skillIds.length) {
    const skillResult = await supabaseClient
      .from("skills")
      .select("id, owner_id, name, description, category, is_public_template, created_at, updated_at")
      .in("id", skillIds);
    if (skillResult.error) {
      toast("Sync Fehler", "Skills nicht geladen.");
    } else {
      skillRows = skillResult.data || [];
    }
  }

  const catalog = skillRows.map(row => ({
    id: row.id,
    ownerId: row.owner_id,
    name: row.name,
    description: row.description || "",
    category: row.category || "",
    isPublicTemplate: Boolean(row.is_public_template),
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }));

  const userSkills = userSkillsRows.map(row => ({
    id: row.id,
    userId,
    skillId: row.skill_id,
    active: row.active !== false,
    progress: Number(row.progress) || 0,
    rankIndex: Number(row.rank_index) || 0,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }));

  saveJSON(LS.skillCatalog, catalog);
  saveJSON(LS.userSkills, userSkills);

  const questResult = await supabaseClient
    .from("quests")
    .select("id, skill_id, title, description, status, estimated_minutes, xp, unlock_level, created_at, completed_at")
    .eq("user_id", userId);
  if (questResult.error) {
    toast("Sync Fehler", "Quests nicht geladen.");
  } else {
    const userSkillBySkillId = new Map(userSkills.map(row => [row.skillId, row.id]));
    const questMap = {};
    (questResult.data || []).forEach(q => {
      const userSkillId = userSkillBySkillId.get(q.skill_id);
      if (!userSkillId) return;
      if (!questMap[userSkillId]) questMap[userSkillId] = [];
      questMap[userSkillId].push({
        id: q.id,
        title: q.title,
        desc: q.description || "",
        points: Number(q.xp) || 0,
        done: q.status === "done",
        status: q.status || "todo",
        estimatedMinutes: q.estimated_minutes ?? null,
        unlockLevel: q.unlock_level ?? 1
      });
    });
    saveJSON(LS.quests, questMap);
  }

  const analysisResult = await supabaseClient
    .from("skill_analysis")
    .select("skill_id, json_result, model, version, created_at")
    .eq("user_id", userId);
  if (!analysisResult.error) {
    const next = {};
    (analysisResult.data || []).forEach(row => {
      const prev = next[row.skill_id];
      if (!prev || (row.version || 0) >= (prev.version || 0)) {
        next[row.skill_id] = {
          ...(row.json_result || {}),
          model: row.model || null,
          version: row.version || 0,
          createdAt: row.created_at
        };
      }
    });
    setSkillAnalysisMap(next);
  }
}

function migrateLegacySkills(){
  const hasCatalog = Boolean(localStorage.getItem(LS.skillCatalog));
  const hasUserSkills = Boolean(localStorage.getItem(LS.userSkills));
  if (hasCatalog || hasUserSkills) return;

  const legacy = loadJSON(LS.skills, []);
  if (!Array.isArray(legacy) || !legacy.length) return;

  const userId = getCurrentUserId();
  const now = new Date().toISOString();
  const catalog = [];
  const userSkills = [];
  const legacyMap = {};

  legacy.forEach((old) => {
    const name = (old?.name || "").trim();
    if (!name) return;
    const skillId = uid();
    const userSkillId = uid();
    const legacyId = old?.id;
    if (legacyId) legacyMap[legacyId] = userSkillId;

    catalog.push({
      id: skillId,
      ownerId: userId,
      name,
      category: "",
      description: (old?.notes || "").toString(),
      isPublicTemplate: false,
      createdAt: now,
      updatedAt: now
    });
    userSkills.push({
      id: userSkillId,
      userId,
      skillId,
      active: true,
      progress: clamp(old?.progress ?? 50, 0, 100),
      rankIndex: 0,
      createdAt: now,
      updatedAt: now
    });
  });

  saveJSON(LS.skillCatalog, catalog);
  saveJSON(LS.userSkills, userSkills);

  const legacyQuestMap = loadJSON(LS.quests, {});
  const nextQuestMap = {};
  Object.keys(legacyQuestMap || {}).forEach((oldId) => {
    const nextId = legacyMap[oldId];
    if (nextId) nextQuestMap[nextId] = legacyQuestMap[oldId];
  });
  saveJSON(LS.quests, nextQuestMap);
}

/* ========= Views (Tabs) + Animations ========= */
const viewTitle = $("viewTitle");
const viewSub = $("viewSub");
const primaryAction = $("primaryAction");
const appShell = $("appShell");
const toggleSidebar = $("toggleSidebar");
const mobileMenu = $("mobileMenu");
const mobileMenuBtn = $("mobileMenuBtn");
const mobileMenuClose = $("mobileMenuClose");

function setSidebarCollapsed(collapsed){
  if (!appShell) return;
  appShell.classList.toggle("sidebar-collapsed", collapsed);
  localStorage.setItem(LS.sidebarCollapsed, collapsed ? "1" : "0");
  if (toggleSidebar) toggleSidebar.setAttribute("aria-pressed", collapsed ? "true" : "false");
}
setSidebarCollapsed(localStorage.getItem(LS.sidebarCollapsed) === "1");
toggleSidebar?.addEventListener("click", () => {
  const next = !appShell?.classList.contains("sidebar-collapsed");
  setSidebarCollapsed(next);
});

const views = {
  dashboard: { el: $("view-dashboard"), title: "Dashboard", sub: "Dein Ueberblick. Starte mit einem Skill.", action: "Neuer Skill" },
  "add-skill": { el: $("view-add-skill"), title: "Neuer Skill", sub: "Name + Beschreibung, dann KI Analyse.", action: "Analysieren" },
  skills: { el: $("view-skills"), title: "Meine Skills", sub: "Mini-Projekte mit Quests und Progress.", action: "Neuer Skill" },
  tutorials: { el: $("view-tutorials"), title: "Tutorials", sub: "Provisorisch: suchen, filtern und als Quest speichern.", action: "Zu Skills" },
  settings: { el: $("view-settings"), title: "Settings", sub: "Profil und Account verwalten.", action: "Profil speichern" },
};

let isViewSwitching = false;
let pendingView = null;

async function setView(name, opts = { animate: true }){
  const v = views[name] ? name : "dashboard";
  if (isViewSwitching) {
    pendingView = { name: v, opts };
    return;
  }
  const current = localStorage.getItem(LS.view) || "dashboard";
  if (v === current && opts.animate !== false) return;

  isViewSwitching = true;
  localStorage.setItem(LS.view, v);

  const curEl = views[current]?.el;
  const nextEl = views[v]?.el;

  // sidebar active
  document.querySelectorAll(".side-link").forEach(btn => {
    btn.classList.toggle("active", btn.getAttribute("data-view") === v);
  });

  // header text
  if (viewTitle) viewTitle.textContent = views[v].title;
  if (viewSub) viewSub.textContent = views[v].sub;
  if (primaryAction) primaryAction.textContent = views[v].action;

  if (!nextEl) {
    isViewSwitching = false;
    return;
  }

  Object.values(views).forEach(view => {
    view.el?.classList.remove("view-anim-exit", "view-anim-enter");
  });

  if (opts.animate === false) {
    Object.keys(views).forEach(k => views[k].el?.classList.toggle("view-active", k === v));
    isViewSwitching = false;
    if (pendingView) {
      const next = pendingView;
      pendingView = null;
      setView(next.name, next.opts);
    }
    return;
  }

  // animate out current
  if (curEl) {
    curEl.classList.add("view-anim-exit");
    await sleep(180);
    curEl.classList.remove("view-anim-exit");
    curEl.classList.remove("view-active");
  }
  Object.keys(views).forEach(k => views[k].el?.classList.remove("view-active"));

  // show next + animate in
  nextEl.classList.add("view-active");
  nextEl.classList.add("view-anim-enter");
  await sleep(240);
  nextEl.classList.remove("view-anim-enter");

  // UX: keep app top in view
  document.getElementById("appShell")?.scrollIntoView({ behavior: "smooth" });

  isViewSwitching = false;
  if (pendingView) {
    const next = pendingView;
    pendingView = null;
    setView(next.name, next.opts);
  }
}

document.querySelectorAll(".side-link").forEach(btn => {
  btn.addEventListener("click", () => setView(btn.getAttribute("data-view")));
});

function openMobileMenu(){
  if (window.innerWidth > 720) return;
  document.body.classList.add("mobile-menu-open");
}
function closeMobileMenu(){
  document.body.classList.remove("mobile-menu-open");
}

mobileMenuBtn?.addEventListener("click", () => {
  if (document.body.classList.contains("mobile-menu-open")) closeMobileMenu();
  else openMobileMenu();
});
mobileMenuClose?.addEventListener("click", closeMobileMenu);
mobileMenu?.addEventListener("click", (e) => {
  if (e.target === mobileMenu) closeMobileMenu();
});
mobileMenu?.querySelectorAll("[data-view]").forEach(btn => {
  btn.addEventListener("click", () => {
    setView(btn.getAttribute("data-view"));
    closeMobileMenu();
  });
});

$("goSkills")?.addEventListener("click", () => setView("add-skill"));
$("goTutorials")?.addEventListener("click", () => setView("tutorials"));
dashboardGoSkills?.addEventListener("click", () => setView("skills"));
dashboardGoAddSkill?.addEventListener("click", () => setView("add-skill"));

primaryAction?.addEventListener("click", () => {
  const current = localStorage.getItem(LS.view) || "dashboard";
  if (current === "dashboard") setView("add-skill");
  else if (current === "add-skill") createSkillBtn?.click();
  else if (current === "skills") setView("add-skill");
  else if (current === "tutorials") setView("skills");
  else if (current === "settings") saveProfileBtn?.click();
});

saveProfileBtn?.addEventListener("click", async () => {
  if (!supabaseClient) {
    toast("Fehler", "Supabase nicht geladen.");
    return;
  }
  const username = (settingsUsername?.value || "").trim();
  const fullNameValue = (settingsFullName?.value || "").trim();
  if (!username) {
    toast("Fehlender Username", "Bitte einen Username eingeben.");
    return;
  }
  if (!/^[a-zA-Z0-9._-]{3,20}$/.test(username)) {
    toast("Ungültiger Username", "3-20 Zeichen: a-z, 0-9, Punkt, Bindestrich, Unterstrich.");
    return;
  }
  const { data: userData } = await supabaseClient.auth.getUser();
  if (!userData?.user) return;
  const check = await supabaseClient
    .from("profiles")
    .select("id")
    .eq("username", username)
    .maybeSingle();
  if (check.data && check.data.id !== userData.user.id) {
    toast("Username vergeben", "Bitte einen anderen Wählen.");
    return;
  }
  const { error } = await supabaseClient.auth.updateUser({
    data: { username, full_name: fullNameValue }
  });
  if (error) {
    toast("Speichern fehlgeschlagen", error.message);
    return;
  }
  await syncProfile(userData.user);
  toast("Gespeichert", "Profil aktualisiert.");
  displayUser(userData.user);
});

/* ========= Skills ========= */
const newSkillName = $("newSkillName");
const newSkillDescription = $("newSkillDescription");
const createSkillBtn = $("createSkillBtn");
const skillList = $("skillList");
const emptyHint = $("emptyHint");
const skillDetailTitle = $("skillDetailTitle");
const skillDetailDesc = $("skillDetailDesc");
const skillDetailMeta = $("skillDetailMeta");
const skillDetailBar = $("skillDetailBar");
const skillDetailBadges = $("skillDetailBadges");
const skillDetailEdit = $("skillDetailEdit");
const skillDetailEditName = $("skillDetailEditName");
const skillDetailEditCategory = $("skillDetailEditCategory");
const skillDetailEditDescription = $("skillDetailEditDescription");
const skillDetailSaveBtn = $("skillDetailSaveBtn");
const skillDetailCancelBtn = $("skillDetailCancelBtn");
const editSkillBtn = $("editSkillBtn");
const deleteSkillBtn = $("deleteSkillBtn");

const statActive = $("statActive");
const statQuests = $("statQuests");

const xpLevel = $("xpLevel");
const xpProgress = $("xpProgress");
const xpBar = $("xpBar");
const topXpBar = $("topXpBar");
const topXpText = $("topXpText");

const skillSearch = $("skillSearch");
const skillSort = $("skillSort");
const skillFilter = $("skillFilter");
const skillClearBtn = $("skillClearBtn");
const skillResetBtn = $("skillResetBtn");
const analysisResult = $("analysisResult");
const analysisEmptyHint = $("analysisEmptyHint");
let selectedSkillId = localStorage.getItem(LS.selectedSkillId) || null;
let editingSkillId = null;
let analysisBusy = false;
let lastAnalyzedSkillId = null;
const todayPlanList = $("todayPlanList");
const emptyCta = $("emptyCta");
const rewardsList = $("rewardsList");
const rewardsHint = $("rewardsHint");
const rewardsModal = $("rewardsModal");
const closeRewards = $("closeRewards");
const openRewards = $("openRewards");
const openRewardsTop = $("openRewardsTop");
const rewardsCarousel = $("rewardsCarousel");
const rewardsModalHint = $("rewardsModalHint");
const levelBadge = $("levelBadge");
const legalModal = $("legalModal");
const closeLegal = $("closeLegal");
const legalTitle = $("legalTitle");
const legalBody = $("legalBody");
const settingsTheme = $("settingsTheme");
const settingsSidebar = $("settingsSidebar");
const settingsReminders = $("settingsReminders");
const settingsWeekly = $("settingsWeekly");
const dashboardSkillHint = $("dashboardSkillHint");
const dashboardSkillMeta = $("dashboardSkillMeta");
const dashboardSkillBar = $("dashboardSkillBar");
const dashboardGoSkills = $("dashboardGoSkills");
const dashboardGoAddSkill = $("dashboardGoAddSkill");

const recoChips = $("recoChips");
const RECOMMENDED = [
  { name: "Python", category: "Code" },
  { name: "JavaScript", category: "Code" },
  { name: "Web Design", category: "Design" },
  { name: "UI/UX", category: "Design" },
  { name: "Fitness", category: "Fitness" },
  { name: "Englisch", category: "Language" },
  { name: "Mathe", category: "Math" },
  { name: "Produktivitaet", category: "Productivity" }
];

function getSkillCatalog(){ return loadJSON(LS.skillCatalog, []); }
function setSkillCatalog(skills){ saveJSON(LS.skillCatalog, skills); }
function getUserSkillRows(){ return loadJSON(LS.userSkills, []); }
function setUserSkillRows(rows){ saveJSON(LS.userSkills, rows); }
function getTrackedSkills(){
  const userId = getCurrentUserId();
  const catalog = getSkillCatalog();
  const rows = getUserSkillRows().filter(row => row.userId === userId && row.active !== false);

  return rows.map(row => {
    const skill = catalog.find(s => s.id === row.skillId);
    if (!skill) return null;
    return {
      id: row.id,
      skillId: skill.id,
      name: skill.name,
      category: skill.category || "",
      description: skill.description || "",
      rankIndex: Number(row.rankIndex ?? row.rank_index ?? 0),
      progress: Number(row.progress) || 0,
      isPublicTemplate: Boolean(skill.isPublicTemplate),
      ownerId: skill.ownerId || null
    };
  }).filter(Boolean);
}
function getTrackedSkillById(userSkillId){
  return getTrackedSkills().find(s => s.id === userSkillId) || null;
}
function getAnalysisForUserSkill(userSkillId){
  const tracked = getTrackedSkillById(userSkillId);
  if (!tracked) return null;
  const map = getSkillAnalysisMap();
  return map[tracked.skillId] || null;
}
function getSkills(){ return getTrackedSkills(); }
function setSelectedSkillId(id){
  if (id) {
    selectedSkillId = id;
    localStorage.setItem(LS.selectedSkillId, id);
  } else {
    selectedSkillId = null;
    localStorage.removeItem(LS.selectedSkillId);
  }
}
function resolveSelectedSkillId(skills){
  if (!Array.isArray(skills) || !skills.length) return null;
  if (selectedSkillId && skills.some(s => s.id === selectedSkillId)) return selectedSkillId;
  return skills[0].id;
}
function getSelectedSkill(){
  const skills = getSkills();
  const selected = resolveSelectedSkillId(skills);
  if (!selected) return null;
  return skills.find(s => s.id === selected) || null;
}

function getQuestMap(){ return loadJSON(LS.quests, {}); }
function setQuestMap(map){ saveJSON(LS.quests, map); }
function getQuests(skillId){ return getQuestMap()[skillId] || []; }
function setQuests(skillId, quests){
  const map = getQuestMap();
  map[skillId] = quests;
  setQuestMap(map);
}

async function syncQuestsForSkill(userSkillId, quests, opts = {}){
  if (!isSupabaseReady()) return;
  const tracked = getTrackedSkillById(userSkillId);
  if (!tracked) return;
  const userId = getCurrentUserId();

  if (opts.replace) {
    const delResult = await supabaseClient
      .from("quests")
      .delete()
      .eq("user_id", userId)
      .eq("skill_id", tracked.skillId);
    if (delResult.error) {
      toast("Sync Fehler", "Quests nicht aktualisiert.");
      return;
    }
  }

  const rows = (quests || []).map(q => ({
    id: q.id,
    user_id: userId,
    skill_id: tracked.skillId,
    title: q.title,
    description: q.desc,
    status: q.done ? "done" : "todo",
    estimated_minutes: q.estimatedMinutes ?? null,
    xp: Number(q.points) || 0,
    unlock_level: q.unlockLevel ?? 1
  }));
  if (!rows.length) return;

  const upsertResult = await supabaseClient
    .from("quests")
    .upsert(rows, { onConflict: "id" });
  if (upsertResult.error) {
    toast("Sync Fehler", "Quests nicht gespeichert.");
  }
}

function updateStats(){
  const skills = getSkills();
  if (statActive) statActive.textContent = String(skills.length);

  const qmap = getQuestMap();
  const skillIds = new Set(skills.map(s => s.id));
  let open = 0;
  for (const sid of Object.keys(qmap)) {
    if (!skillIds.has(sid)) continue;
    open += (qmap[sid] || []).filter(q => !q.done).length;
  }
  if (statQuests) statQuests.textContent = String(open);

  updateXP(skills);
  renderTodayPlan(skills, open);
  renderDashboardSkill();
}
function renderDashboardSkill(){
  if (!dashboardSkillMeta || !dashboardSkillBar || !dashboardSkillHint) return;
  const skill = getSelectedSkill();
  if (!skill) {
    dashboardSkillMeta.innerHTML = "<span>Rank</span><span><strong>-</strong></span>";
    dashboardSkillBar.style.width = "0%";
    dashboardSkillHint.textContent = "Waehle einen Skill in \"Meine Skills\".";
    return;
  }

  const rankLabel = getRankLabel(skill.rankIndex);
  dashboardSkillMeta.innerHTML = `<span>Rank</span><span><strong>${escapeHTML(rankLabel)}</strong> - ${skill.progress}%</span>`;
  dashboardSkillBar.style.width = `${skill.progress}%`;
  dashboardSkillHint.textContent = skill.description
    ? `${skill.name} - ${skill.description}`
    : skill.name;
}
function getTotalXpForSkill(skill){
  const rankIndex = Number(skill.rankIndex) || 0;
  const progress = Number(skill.progress) || 0;
  return rankIndex * 100 + progress;
}
function updateXP(skills){
  if (!xpLevel && !xpProgress && !xpBar && !topXpBar && !topXpText) return;
  const total = skills.reduce((sum, s) => sum + getTotalXpForSkill(s), 0);
  const level = Math.max(1, Math.floor(total / 100) + 1);
  const current = total % 100;

  if (xpLevel) xpLevel.textContent = String(level);
  if (levelBadge) levelBadge.textContent = String(level);
  if (levelBadgeTop) levelBadgeTop.textContent = String(level);
  if (xpProgress) xpProgress.textContent = `${current}/100 XP`;
  if (xpBar) xpBar.style.width = `${Math.min(100, Math.max(0, current))}%`;
  if (topXpText) topXpText.textContent = `${current}/100`;
  if (topXpBar) topXpBar.style.width = `${Math.min(100, Math.max(0, current))}%`;

  const prevLevel = Number(localStorage.getItem(LS.lastLevel) || "1");
  if (level > prevLevel) {
    localStorage.setItem(LS.lastLevel, String(level));
    const reward = getRewardForLevel(level);
    if (reward) toast("Level up!", reward);
    else toast("Level up!", `Level ${level} erreicht`);
  }

  renderRewards(level);
  renderRewardsCarousel(level);
}

function renderRecommended(){
  if (!recoChips) return;
  recoChips.innerHTML = "";
  RECOMMENDED.forEach(item => {
    const b = document.createElement("button");
    b.className = "chip";
    b.type = "button";
    b.textContent = item.name;
    b.addEventListener("click", () => {
      if (newSkillName) newSkillName.value = item.name;
      if (newSkillDescription) newSkillDescription.value = "";
      newSkillName?.focus();
      toast("Skill ausgewaehlt", "Beschreibung ergaenzen und analysieren.");
    });
    recoChips.appendChild(b);
  });
}

function initSettingsControls(){
  if (settingsTheme) {
    const current = localStorage.getItem(LS.theme) || "light";
    settingsTheme.value = current === "dark" ? "dark" : "light";
    settingsTheme.addEventListener("change", () => applyTheme(settingsTheme.value));
  }
  if (settingsSidebar) {
    const collapsed = localStorage.getItem(LS.sidebarCollapsed) === "1";
    settingsSidebar.value = collapsed ? "collapsed" : "expanded";
    settingsSidebar.addEventListener("change", () => {
      setSidebarCollapsed(settingsSidebar.value === "collapsed");
    });
  }
  if (settingsReminders) {
    const saved = localStorage.getItem("elevate_reminders") || "off";
    settingsReminders.value = saved;
    settingsReminders.addEventListener("change", () => {
      localStorage.setItem("elevate_reminders", settingsReminders.value);
    });
  }
  if (settingsWeekly) {
    const saved = localStorage.getItem("elevate_weekly_summary") || "on";
    settingsWeekly.value = saved;
    settingsWeekly.addEventListener("change", () => {
      localStorage.setItem("elevate_weekly_summary", settingsWeekly.value);
    });
  }
}

const REWARDS = [
  { level: 2, title: "Bronze Badge", category: "Badges", desc: "Erstes Profil-Badge freigeschaltet." },
  { level: 3, title: "Focus Theme", category: "Theme", desc: "Ruhiger Farbmodus für Fokus." },
  { level: 4, title: "Quest Booster", category: "Quests", desc: "+1 Extra-Quest pro Skill." },
  { level: 5, title: "Streak Boost", category: "Streak", desc: "Streak zeigt dir 7-Tage-Serie." },
  { level: 6, title: "Milestone Frame", category: "Profil", desc: "Avatar-Rahmen für Meilensteine." },
  { level: 7, title: "Pro Highlight", category: "Pro", desc: "Skill-Karten mit Highlight." },
  { level: 8, title: "Weekly Summary", category: "Insights", desc: "Kurzer Wochen-Rückblick." },
  { level: 9, title: "Deep Focus Mode", category: "Focus", desc: "Ablenkungsarme Ansicht im Skill-Tab." },
  { level: 10, title: "Gold Badge", category: "Badges", desc: "Goldenes Profil-Badge freigeschaltet." },
  { level: 12, title: "Custom Accent", category: "Theme", desc: "Eigene Akzentfarbe für die UI." }
];

function getRewardForLevel(level){
  const r = REWARDS.find(x => x.level === level);
  return r ? `Belohnung: ${r.title}` : "";
}

function renderRewards(level){
  if (!rewardsList) return;
  const items = REWARDS.map(r => {
    const unlocked = level >= r.level;
    const tag = r.category ? `${escapeHTML(r.category)} · ` : "";
    const meta = unlocked ? `${tag}Freigeschaltet` : `${tag}Level ${r.level}`;
    return `
      <li class="${unlocked ? "reward unlocked" : "reward"}">
        <span class="reward-title">${escapeHTML(r.title)}</span>
        <span class="reward-meta">${meta}</span>
      </li>
    `;
  }).join("");
  rewardsList.innerHTML = items;
  updateRewardHints(level);
}

function updateRewardHints(level){
  const next = REWARDS.find(r => r.level > level);
  const text = next
    ? `Naechste Belohnung bei Level ${next.level}.`
    : "Alle Belohnungen freigeschaltet.";
  if (rewardsHint) rewardsHint.textContent = text;
  if (rewardsModalHint) rewardsModalHint.textContent = text;
}

function renderRewardsCarousel(level){
  if (!rewardsCarousel) return;
  rewardsCarousel.innerHTML = REWARDS.map(r => {
    const unlocked = level >= r.level;
    const status = unlocked ? "Freigeschaltet" : `Level ${r.level}`;
    const tag = r.category ? `<div class="reward-card-tag">${escapeHTML(r.category)}</div>` : "";
    const desc = r.desc ? `<div class="reward-card-desc">${escapeHTML(r.desc)}</div>` : "";
    return `
      <div class="reward-card${unlocked ? " unlocked" : ""}">
        <div class="reward-card-level">Level ${r.level}</div>
        <div class="reward-card-title">${escapeHTML(r.title)}</div>
        ${tag}
        ${desc}
        <div class="reward-card-meta">${status}</div>
      </div>
    `;
  }).join("");
}

function openRewardsModal(){
  if (!rewardsModal) return;
  try {
    const skills = getSkills();
    const total = skills.reduce((sum, s) => sum + (Number(s.progress) || 0), 0);
    const level = Math.max(1, Math.floor(total / 100) + 1);
    renderRewardsCarousel(level);
    updateRewardHints(level);
  } catch {}
  rewardsModal.style.display = "flex";
  document.body.classList.add("modal-open");
}
function closeRewardsModal(){
  if (!rewardsModal) return;
  rewardsModal.style.display = "none";
  document.body.classList.remove("modal-open");
}

openRewards?.addEventListener("click", openRewardsModal);
openRewardsTop?.addEventListener("click", openRewardsModal);
closeRewards?.addEventListener("click", closeRewardsModal);
rewardsModal?.addEventListener("click", (e) => {
  if (e.target === rewardsModal) closeRewardsModal();
});

const LEGAL_CONTENT = {
  datenschutz: {
    title: "Datenschutzerklärung (Schweiz)",
    body: `
      <h4>1. Grundsatz</h4>
      <p>Der Schutz Ihrer Personendaten ist uns ein wichtiges Anliegen. Diese Datenschutzerklärung informiert über die Bearbeitung von Personendaten im Zusammenhang mit dieser Website und den damit verbundenen Dienstleistungen. Wir bearbeiten Personendaten im Einklang mit dem Schweizer Datenschutzgesetz (DSG) sowie, soweit anwendbar, der DSGVO.</p>
      <h4>2. Verantwortlicher</h4>
      <p>Luis Backer, 6033 Buchrain, Schweiz<br>E-Mail: Backerluis231@gmail.com</p>
      <h4>3. Bearbeitete Personendaten</h4>
      <p><strong>3.1 Bei Registrierung/Login</strong><br>E-Mail-Adresse, Login-Status, Zeitpunkt der Registrierung/Anmeldung.</p>
      <p><strong>3.2 App-Daten</strong><br>Skills, Quests, Fortschritt (LocalStorage im Browser).</p>
      <p><strong>3.3 Technische Daten (automatisch)</strong><br>IP-Adresse (soweit technisch erforderlich), Browsertyp, Betriebssystem, Datum/Uhrzeit des Zugriffs, Referrer-URL.</p>
      <h4>4. Zweck der Datenbearbeitung</h4>
      <p>Authentifizierung, Bereitstellung der App-Funktionen, Anzeige des Nutzerkontos, Sicherheit und Stabilitaet des Betriebs, Verbesserung der Nutzererfahrung.</p>
      <h4>5. Rechtsgrundlagen</h4>
      <p>Einwilligung (sofern erforderlich), Vertragserfuellung (Bereitstellung der App), berechtigte Interessen (Betrieb und Sicherheit), rechtliche Verpflichtungen.</p>
      <h4>6. Cookies</h4>
      <p>Es werden keine Tracking-Cookies eingesetzt. Technisch notwendige Daten können zur Bereitstellung der Funktionen verwendet werden. Einstellungen wie Theme können lokal gespeichert werden.</p>
      <h4>7. Datenweitergabe</h4>
      <p>Wir geben Personendaten nur weiter, wenn dies für den Betrieb erforderlich ist oder eine rechtliche Grundlage besteht. Dienstleister: Supabase (Authentifizierung), Vercel (Hosting). Wir verkaufen keine Personendaten.</p>
      <h4>8. Datenübermittlung ins Ausland</h4>
      <p>Je nach Dienstleister können Daten in LÄnder ausserhalb der Schweiz übermittelt werden. Es werden geeignete Garantien eingesetzt (z.B. Standardvertragsklauseln).</p>
      <h4>9. Datensicherheit</h4>
      <p>Angemessene technische und organisatorische Massnahmen (TLS/SSL, Zugriffskontrolle, Sicherheitsupdates).</p>
      <h4>10. Aufbewahrungsdauer</h4>
      <p>Kontodaten bis zur Loeschung des Kontos. Lokale Daten bleiben im Browser, bis sie gelöscht werden.</p>
      <h4>11. Ihre Rechte</h4>
      <p>Auskunft, Berichtigung, Loeschung, Widerspruch, Datenherausgabe. Kontakt: Backerluis231@gmail.com</p>
      <h4>12. Beschwerderecht</h4>
      <p>Beschwerde bei der zustaendigen Behoerde (EDOEB): www.edoeb.admin.ch</p>
      <h4>13. Änderungen</h4>
      <p>Wir können diese Datenschutzerklärung anpassen. Die aktuelle Version ist hier abrufbar.</p>
    `
  },
  agb: {
    title: "AGB (Schweiz) – Demo",
    body: `
      <h4>1. Geltungsbereich</h4>
      <p>Diese Allgemeinen Geschäftsbedingungen (AGB) gelten für alle Dienstleistungen, die über diese Website angeboten werden. Mit der Nutzung der Dienste erklaeren Sie sich mit diesen AGB einverstanden. Abweichende Bedingungen werden nicht anerkannt, ausser wir stimmen schriftlich zu.</p>
      <p>Die AGB gelten für kostenlose Nutzung sowie für kostenpflichtige Abonnements. Mit Registrierung oder Nutzung bestätigen Sie, dass Sie diese Bedingungen gelesen und verstanden haben.</p>

      <h4>2. Vertragspartner</h4>
      <p>Vertragspartner ist: Luis Backer, 6033 Buchrain, Schweiz. E-Mail: Backerluis231@gmail.com (nachfolgend "Anbieter").</p>

      <h4>3. Leistungsbeschreibung</h4>
      <p>Elevate ist ein Skill-Tracker. Der Service umfasst je nach Funktionsumfang:</p>
      <p><strong>3.1 Basisfunktionen</strong><br>Skills verwalten, Fortschritt setzen, Quests erstellen und abschliessen, Tutorials speichern.</p>
      <p><strong>3.2 Gamification</strong><br>Level/XP, Badges und Belohnungen, Fortschrittsanzeigen.</p>
      <p><strong>3.3 Erweiterte Funktionen (Pro)</strong><br>Erweiterte Statistikfunktionen, zusätzliche Quests, erweiterte Personalisierung (Platzhalter).</p>
      <p><strong>3.4 Wichtiger Hinweis</strong><br>Die Ergebnisse dienen als Motivation und Orientierung und ersetzen keine professionelle Beratung.</p>

      <h4>4. Vertragsschluss und Registrierung</h4>
      <p>Der Vertrag kommt durch Registrierung und Zustimmung zu diesen AGB zustande. Bei kostenpflichtigen Abonnements erfolgt der Vertragsschluss mit erfolgreicher Zahlung.</p>
      <p>Sie sind verpflichtet, korrekte Angaben zu machen und Ihre Zugangsdaten vertraulich zu behandeln.</p>

      <h4>5. Preise und Zahlungsbedingungen</h4>
      <p>Es gibt Free- und Pro-Nutzung. Preise und Leistungsumfang werden auf der Website angezeigt. Zahlungen erfolgen im Voraus über einen externen Zahlungsanbieter (Platzhalter).</p>
      <p>Preisänderungen werden rechtzeitig bekannt gegeben und gelten ab der naechsten Abrechnungsperiode.</p>

      <h4>6. Vertragslaufzeit und Kündigung</h4>
      <p>Pro-Abonnements laufen monatlich und verlaengern sich automatisch, sofern nicht vor Ablauf gekuendigt wird. Eine Kündigung ist zum Ende der Abrechnungsperiode möglich.</p>
      <p>Der Anbieter kann den Vertrag aus wichtigem Grund fristlos kündigen (z.B. Missbrauch, Zahlungsverzug).</p>

      <h4>7. Widerrufsrecht (falls anwendbar)</h4>
      <p>Sofern rechtlich erforderlich, gilt ein 14-taegiges Widerrufsrecht. Zur Ausuebung kontaktieren Sie: Backerluis231@gmail.com.</p>
      <p>Das Widerrufsrecht kann vorzeitig erlöschen, wenn Sie der ausführung vor Ablauf der Frist zustimmen.</p>

      <h4>8. Nutzungsrechte und Pflichten</h4>
      <p>Die Nutzung ist für private Zwecke gestattet. Verboten sind Missbrauch, automatisierte Zugriffe, Weitergabe von Zugangsdaten sowie rechtswidrige Inhalte.</p>
      <p>Sie duerfen Ihre eigenen Inhalte nutzen. Rechte Dritter sind zu respektieren.</p>

      <h4>9. Geistiges Eigentum</h4>
      <p>Alle Rechte an Design, Code und Inhalten verbleiben beim Anbieter. Die Nutzung Gewährt keine Eigentumsrechte.</p>

      <h4>10. Datenschutz</h4>
      <p>Die Verarbeitung personenbezogener Daten erfolgt gemaess der Datenschutzerklärung. Mit Nutzung der Dienste stimmen Sie dieser zu.</p>

      <h4>11. Haftungsausschluss</h4>
      <p>Der Anbieter haftet nicht für indirekte Schaeden, entgangenen Gewinn oder Folgeschaeden, soweit gesetzlich zulässig.</p>
      <p>Bei nicht ausschliessbarer Haftung ist diese auf die in den letzten 12 Monaten bezahlten Betraege begrenzt (max. CHF 100).</p>

      <h4>12. verfügbarkeit und Gewährleistung</h4>
      <p>Es wird keine durchgehende verfügbarkeit garantiert. Wartungen und Stoerungen sind möglich. Ein Anspruch auf Entschaedigung besteht nicht.</p>

      <h4>13. Änderungen des Services und der AGB</h4>
      <p>Der Anbieter kann den Service und diese AGB anpassen. Wesentliche Änderungen werden angemessen mitgeteilt.</p>

      <h4>14. Salvatorische Klausel</h4>
      <p>Unwirksame Bestimmungen beruehren die Gueltigkeit der übrigen Bestimmungen nicht.</p>

      <h4>15. Anwendbares Recht und Gerichtsstand</h4>
      <p>Es gilt schweizerisches Recht. Gerichtsstand ist, soweit zulässig, der Wohnsitz des Anbieters.</p>

      <h4>16. Kontakt</h4>
      <p>Fragen zu diesen AGB: Backerluis231@gmail.com</p>
    `
  },
  impressum: {
    title: "Impressum (Schweiz)",
    body: `
      <h4>Kontaktadresse</h4>
      <p>Luis Backer<br>6033 Buchrain<br>Schweiz</p>
      <p>E-Mail: Backerluis231@gmail.com</p>
      <h4>Rechtsform</h4>
      <p>Einzelunternehmen</p>
      <h4>Vertretungsberechtigte Person</h4>
      <p>Luis Backer</p>
      <h4>Mehrwertsteuernummer</h4>
      <p>Nicht MWST-pflichtig (Umsatz unter CHF 100'000)</p>
      <h4>Angebotene Dienste</h4>
      <p>Elevate bietet folgende Dienste an:</p>
      <p>Skill-Tracking mit Fortschritt und Quests<br>Gamification-System mit Levels und Belohnungen<br>Tutorial-Verwaltung und Speicherung<br>Optionale Pro-Funktionen (Platzhalter)</p>
      <h4>Haftungsausschluss</h4>
      <p>Der Autor übernimmt keine Gewähr für die Richtigkeit, Genauigkeit, Aktualitaet, Zuverlaessigkeit und Vollstaendigkeit der Informationen.</p>
      <p>Haftungsansprüche gegen den Autor wegen Schaeden materieller oder immaterieller Art, die aus dem Zugriff oder der Nutzung bzw. Nichtnutzung der veröffentlichten Informationen, durch Missbrauch der Verbindung oder durch technische Stoerungen entstanden sind, werden ausgeschlossen.</p>
      <p>Alle Angebote sind freibleibend. Der Autor behaelt es sich vor, Teile der Seiten oder das gesamte Angebot ohne AnKündigung zu verändern, zu ergänzen, zu löschen oder die Veröffentlichung zeitweise oder endgueltig einzustellen.</p>
      <h4>Haftungsausschluss für Links</h4>
      <p>Verweise und Links auf Websites Dritter liegen ausserhalb unseres Verantwortungsbereichs. Es wird jegliche Verantwortung für solche Websites abgelehnt. Der Zugriff und die Nutzung erfolgen auf eigene Gefahr.</p>
      <h4>Urheberrechte</h4>
      <p>Die Urheber- und alle anderen Rechte an Inhalten, Bildern, Fotos oder anderen Dateien auf dieser Website gehoeren ausschliesslich dem Betreiber oder den speziell genannten Rechteinhabern.</p>
      <p>für die Reproduktion jeglicher Elemente ist die schriftliche Zustimmung des Urheberrechtstraegers im Voraus einzuholen.</p>
      <h4>Anwendbares Recht und Gerichtsstand</h4>
      <p>Diese Website sowie deren Inhalte unterliegen dem Schweizer Recht. Ausschliesslicher Gerichtsstand ist Buchrain, Schweiz, soweit gesetzlich zulässig.</p>
      <p><strong>Stand:</strong> Januar 2026</p>
    `
  }
};

function openLegalModal(key){
  if (!legalModal || !legalTitle || !legalBody) return;
  const data = LEGAL_CONTENT[key];
  if (!data) return;
  legalTitle.textContent = data.title;
  legalBody.innerHTML = data.body;
  legalModal.style.display = "flex";
  document.body.classList.add("modal-open");
}
function closeLegalModal(){
  if (!legalModal) return;
  legalModal.style.display = "none";
  document.body.classList.remove("modal-open");
}

document.querySelectorAll("[data-legal]").forEach(btn => {
  btn.addEventListener("click", () => openLegalModal(btn.getAttribute("data-legal")));
});
closeLegal?.addEventListener("click", closeLegalModal);
legalModal?.addEventListener("click", (e) => {
  if (e.target === legalModal) closeLegalModal();
});
function renderTodayPlan(skills, openQuests){
  if (!todayPlanList) return;
  const hasSkills = skills.length > 0;
  let items = [];

  if (!hasSkills) {
    items = [
      "Einen Skill anlegen",
      "Progress setzen",
      "Erste Quest generieren"
    ];
  } else if (openQuests > 0) {
    items = [
      "Heute eine Quest abschließen",
      "Progress sichern (+%)",
      "Ein Tutorial als Quest speichern"
    ];
  } else {
    items = [
      "Neue Quests generieren",
      "Skill erweitern oder anpassen",
      "Kurzes Tutorial starten"
    ];
  }

  todayPlanList.innerHTML = items.map(text => `<li>${escapeHTML(text)}</li>`).join("");
}

function makeQuestTemplates(skillName){
  return [
    { title: `10 Min Ueben: ${skillName}`, desc: "Timer an, kurz und fokussiert.", points: 5, estimatedMinutes: 10, unlockLevel: 1 },
    { title: "Mini-Output bauen", desc: "Etwas Kleines erstellen (Snippet/Design/Uebung).", points: 10, estimatedMinutes: 20, unlockLevel: 2 },
    { title: "1 Tutorial-Teil anschauen", desc: "Ein Abschnitt reicht - nicht perfekt sein.", points: 7, estimatedMinutes: 15, unlockLevel: 1 },
  ];
}

function getQuestTemplatesForSkill(userSkillId){
  const tracked = getTrackedSkillById(userSkillId);
  if (!tracked) return [];
  const analysis = getSkillAnalysisMap()[tracked.skillId];
  if (analysis?.questPlan?.length) {
    return analysis.questPlan.map((quest) => ({
      title: quest.title || "Quest",
      desc: quest.description || "",
      points: Number(quest.xp) || 5,
      estimatedMinutes: Number(quest.estimatedTime) || 15,
      unlockLevel: Number(quest.unlockLevel) || 1
    }));
  }
  return makeQuestTemplates(tracked.name);
}

function buildQuestList(templates){
  return (templates || []).map(t => ({
    id: uid(),
    title: t.title,
    desc: t.desc,
    points: Number(t.points) || 0,
    done: false,
    status: "todo",
    estimatedMinutes: Number(t.estimatedMinutes) || null,
    unlockLevel: Number(t.unlockLevel) || 1
  }));
}

function ensureQuestsForSkill(skillId, opts = {}){
  const existing = getQuests(skillId);
  if (existing.length) return;

  const templates = getQuestTemplatesForSkill(skillId);
  if (!templates.length) return;
  const quests = buildQuestList(templates);
  setQuests(skillId, quests);

  if (!opts.skipRemote) {
    void syncQuestsForSkill(skillId, quests, { replace: true });
  }
}

function regenQuests(skillId){
  const templates = getQuestTemplatesForSkill(skillId);
  if (!templates.length) return;
  const quests = buildQuestList(templates);
  setQuests(skillId, quests);

  void syncQuestsForSkill(skillId, quests, { replace: true });
}

function createSkillAndTrack(data, opts = {}){
  const trimmed = (data?.name || "").trim();
  if (!trimmed) return null;

  const exists = getTrackedSkills().some(s => s.name.toLowerCase() === trimmed.toLowerCase());
  if (exists) {
    if (!opts.silent) toast("Schon vorhanden", "Diesen Skill hast du bereits.");
    return null;
  }

  const userId = getCurrentUserId();
  const now = new Date().toISOString();
  const rankIndex = clamp(Number(data?.rankIndex ?? 0), 0, RANKS.length - 1);
  const skill = {
    id: uid(),
    ownerId: userId,
    name: trimmed,
    category: (data?.category || "").trim(),
    description: (data?.description || "").trim(),
    isPublicTemplate: Boolean(data?.isPublicTemplate),
    createdAt: now,
    updatedAt: now
  };

  const catalog = getSkillCatalog();
  catalog.unshift(skill);
  setSkillCatalog(catalog);

  const userSkillId = uid();
  const rows = getUserSkillRows();
  rows.unshift({
    id: userSkillId,
    userId,
    skillId: skill.id,
    active: true,
    progress: clamp(data?.progress ?? 50, 0, 100),
    rankIndex,
    createdAt: now,
    updatedAt: now
  });
  setUserSkillRows(rows);

  ensureQuestsForSkill(userSkillId, { skipRemote: isSupabaseReady() && !opts.skipRemote });

  if (!opts.silent) {
    renderSkills();
    hydrateSkillSelects();
    renderQuests();
    updateStats();
  }

  if (isSupabaseReady() && !opts.skipRemote) {
    (async () => {
      const skillRow = {
        id: skill.id,
        owner_id: userId,
        name: skill.name,
        description: skill.description,
        category: skill.category,
        is_public_template: skill.isPublicTemplate,
        created_at: skill.createdAt,
        updated_at: skill.updatedAt
      };
      const row = rows.find(r => r.id === userSkillId);
      const userSkillRow = {
        id: userSkillId,
        user_id: userId,
        skill_id: skill.id,
        active: true,
        progress: row?.progress ?? 0,
        rank_index: row?.rankIndex ?? 0,
        created_at: row?.createdAt ?? skill.createdAt,
        updated_at: row?.updatedAt ?? skill.updatedAt
      };

      const skillResult = await supabaseClient
        .from("skills")
        .upsert(skillRow, { onConflict: "id" });
      if (skillResult.error) {
        toast("Sync Fehler", "Skill nicht gespeichert.");
        return;
      }
      const userSkillResult = await supabaseClient
        .from("user_skills")
        .upsert(userSkillRow, { onConflict: "id" });
      if (userSkillResult.error) {
        toast("Sync Fehler", "Tracking nicht gespeichert.");
        return;
      }
      await syncQuestsForSkill(userSkillId, getQuests(userSkillId), { replace: true });
    })();
  }

  return userSkillId;
}

function trackTemplateSkill(item, opts = {}){
  const name = (typeof item === "string" ? item : item?.name || "").trim();
  if (!name) return null;
  return createSkillAndTrack({
    name,
    category: item?.category || "",
    description: item?.description || "",
    isPublicTemplate: true,
    progress: opts?.progress ?? 35
  }, opts);
}

function addSkill(data){
  return createSkillAndTrack(data);
}

async function updateSkillProgressById(skillId, delta){
  const userId = getCurrentUserId();
  const rows = getUserSkillRows();
  const i = rows.findIndex(row => row.id === skillId && row.userId === userId);
  if (i === -1) return;

  const tracked = getTrackedSkillById(skillId);
  const difficulty = tracked ? getSkillDifficultyScore(tracked.skillId) : 5;
  const adjusted = applyDifficultyToPoints(delta, difficulty);

  let rankIndex = Number(rows[i].rankIndex || 0);
  let progress = Number(rows[i].progress || 0) + adjusted;
  while (progress >= 100 && rankIndex < RANKS.length - 1) {
    progress -= 100;
    rankIndex += 1;
  }
  progress = clamp(progress, 0, 100);
  rows[i].rankIndex = rankIndex;
  rows[i].progress = progress;
  rows[i].updatedAt = new Date().toISOString();
  setUserSkillRows(rows);

  renderSkills();
  updateStats();

  if (isSupabaseReady()) {
    const { error } = await supabaseClient
      .from("user_skills")
      .update({
        progress: rows[i].progress,
        rank_index: rows[i].rankIndex,
        updated_at: rows[i].updatedAt
      })
      .eq("id", rows[i].id)
      .eq("user_id", userId);
    if (error) toast("Sync Fehler", "Progress nicht gespeichert.");
  }
}

function updateSkillById(skillId, data){
  const userId = getCurrentUserId();
  const rows = getUserSkillRows();
  const rowIndex = rows.findIndex(row => row.id === skillId && row.userId === userId);
  if (rowIndex === -1) return;

  const catalog = getSkillCatalog();
  const skillIndex = catalog.findIndex(s => s.id === rows[rowIndex].skillId);
  if (skillIndex === -1) return;

  const nextName = (data.name ?? catalog[skillIndex].name).trim();
  const nextCategory = (data.category ?? catalog[skillIndex].category ?? "").trim();
  const nextDescription = (data.description ?? catalog[skillIndex].description ?? "").trim();
  if (!nextName) return;

  const isOwner = catalog[skillIndex].ownerId === userId;
  if (!isOwner) {
    const now = new Date().toISOString();
    const copy = {
      ...catalog[skillIndex],
      id: uid(),
      ownerId: userId,
      name: nextName,
      category: nextCategory,
      description: nextDescription,
      isPublicTemplate: false,
      createdAt: now,
      updatedAt: now
    };
    catalog.unshift(copy);
    rows[rowIndex].skillId = copy.id;
    rows[rowIndex].updatedAt = now;
    toast("Template kopiert", "Anpassung als eigener Skill gespeichert.");
  } else {
    catalog[skillIndex] = {
      ...catalog[skillIndex],
      name: nextName,
      category: nextCategory,
      description: nextDescription,
      updatedAt: new Date().toISOString()
    };
  }

  setSkillCatalog(catalog);
  setUserSkillRows(rows);

  renderSkills();
  hydrateSkillSelects();
  renderQuests();
  updateStats();

  if (isSupabaseReady()) {
    (async () => {
      const updatedSkillId = rows[rowIndex].skillId;
      const updatedSkill = catalog.find(s => s.id === updatedSkillId);
      if (updatedSkill) {
        const skillResult = await supabaseClient
          .from("skills")
          .upsert({
            id: updatedSkill.id,
            owner_id: updatedSkill.ownerId,
            name: updatedSkill.name,
            description: updatedSkill.description,
            category: updatedSkill.category,
            is_public_template: updatedSkill.isPublicTemplate,
            created_at: updatedSkill.createdAt,
            updated_at: updatedSkill.updatedAt
          }, { onConflict: "id" });
        if (skillResult.error) {
          toast("Sync Fehler", "Skill nicht gespeichert.");
          return;
        }
      }

      if (updatedSkillId !== skillId) {
        const relResult = await supabaseClient
          .from("user_skills")
          .update({ skill_id: updatedSkillId, updated_at: rows[rowIndex].updatedAt })
          .eq("id", rows[rowIndex].id)
          .eq("user_id", userId);
        if (relResult.error) {
          toast("Sync Fehler", "Skill-Zuordnung nicht gespeichert.");
        }
      }
    })();
  }
}

function deleteSkill(id){
  const ok = confirm("Skill wirklich loeschen?");
  if (!ok) return;

  const userId = getCurrentUserId();
  const rows = getUserSkillRows();
  const rowIndex = rows.findIndex(row => row.id === id && row.userId === userId);
  if (rowIndex === -1) return;

  const skillId = rows[rowIndex].skillId;
  rows.splice(rowIndex, 1);
  setUserSkillRows(rows);

  const qmap = getQuestMap();
  delete qmap[id];
  setQuestMap(qmap);

  const catalog = getSkillCatalog();
  const skillIndex = catalog.findIndex(s => s.id === skillId);
  if (skillIndex !== -1) {
    const stillUsed = rows.some(row => row.skillId === skillId);
    if (!stillUsed && catalog[skillIndex].ownerId === userId) {
      catalog.splice(skillIndex, 1);
    }
    setSkillCatalog(catalog);
  }

  renderSkills();
  hydrateSkillSelects();
  renderQuests();
  updateStats();
  toast("Skill geloescht", "Und Quests entfernt.");

  if (isSupabaseReady()) {
    (async () => {
      await supabaseClient
        .from("quests")
        .delete()
        .eq("user_id", userId)
        .eq("skill_id", skillId);

      const userResult = await supabaseClient
        .from("user_skills")
        .delete()
        .eq("id", id)
        .eq("user_id", userId);
      if (userResult.error) {
        toast("Sync Fehler", "Skill nicht geloescht.");
        return;
      }
      if (!rows.some(row => row.skillId === skillId)) {
        const skillResult = await supabaseClient
          .from("skills")
          .delete()
          .eq("id", skillId)
          .eq("owner_id", userId);
        if (skillResult.error) {
          toast("Sync Fehler", "Skill-Template nicht geloescht.");
        }
      }
    })();
  }
}

function renderSkillDetail(skill){
  if (!skillDetailTitle || !skillDetailMeta || !skillDetailBar) return;

  if (!skill) {
    skillDetailTitle.textContent = "Skill Detail";
    if (skillDetailDesc) skillDetailDesc.textContent = "Waehle links einen Skill.";
    skillDetailMeta.innerHTML = "<span>Rank</span><span><strong>-</strong></span>";
    skillDetailBar.style.width = "0%";
    if (skillDetailBadges) skillDetailBadges.innerHTML = "";
    if (questList) questList.innerHTML = "";
    if (questEmptyHint) questEmptyHint.style.display = "block";
    if (editSkillBtn) editSkillBtn.disabled = true;
    if (deleteSkillBtn) deleteSkillBtn.disabled = true;
    if (regenQuestsBtn) regenQuestsBtn.disabled = true;
    if (skillDetailEdit) skillDetailEdit.style.display = "none";
    return;
  }

  if (editSkillBtn) editSkillBtn.disabled = false;
  if (deleteSkillBtn) deleteSkillBtn.disabled = false;
  if (regenQuestsBtn) regenQuestsBtn.disabled = false;

  const rankLabel = getRankLabel(skill.rankIndex);
  skillDetailTitle.textContent = skill.name;
  if (skillDetailDesc) {
    skillDetailDesc.textContent = skill.description ? skill.description : "Beschreibung: leer";
  }
  skillDetailMeta.innerHTML = `<span>Rank</span><span><strong>${escapeHTML(rankLabel)}</strong> - ${skill.progress}%</span>`;
  skillDetailBar.style.width = `${skill.progress}%`;

  if (skillDetailBadges) {
    const badges = [];
    if (skill.category) badges.push(`<div class="badge-pill">${escapeHTML(skill.category)}</div>`);
    const quests = getQuests(skill.id);
    const open = quests.filter(q => !q.done).length;
    badges.push(`<div class="badge-pill">Offen: ${open}</div>`);
    const analysis = getSkillAnalysisMap()[skill.skillId];
    if (analysis?.difficultyScore) badges.push(`<div class="badge-pill points">${analysis.difficultyScore}/10</div>`);
    if (analysis?.levels?.length) badges.push(`<div class="badge-pill">Levels: ${analysis.levels.length}</div>`);
    if (analysis?.version) badges.push(`<div class="badge-pill">v${analysis.version}</div>`);
    skillDetailBadges.innerHTML = badges.join("");
  }

  if (skillDetailEdit) {
    const editing = editingSkillId === skill.id;
    skillDetailEdit.style.display = editing ? "block" : "none";
    if (editing) {
      if (skillDetailEditName) skillDetailEditName.value = skill.name;
      if (skillDetailEditCategory) skillDetailEditCategory.value = skill.category || "";
      if (skillDetailEditDescription) skillDetailEditDescription.value = skill.description || "";
    }
  }
}

function renderSkills(){
  if (!skillList) return;

  let skills = getSkills();
  const q = (skillSearch?.value || "").trim().toLowerCase();
  const sortMode = skillSort?.value || "name";
  const filterMode = skillFilter?.value || "all";

  if (q) {
    skills = skills.filter(s => {
      const hay = `${s.name} ${s.category || ""} ${s.description || ""}`.toLowerCase();
      return hay.includes(q);
    });
  }
  if (filterMode === "low") skills = skills.filter(s => s.progress <= 39);
  if (filterMode === "mid") skills = skills.filter(s => s.progress >= 40 && s.progress <= 69);
  if (filterMode === "high") skills = skills.filter(s => s.progress >= 70);

  if (sortMode === "name") skills.sort((a,b) => a.name.localeCompare(b.name));
  if (sortMode === "progress") skills.sort((a,b) => b.progress - a.progress);

  skillList.innerHTML = "";
  if (emptyHint) emptyHint.style.display = skills.length ? "none" : "block";
  if (!skills.length) {
    setSelectedSkillId(null);
    lastAnalyzedSkillId = null;
    renderSkillDetail(null);
    renderSkillAnalysis(null);
    updateStats();
    return;
  }

  const selected = resolveSelectedSkillId(skills);
  setSelectedSkillId(selected);

  skills.forEach(s => {
    const item = document.createElement("div");
    item.className = "skill-item skill-card" + (s.id === selected ? " is-selected" : "");
    item.setAttribute("role", "button");
    item.setAttribute("tabindex", "0");

    const descriptionText = (s.description || "").trim();
    const tags = [];
    if (s.category) tags.push(`<div class="tpill">${escapeHTML(s.category)}</div>`);
    const openQuests = getQuests(s.id).filter(q => !q.done).length;
    tags.push(`<div class="tpill time">Offen: ${openQuests}</div>`);
    const tagsHtml = tags.length ? `<div class="tpills">${tags.join("")}</div>` : "";
    const rankLabel = getRankLabel(s.rankIndex);

    item.innerHTML = `
      <div class="skill-head">
        <div>
          <div class="skill-name">${escapeHTML(s.name)}</div>
          ${tagsHtml}
        </div>
      </div>
      <div class="skill-meta">
        <span>Rank</span>
        <span><strong>${escapeHTML(rankLabel)}</strong> - ${s.progress}%</span>
      </div>
      <div class="bar"><div style="width:${s.progress}%"></div></div>
      <div class="skill-notes">${descriptionText ? escapeHTML(descriptionText) : "Beschreibung: leer"}</div>
    `;

    item.addEventListener("click", () => {
      setSelectedSkillId(s.id);
      renderSkills();
      renderQuests();
      renderSkillAnalysis(s.id);
    });
    item.addEventListener("keydown", (e) => {
      if (e.key !== "Enter" && e.key !== " ") return;
      e.preventDefault();
      setSelectedSkillId(s.id);
      renderSkills();
      renderQuests();
      renderSkillAnalysis(s.id);
    });

    skillList.appendChild(item);
  });

  const selectedSkill = skills.find(s => s.id === selected) || null;
  renderSkillDetail(selectedSkill);
  if (selected) renderSkillAnalysis(selected);

  updateStats();
}
async function createSkillFromForm(){
  const name = (newSkillName?.value || "").trim();
  const description = (newSkillDescription?.value || "").trim();
  if (!name) {
    toast("Name fehlt", "Bitte einen Skill-Namen eingeben.");
    newSkillName?.focus();
    return;
  }

  const exists = getTrackedSkills().some(s => s.name.toLowerCase() === name.toLowerCase());
  if (exists) {
    toast("Schon vorhanden", "Diesen Skill hast du bereits.");
    return;
  }

  const userSkillId = createSkillAndTrack({
    name,
    category: "",
    description,
    progress: 0
  }, { silent: true });
  if (!userSkillId) return;

  setSelectedSkillId(userSkillId);
  renderSkills();
  renderQuests();

  const ok = await requestSkillAnalysis(userSkillId, description);
  if (ok) {
    regenQuests(userSkillId);
    renderQuests();
  }
  renderSkillAnalysis(userSkillId);
  toast("Skill erstellt", name);

  if (newSkillName) newSkillName.value = "";
  if (newSkillDescription) newSkillDescription.value = "";
  setView("skills");
}

createSkillBtn?.addEventListener("click", () => {
  void createSkillFromForm();
});
newSkillName?.addEventListener("keydown", (e) => {
  if (e.key !== "Enter") return;
  e.preventDefault();
  void createSkillFromForm();
});

editSkillBtn?.addEventListener("click", () => {
  const skill = getSelectedSkill();
  if (!skill) return;
  editingSkillId = skill.id;
  renderSkillDetail(skill);
});
skillDetailCancelBtn?.addEventListener("click", () => {
  editingSkillId = null;
  renderSkillDetail(getSelectedSkill());
});
skillDetailSaveBtn?.addEventListener("click", () => {
  const skill = getSelectedSkill();
  if (!skill) return;
  const nextName = (skillDetailEditName?.value || "").trim() || skill.name;
  const nextCategory = (skillDetailEditCategory?.value || "").trim();
  const nextDescription = (skillDetailEditDescription?.value || "").trim();
  editingSkillId = null;
  updateSkillById(skill.id, { name: nextName, category: nextCategory, description: nextDescription });
  renderSkills();
  renderQuests();
});
deleteSkillBtn?.addEventListener("click", () => {
  const skill = getSelectedSkill();
  if (!skill) return;
  if (!confirm(`Skill \"${skill.name}\" loeschen?`)) return;
  deleteSkill(skill.id);
  editingSkillId = null;
  setSelectedSkillId(null);
  renderSkills();
  renderQuests();
});

skillSearch?.addEventListener("input", renderSkills);
skillSort?.addEventListener("change", renderSkills);
skillFilter?.addEventListener("change", renderSkills);
skillClearBtn?.addEventListener("click", () => {
  if (skillSearch) skillSearch.value = "";
  renderSkills();
  skillSearch?.focus();
});
skillResetBtn?.addEventListener("click", () => {
  if (skillSearch) skillSearch.value = "";
  if (skillSort) skillSort.value = "name";
  if (skillFilter) skillFilter.value = "all";
  renderSkills();
});
emptyCta?.addEventListener("click", () => {
  setView("add-skill");
  newSkillName?.focus();
});

document.addEventListener("keydown", (e) => {
  const tag = (e.target?.tagName || "").toLowerCase();
  if (tag === "input" || tag === "textarea" || tag === "select") return;
  if (e.key === "/" ) {
    e.preventDefault();
    setView("skills");
    skillSearch?.focus();
  }
  if (e.key.toLowerCase() === "n") {
    e.preventDefault();
    setView("add-skill");
    newSkillName?.focus();
  }
});

/* ========= Quests ========= */
const regenQuestsBtn = $("regenQuestsBtn");
const questList = $("questList");
const questEmptyHint = $("questEmptyHint");

function renderQuests(){
  if (!questList) return;

  const skills = getSkills();
  questList.innerHTML = "";

  if (!skills.length) {
    if (questEmptyHint) questEmptyHint.style.display = "block";
    return;
  }
  if (questEmptyHint) questEmptyHint.style.display = "none";

  const selected = resolveSelectedSkillId(skills);
  if (!selected) return;
  setSelectedSkillId(selected);

  ensureQuestsForSkill(selected);

  const quests = getQuests(selected);
  const tracked = getTrackedSkillById(selected);
  const difficulty = tracked ? getSkillDifficultyScore(tracked.skillId) : 5;
  quests.forEach(q => {
    const effectivePoints = applyDifficultyToPoints(q.points, difficulty);
    const estimatedMinutes = Number(q.estimatedMinutes);
    const unlockLevel = Number(q.unlockLevel);
    const timeBadge = Number.isFinite(estimatedMinutes) && estimatedMinutes > 0
      ? `<div class="badge-pill">${estimatedMinutes}m</div>`
      : "";
    const levelBadge = Number.isFinite(unlockLevel) && unlockLevel > 0
      ? `<div class="badge-pill">Lvl ${unlockLevel}</div>`
      : "";
    const row = document.createElement("div");
    row.className = "quest" + (q.done ? " done" : "");
    row.innerHTML = `
      <div>
        <div class="quest-title">${escapeHTML(q.title)}</div>
        <div class="quest-sub">${escapeHTML(q.desc)}</div>
      </div>
      <div class="quest-badges">
        ${timeBadge}
        ${levelBadge}
        <div class="badge-pill points">+${effectivePoints}%</div>
        <button class="small-btn" data-q="done" ${q.done ? "disabled" : ""}>
          ${q.done ? "Erledigt" : "Abschliessen"}
        </button>
      </div>
    `;
    row.querySelector('[data-q="done"]').addEventListener("click", () => completeQuest(selected, q.id));
    questList.appendChild(row);
  });

  updateStats();
}

function renderSkillAnalysis(userSkillId){
  if (!analysisResult) return;

  analysisResult.innerHTML = "";

  const targetId = userSkillId || lastAnalyzedSkillId || selectedSkillId;
  if (!targetId) {
    if (analysisEmptyHint) analysisEmptyHint.style.display = "block";
    return;
  }

  const tracked = getTrackedSkillById(targetId);
  const analysis = getAnalysisForUserSkill(targetId);
  if (!analysis) {
    if (analysisEmptyHint) analysisEmptyHint.style.display = "block";
    return;
  }
  if (analysisEmptyHint) analysisEmptyHint.style.display = "none";

  const difficulty = Number(analysis.difficultyScore) || 0;
  const levels = Array.isArray(analysis.levels) ? analysis.levels : [];
  const questPlan = Array.isArray(analysis.questPlan) ? analysis.questPlan : [];
  const levelCount = levels.length || Number(analysis.recommendedLevels) || 0;
  const metaParts = [];
  const notes = Array.isArray(analysis.notes) ? analysis.notes : [];
  const warnings = Array.isArray(analysis.warnings) ? analysis.warnings : [];
  if (tracked?.name) metaParts.push(`Skill: ${tracked.name}`);
  if (analysis.version) metaParts.push(`Version ${analysis.version}`);
  if (analysis.model) metaParts.push(analysis.model);
  if (notes.length) metaParts.push(`Hinweise: ${notes.join(" | ")}`);
  if (warnings.length) metaParts.push(`Warnungen: ${warnings.join(" | ")}`);

  const summary = document.createElement("div");
  summary.className = "quest";
  summary.innerHTML = `
    <div>
      <div class="quest-title">Analyse</div>
      <div class="quest-sub">${escapeHTML(metaParts.join(" | ") || "Analyse geladen.")}</div>
    </div>
    <div class="quest-badges">
      <div class="badge-pill points">${difficulty}/10</div>
      <div class="badge-pill">Levels: ${levelCount}</div>
    </div>
  `;
  analysisResult.appendChild(summary);

  const levelTitle = document.createElement("div");
  levelTitle.className = "hint";
  levelTitle.style.marginTop = "8px";
  levelTitle.textContent = "Level Uebersicht";
  analysisResult.appendChild(levelTitle);

  levels.forEach((level, index) => {
    const row = document.createElement("div");
    row.className = "quest";
    const criteria = Array.isArray(level.criteria) ? level.criteria.filter(Boolean) : [];
    const criteriaText = criteria.length ? `Kriterien: ${criteria.join(" | ")}` : "";
    const subText = [level.description || "", criteriaText].filter(Boolean).join(" | ");
    row.innerHTML = `
      <div>
        <div class="quest-title">Level ${index + 1}: ${escapeHTML(level.name || "")}</div>
        <div class="quest-sub">${escapeHTML(subText || "Keine Details")}</div>
      </div>
      <div class="quest-badges">
        <div class="badge-pill">Lvl ${index + 1}</div>
      </div>
    `;
    analysisResult.appendChild(row);
  });

  const questTitle = document.createElement("div");
  questTitle.className = "hint";
  questTitle.style.marginTop = "8px";
  questTitle.textContent = "Quest Plan";
  analysisResult.appendChild(questTitle);

  questPlan.forEach((quest, index) => {
    const row = document.createElement("div");
    row.className = "quest";
    const estimated = Number(quest.estimatedTime);
    const unlock = Number(quest.unlockLevel);
    const xp = Number(quest.xp);
    const timeBadge = Number.isFinite(estimated) && estimated > 0
      ? `<div class="badge-pill">${estimated}m</div>`
      : "";
    const levelBadge = Number.isFinite(unlock) && unlock > 0
      ? `<div class="badge-pill">Lvl ${unlock}</div>`
      : "";
    const xpBadge = Number.isFinite(xp) && xp > 0
      ? `<div class="badge-pill points">+${xp}%</div>`
      : "";
    row.innerHTML = `
      <div>
        <div class="quest-title">${escapeHTML(quest.title || `Quest ${index + 1}`)}</div>
        <div class="quest-sub">${escapeHTML(quest.description || "")}</div>
      </div>
      <div class="quest-badges">
        ${timeBadge}
        ${levelBadge}
        ${xpBadge}
      </div>
    `;
    analysisResult.appendChild(row);
  });
}

function buildMockAnalysis(tracked){
  const base = makeQuestTemplates(tracked.name);
  const questPlan = [];
  for (let i = 0; i < 6; i += 1) {
    const t = base[i % base.length];
    questPlan.push({
      title: t.title,
      description: t.desc,
      estimatedTime: t.estimatedMinutes || 15,
      xp: t.points || 5,
      unlockLevel: (i % RANKS.length) + 1
    });
  }
  return {
    difficultyScore: clamp(5 + (tracked.name.length % 4) - 2, 1, 10),
    recommendedLevels: RANKS.length,
    levels: RANKS.map((name, index) => ({
      name,
      description: `Stufe ${index + 1} fuer ${tracked.name}.`,
      criteria: [`Kernaufgabe in Stufe ${index + 1} sicher ausfuehren.`]
    })),
    questPlan,
    warnings: [],
    notes: ["Lokaler Stub ohne API Key."]
  };
}

async function requestSkillAnalysis(userSkillId, userDescription){
  if (analysisBusy) return false;
  const tracked = getTrackedSkillById(userSkillId);
  if (!tracked) return false;

  analysisBusy = true;
  const prevLabel = createSkillBtn?.textContent || "Analysieren & hinzufuegen";
  if (createSkillBtn) {
    createSkillBtn.disabled = true;
    createSkillBtn.textContent = "Analysiere...";
  }

  try {
    const userDesc = (userDescription || "").trim();
    if (!isSupabaseReady()) {
      const analysis = buildMockAnalysis(tracked);
      const map = getSkillAnalysisMap();
      const nextVersion = Number(map[tracked.skillId]?.version || 0) + 1;
      map[tracked.skillId] = {
        ...analysis,
        model: "local-mock",
        version: nextVersion,
        createdAt: new Date().toISOString()
      };
      setSkillAnalysisMap(map);
      lastAnalyzedSkillId = userSkillId;
      renderSkillAnalysis(userSkillId);
      if (!getQuests(userSkillId).length) {
        ensureQuestsForSkill(userSkillId, { skipRemote: true });
        renderQuests();
      }
      toast("Analyse fertig", "Lokaler Stub (kein API).");
      return true;
    }

    const { data } = await supabaseClient.auth.getSession();
    const token = data?.session?.access_token;
    if (!token) {
      toast("Login fehlt", "Bitte einloggen.");
      return false;
    }

    const response = await fetch("/api/skill-analyze", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({
        skillId: tracked.skillId,
        userDescription: userDesc
      })
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || !payload?.ok) {
      toast("Analyse fehlgeschlagen", payload?.message || "Fehler bei der Analyse.");
      return false;
    }

    const map = getSkillAnalysisMap();
    map[tracked.skillId] = payload.data;
    setSkillAnalysisMap(map);
    lastAnalyzedSkillId = userSkillId;
    renderSkillAnalysis(userSkillId);
    if (!getQuests(userSkillId).length) {
      ensureQuestsForSkill(userSkillId);
      renderQuests();
    }
    toast("Analyse fertig", "Ergebnis gespeichert.");
    return true;
  } catch (err) {
    toast("Analyse fehlgeschlagen", err?.message || "Fehler");
    return false;
  } finally {
    analysisBusy = false;
    if (createSkillBtn) {
      createSkillBtn.disabled = false;
      createSkillBtn.textContent = prevLabel;
    }
  }
}

async function completeQuest(skillId, questId){
  const quests = getQuests(skillId);
  const i = quests.findIndex(q => q.id === questId);
  if (i === -1 || quests[i].done) return;

  quests[i].done = true;
  quests[i].status = "done";
  quests[i].completedAt = new Date().toISOString();
  setQuests(skillId, quests);

  const tracked = getTrackedSkillById(skillId);
  const difficulty = tracked ? getSkillDifficultyScore(tracked.skillId) : 5;
  const effectivePoints = applyDifficultyToPoints(quests[i].points, difficulty);

  updateSkillProgressById(skillId, quests[i].points);
  renderQuests();
  toast("Quest erledigt", `+${effectivePoints}% Progress`);

  if (isSupabaseReady()) {
    const userId = getCurrentUserId();
    const { error } = await supabaseClient
      .from("quests")
      .update({ status: "done", completed_at: quests[i].completedAt })
      .eq("id", questId)
      .eq("user_id", userId);
    if (error) toast("Sync Fehler", "Quest nicht gespeichert.");
  }
}

regenQuestsBtn?.addEventListener("click", () => {
  const sid = resolveSelectedSkillId(getSkills());
  if (!sid) return;
  regenQuests(sid);
  renderQuests();
  toast("Neue Quests", "Frische Aufgaben generiert.");
});


/* ========= Tutorials ========= */
const TUTORIALS = [
  { title: "UI Grundlagen", tag: "design", level: "Beginner", mins: 25, desc: "Layout, Kontrast, Typo – clean & modern." },
  { title: "Figma Basics", tag: "design", level: "Beginner", mins: 30, desc: "Komponenten & Styles bauen." },
  { title: "JavaScript DOM", tag: "code", level: "Beginner", mins: 35, desc: "Events, Elemente, Interaktionen." },
  { title: "APIs verstehen", tag: "code", level: "Intermediate", mins: 40, desc: "Fetch, JSON, Requests." },
  { title: "Trainingsplan Starter", tag: "fitness", level: "Beginner", mins: 20, desc: "Plan erstellen + Progress tracken." },
  { title: "Deep Work Setup", tag: "productivity", level: "Intermediate", mins: 30, desc: "Fokus-System für Lern-Sessions." },
];

const tutorialSkillTarget = $("tutorialSkillTarget");
const tutorialSearch = $("tutorialSearch");
const tutorialTag = $("tutorialTag");
const tutorialGrid = $("tutorialGrid");

function tagLabel(tag){
  if (tag === "design") return "Design";
  if (tag === "code") return "Code";
  if (tag === "fitness") return "Fitness";
  if (tag === "productivity") return "Produktivität";
  return tag;
}

function hydrateSkillSelects(){
  const skills = getSkills();

  if (tutorialSkillTarget) {
    const prev = tutorialSkillTarget.value;
    tutorialSkillTarget.innerHTML =
      `<option value="">Quest-Skill: </option>` +
      skills.map(s => `<option value="${s.id}">${escapeHTML(s.name)}</option>`).join("");
    if (prev && skills.some(s => s.id === prev)) tutorialSkillTarget.value = prev;
  }

  renderSkillAnalysis();
}

function addTutorialAsQuest(skillId, tutorial){
  if (!skillId) {
    toast("Skill fehlt", "Wähle oben einen Quest-Skill aus.");
    return;
  }
  const quests = getQuests(skillId);

  const newQ = {
    id: uid(),
    title: `Tutorial: ${tutorial.title}`,
    desc: `Bearbeite dieses Tutorial (${tutorial.mins} min).`,
    points: 10,
    done: false,
    status: "todo",
    estimatedMinutes: tutorial.mins,
    unlockLevel: 1
  };

  quests.unshift(newQ);
  setQuests(skillId, quests);

  renderQuests();
  updateStats();
  toast("Als Quest gespeichert", "+10% wenn erledigt");
}

function renderTutorials(){
  if (!tutorialGrid) return;

  const q = (tutorialSearch?.value || "").trim().toLowerCase();
  const t = tutorialTag?.value || "all";

  let list = [...TUTORIALS];
  if (t !== "all") list = list.filter(x => x.tag === t);
  if (q) list = list.filter(x => (x.title + " " + x.desc).toLowerCase().includes(q));

  tutorialGrid.innerHTML = "";

  list.forEach(x => {
    const el = document.createElement("div");
    el.className = "tcard col-12";

    el.innerHTML = `
      <div class="thead">
        <div>
          <div class="tname">${escapeHTML(x.title)}</div>
          <div class="tpills">
            <div class="tpill">${escapeHTML(tagLabel(x.tag))}</div>
            <div class="tpill time">${x.mins} min</div>
          </div>
        </div>
        <div class="badge-pill">${escapeHTML(x.level)}</div>
      </div>

      <div class="tdesc">${escapeHTML(x.desc)}</div>

      <div class="tactions">
        <button class="btn" type="button" data-start="1">Starten</button>
        <button class="btn primary" type="button" data-quest="1">Als Quest (+10)</button>
      </div>
    `;

    el.querySelector('[data-start]')?.addEventListener("click", () => {
      toast("Tutorial gestartet", "Wenn du willst: als Quest speichern.");
    });

    el.querySelector('[data-quest]')?.addEventListener("click", () => {
      const sid = tutorialSkillTarget?.value || "";
      addTutorialAsQuest(sid, x);
      setView("skills");
    });

    tutorialGrid.appendChild(el);
  });
}

tutorialSearch?.addEventListener("input", renderTutorials);
tutorialTag?.addEventListener("change", renderTutorials);

/* ========= Coming Soon ========= */
const comingSoonForm = $("comingSoonForm");
const comingSoonEmail = $("comingSoonEmail");
comingSoonForm?.addEventListener("submit", (event) => {
  event.preventDefault();
  const email = (comingSoonEmail?.value || "").trim();
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    toast("E-Mail fehlt", "Bitte eine gueltige E-Mail eingeben.");
    return;
  }

  fetch("/api/coming-soon", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email })
  })
    .then((res) => {
      if (!res.ok) throw new Error("request failed");
      return res.json();
    })
    .then(() => {
      toast("Danke!", "Wir benachrichtigen dich sobald Elevate live ist.");
      comingSoonForm.reset();
    })
    .catch(() => {
      let list = [];
      const stored = localStorage.getItem("comingSoonEmails");
      if (stored) {
        try {
          list = JSON.parse(stored);
        } catch {
          list = [];
        }
      }
      if (!Array.isArray(list)) {
        list = [];
      }
      if (!list.includes(email)) {
        list.push(email);
        localStorage.setItem("comingSoonEmails", JSON.stringify(list));
      }
      toast("Danke!", "Lokale Speicherung aktiv. Wir geben dir Bescheid.");
      comingSoonForm.reset();
    });
});

/* ========= Admin ========= */
const adminList = $("adminList");
const adminRefresh = $("adminRefresh");
const adminExport = $("adminExport");
const adminLogin = $("adminLogin");
const adminApp = $("adminApp");
const adminLoginForm = $("adminLoginForm");
const adminUser = $("adminUser");
const adminPass = $("adminPass");
const adminLogout = $("adminLogout");

function formatDate(iso){
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("de-DE", { dateStyle: "medium", timeStyle: "short" });
}

function renderAdminRows(list){
  if (!adminList) return;
  if (!list.length) {
    adminList.innerHTML = `
      <tr>
        <td colspan="2" class="admin-empty">Noch keine Anmeldungen.</td>
      </tr>
    `;
    return;
  }
  adminList.innerHTML = list.map((entry) => `
    <tr>
      <td>${escapeHTML(entry.email || "")}</td>
      <td>${escapeHTML(formatDate(entry.createdAt || ""))}</td>
    </tr>
  `).join("");
}

async function loadAdminList(){
  if (!adminList) return;
  try {
    const res = await fetch("/api/coming-soon");
    const data = await res.json();
    if (!res.ok || !data.ok) throw new Error("failed");
    renderAdminRows(data.data || []);
  } catch {
    toast("Fehler", "Admin Liste konnte nicht geladen werden.");
  }
}

function setAdminView(isAuthed){
  adminLogin?.classList.toggle("hidden", isAuthed);
  adminApp?.classList.toggle("hidden", !isAuthed);
}

async function checkAdmin(){
  if (!document.body.classList.contains("admin-page")) return;
  try {
    const res = await fetch("/api/admin/me");
    const data = await res.json();
    const authed = Boolean(data?.admin);
    setAdminView(authed);
    if (authed) loadAdminList();
  } catch {
    setAdminView(false);
  }
}

function exportAdminCsv(){
  if (!adminList) return;
  const rows = Array.from(adminList.querySelectorAll("tr"))
    .map((tr) => Array.from(tr.querySelectorAll("td")).map((td) => td.textContent || "").slice(0, 2));
  if (!rows.length || (rows.length === 1 && rows[0][0] === "Noch keine Anmeldungen.")) {
    toast("Keine Daten", "Noch keine Eintraege zum Export.");
    return;
  }
  const csv = ["email,created_at"]
    .concat(rows.map((r) => `"${(r[0] || "").replaceAll('"', '""')}","${(r[1] || "").replaceAll('"', '""')}"`))
    .join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "early-access.csv";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

adminRefresh?.addEventListener("click", loadAdminList);
adminExport?.addEventListener("click", exportAdminCsv);
adminLoginForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  const username = (adminUser?.value || "").trim();
  const password = (adminPass?.value || "").trim();
  if (!username || !password) {
    toast("Fehlende Daten", "Username und Passwort eingeben.");
    return;
  }
  try {
    const res = await fetch("/api/admin/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password })
    });
    if (!res.ok) throw new Error("login failed");
    setAdminView(true);
    adminLoginForm.reset();
    loadAdminList();
  } catch {
    toast("Login fehlgeschlagen", "Bitte Daten pruefen.");
  }
});
adminLogout?.addEventListener("click", async () => {
  try {
    await fetch("/api/admin/logout", { method: "POST" });
  } finally {
    setAdminView(false);
  }
});
if (document.body.classList.contains("admin-page")) {
  checkAdmin();
}

/* ========= Boot ========= */
async function boot(){
  const user = await checkAuth();
  if (!user) return; // not logged in: keep landing visible

  await initAppUI();
}

boot();










