/*******************************
 * Elevate - script.js (Supabase Auth)
 * Uses Supabase OAuth providers.
 *******************************/

const LS = {
  theme: "elevate_theme",
  skills: "elevate_skills",
  view: "elevate_view",
  quests: "elevate_quests", // { [skillId]: Quest[] }
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
  return (crypto && crypto.randomUUID) ? crypto.randomUUID() : String(Date.now()) + "_" + Math.random().toString(16).slice(2);
}
function sleep(ms){ return new Promise(r => setTimeout(r, ms)); }

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
const reveals = document.querySelectorAll(".reveal");
const io = new IntersectionObserver((entries) => {
  for (const e of entries) {
    if (e.isIntersecting) {
      e.target.classList.add("show");
      io.unobserve(e.target);
    }
  }
}, { threshold: 0.15 });
reveals.forEach(el => io.observe(el));

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
      return null;
    }
    const { data, error } = await supabaseClient.auth.getSession();
    if (error || !data?.session) {
      document.body.classList.remove("authed");
      return null;
    }
    const user = data.session.user;
    document.body.classList.add("authed");
    displayUser(user);
    syncProfile(user);
    return user;
  } catch {
    document.body.classList.remove("authed");
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
      toast("Ungueltiger Username", "3-20 Zeichen: a-z, 0-9, Punkt, Bindestrich, Unterstrich.");
      return;
    }
    const available = await isUsernameAvailable(username);
    if (!available) {
      toast("Username vergeben", "Bitte einen anderen waehlen.");
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
        toast("E-Mail bereits registriert", "Bitte einloggen oder Passwort zuruecksetzen.");
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
function initAppUI(){
  if (appInitialized) return;
  appInitialized = true;

  initStorageOnce();
  renderRecommended();
  renderSkills();
  hydrateSkillSelects();
  renderQuests();
  updateStats();
  renderTutorials();

  const last = localStorage.getItem(LS.view) || "dashboard";
  setView(last, { animate: false });
}

supabaseClient?.auth.onAuthStateChange((_event, session) => {
  if (session?.user) {
    document.body.classList.add("authed");
    displayUser(session.user);
    syncProfile(session.user);
    initAppUI();
    if (window.location.pathname.endsWith("/login.html")) {
      window.location.href = "./index.html";
    }
  } else {
    document.body.classList.remove("authed");
  }
});

/* ========= Storage init ========= */
function initStorageOnce(){
  if (!localStorage.getItem(LS.skills)) {
    saveJSON(LS.skills, [
      { id: uid(), name: "JavaScript", progress: 40 },
      { id: uid(), name: "Web Design", progress: 60 },
    ]);
  }
  if (!localStorage.getItem(LS.quests)) {
    saveJSON(LS.quests, {}); // mapping
  }
}

/* ========= Views (Tabs) + Animations ========= */
const viewTitle = $("viewTitle");
const viewSub = $("viewSub");
const primaryAction = $("primaryAction");
const appShell = $("appShell");
const toggleSidebar = $("toggleSidebar");

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
  dashboard: { el: $("view-dashboard"), title: "Dashboard", sub: "Dein Überblick. Starte mit einem Skill.", action: "Zu Skills" },
  skills: { el: $("view-skills"), title: "Skills", sub: "Skills & Quests verwalten – Progress durch Aufgaben.", action: "Neuen Skill" },
  tutorials: { el: $("view-tutorials"), title: "Tutorials", sub: "Suchen, filtern und als Quest speichern.", action: "Zu Skills" },
  settings: { el: $("view-settings"), title: "Settings", sub: "Profil und Account verwalten.", action: "Profil speichern" },
};

async function setView(name, opts = { animate: true }){
  const v = views[name] ? name : "dashboard";
  const current = localStorage.getItem(LS.view) || "dashboard";
  if (v === current && opts.animate !== false) return;

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

  if (!curEl || !nextEl) return;

  if (opts.animate === false) {
    Object.keys(views).forEach(k => views[k].el?.classList.toggle("view-active", k === v));
    return;
  }

  // animate out current
  curEl.classList.add("view-anim-exit");
  await sleep(180);
  curEl.classList.remove("view-anim-exit");
  curEl.classList.remove("view-active");

  // show next + animate in
  nextEl.classList.add("view-active");
  nextEl.classList.add("view-anim-enter");
  await sleep(240);
  nextEl.classList.remove("view-anim-enter");

  // UX: keep app top in view
  document.getElementById("appShell")?.scrollIntoView({ behavior: "smooth" });
}

document.querySelectorAll(".side-link").forEach(btn => {
  btn.addEventListener("click", () => setView(btn.getAttribute("data-view")));
});

$("goSkills")?.addEventListener("click", () => setView("skills"));
$("goTutorials")?.addEventListener("click", () => setView("tutorials"));

primaryAction?.addEventListener("click", () => {
  const current = localStorage.getItem(LS.view) || "dashboard";
  if (current === "dashboard") setView("skills");
  else if (current === "skills") $("skillName")?.focus();
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
    toast("Ungueltiger Username", "3-20 Zeichen: a-z, 0-9, Punkt, Bindestrich, Unterstrich.");
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
    toast("Username vergeben", "Bitte einen anderen waehlen.");
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
const skillName = $("skillName");
const skillProgress = $("skillProgress");
const progressLabel = $("progressLabel");
const addSkillBtn = $("addSkillBtn");
const skillList = $("skillList");
const emptyHint = $("emptyHint");

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
let editingSkillId = null;
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

const recoChips = $("recoChips");
const RECOMMENDED = ["Python", "JavaScript", "Web Design", "UI/UX", "Fitness", "Englisch", "Mathe", "Produktivität"];

function getSkills(){ return loadJSON(LS.skills, []); }
function setSkills(skills){ saveJSON(LS.skills, skills); }

function getQuestMap(){ return loadJSON(LS.quests, {}); }
function setQuestMap(map){ saveJSON(LS.quests, map); }
function getQuests(skillId){ return getQuestMap()[skillId] || []; }
function setQuests(skillId, quests){
  const map = getQuestMap();
  map[skillId] = quests;
  setQuestMap(map);
}

function updateStats(){
  const skills = getSkills();
  if (statActive) statActive.textContent = String(skills.length);

  const qmap = getQuestMap();
  let open = 0;
  for (const sid of Object.keys(qmap)) {
    open += (qmap[sid] || []).filter(q => !q.done).length;
  }
  if (statQuests) statQuests.textContent = String(open);

  updateXP(skills);
  renderTodayPlan(skills, open);
}
function updateXP(skills){
  if (!xpLevel && !xpProgress && !xpBar && !topXpBar && !topXpText) return;
  const total = skills.reduce((sum, s) => sum + (Number(s.progress) || 0), 0);
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
  RECOMMENDED.forEach(name => {
    const b = document.createElement("button");
    b.className = "chip";
    b.type = "button";
    b.textContent = name;
    b.addEventListener("click", () => {
      addSkill(name, 35);
      toast("Skill hinzugefügt", name);
    });
    recoChips.appendChild(b);
  });
}

const REWARDS = [
  { level: 2, title: "Bronze Badge", category: "Badges", desc: "Erstes Profil-Badge freigeschaltet." },
  { level: 3, title: "Focus Theme", category: "Theme", desc: "Ruhiger Farbmodus fuer Fokus." },
  { level: 4, title: "Quest Booster", category: "Quests", desc: "+1 Extra-Quest pro Skill." },
  { level: 5, title: "Streak Boost", category: "Streak", desc: "Streak zeigt dir 7-Tage-Serie." },
  { level: 6, title: "Milestone Frame", category: "Profil", desc: "Avatar-Rahmen fuer Meilensteine." },
  { level: 7, title: "Pro Highlight", category: "Pro", desc: "Skill-Karten mit Highlight." },
  { level: 8, title: "Weekly Summary", category: "Insights", desc: "Kurzer Wochen-Rueckblick." }
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
    title: "Datenschutzerklaerung (Schweiz)",
    body: `
      <h4>1. Grundsatz</h4>
      <p>Der Schutz Ihrer Personendaten ist uns ein wichtiges Anliegen. Diese Datenschutzerklaerung informiert ueber die Bearbeitung von Personendaten im Zusammenhang mit dieser Website und den damit verbundenen Dienstleistungen. Wir bearbeiten Personendaten im Einklang mit dem Schweizer Datenschutzgesetz (DSG) sowie, soweit anwendbar, der DSGVO.</p>
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
      <p>Es werden keine Tracking-Cookies eingesetzt. Technisch notwendige Daten koennen zur Bereitstellung der Funktionen verwendet werden. Einstellungen wie Theme koennen lokal gespeichert werden.</p>
      <h4>7. Datenweitergabe</h4>
      <p>Wir geben Personendaten nur weiter, wenn dies fuer den Betrieb erforderlich ist oder eine rechtliche Grundlage besteht. Dienstleister: Supabase (Authentifizierung), Vercel (Hosting). Wir verkaufen keine Personendaten.</p>
      <h4>8. Datenuebermittlung ins Ausland</h4>
      <p>Je nach Dienstleister koennen Daten in Laender ausserhalb der Schweiz uebermittelt werden. Es werden geeignete Garantien eingesetzt (z.B. Standardvertragsklauseln).</p>
      <h4>9. Datensicherheit</h4>
      <p>Angemessene technische und organisatorische Massnahmen (TLS/SSL, Zugriffskontrolle, Sicherheitsupdates).</p>
      <h4>10. Aufbewahrungsdauer</h4>
      <p>Kontodaten bis zur Loeschung des Kontos. Lokale Daten bleiben im Browser, bis sie geloescht werden.</p>
      <h4>11. Ihre Rechte</h4>
      <p>Auskunft, Berichtigung, Loeschung, Widerspruch, Datenherausgabe. Kontakt: Backerluis231@gmail.com</p>
      <h4>12. Beschwerderecht</h4>
      <p>Beschwerde bei der zustaendigen Behoerde (EDOEB): www.edoeb.admin.ch</p>
      <h4>13. Aenderungen</h4>
      <p>Wir koennen diese Datenschutzerklaerung anpassen. Die aktuelle Version ist hier abrufbar.</p>
    `
  },
  agb: {
    title: "AGB (Schweiz) – Demo",
    body: `
      <h4>1. Geltungsbereich</h4>
      <p>Diese Allgemeinen Geschaeftsbedingungen (AGB) gelten fuer alle Dienstleistungen, die ueber diese Website angeboten werden. Mit der Nutzung der Dienste erklaeren Sie sich mit diesen AGB einverstanden. Abweichende Bedingungen werden nicht anerkannt, ausser wir stimmen schriftlich zu.</p>
      <p>Die AGB gelten fuer kostenlose Nutzung sowie fuer kostenpflichtige Abonnements. Mit Registrierung oder Nutzung bestaetigen Sie, dass Sie diese Bedingungen gelesen und verstanden haben.</p>

      <h4>2. Vertragspartner</h4>
      <p>Vertragspartner ist: Luis Backer, 6033 Buchrain, Schweiz. E-Mail: Backerluis231@gmail.com (nachfolgend "Anbieter").</p>

      <h4>3. Leistungsbeschreibung</h4>
      <p>Elevate ist ein Skill-Tracker. Der Service umfasst je nach Funktionsumfang:</p>
      <p><strong>3.1 Basisfunktionen</strong><br>Skills verwalten, Fortschritt setzen, Quests erstellen und abschliessen, Tutorials speichern.</p>
      <p><strong>3.2 Gamification</strong><br>Level/XP, Badges und Belohnungen, Fortschrittsanzeigen.</p>
      <p><strong>3.3 Erweiterte Funktionen (Pro)</strong><br>Erweiterte Statistikfunktionen, zusaetzliche Quests, erweiterte Personalisierung (Platzhalter).</p>
      <p><strong>3.4 Wichtiger Hinweis</strong><br>Die Ergebnisse dienen als Motivation und Orientierung und ersetzen keine professionelle Beratung.</p>

      <h4>4. Vertragsschluss und Registrierung</h4>
      <p>Der Vertrag kommt durch Registrierung und Zustimmung zu diesen AGB zustande. Bei kostenpflichtigen Abonnements erfolgt der Vertragsschluss mit erfolgreicher Zahlung.</p>
      <p>Sie sind verpflichtet, korrekte Angaben zu machen und Ihre Zugangsdaten vertraulich zu behandeln.</p>

      <h4>5. Preise und Zahlungsbedingungen</h4>
      <p>Es gibt Free- und Pro-Nutzung. Preise und Leistungsumfang werden auf der Website angezeigt. Zahlungen erfolgen im Voraus ueber einen externen Zahlungsanbieter (Platzhalter).</p>
      <p>Preisänderungen werden rechtzeitig bekannt gegeben und gelten ab der naechsten Abrechnungsperiode.</p>

      <h4>6. Vertragslaufzeit und Kuendigung</h4>
      <p>Pro-Abonnements laufen monatlich und verlaengern sich automatisch, sofern nicht vor Ablauf gekuendigt wird. Eine Kuendigung ist zum Ende der Abrechnungsperiode moeglich.</p>
      <p>Der Anbieter kann den Vertrag aus wichtigem Grund fristlos kuendigen (z.B. Missbrauch, Zahlungsverzug).</p>

      <h4>7. Widerrufsrecht (falls anwendbar)</h4>
      <p>Sofern rechtlich erforderlich, gilt ein 14-taegiges Widerrufsrecht. Zur Ausuebung kontaktieren Sie: Backerluis231@gmail.com.</p>
      <p>Das Widerrufsrecht kann vorzeitig erloeschen, wenn Sie der Ausfuehrung vor Ablauf der Frist zustimmen.</p>

      <h4>8. Nutzungsrechte und Pflichten</h4>
      <p>Die Nutzung ist fuer private Zwecke gestattet. Verboten sind Missbrauch, automatisierte Zugriffe, Weitergabe von Zugangsdaten sowie rechtswidrige Inhalte.</p>
      <p>Sie duerfen Ihre eigenen Inhalte nutzen. Rechte Dritter sind zu respektieren.</p>

      <h4>9. Geistiges Eigentum</h4>
      <p>Alle Rechte an Design, Code und Inhalten verbleiben beim Anbieter. Die Nutzung gewaehrt keine Eigentumsrechte.</p>

      <h4>10. Datenschutz</h4>
      <p>Die Verarbeitung personenbezogener Daten erfolgt gemaess der Datenschutzerklaerung. Mit Nutzung der Dienste stimmen Sie dieser zu.</p>

      <h4>11. Haftungsausschluss</h4>
      <p>Der Anbieter haftet nicht fuer indirekte Schaeden, entgangenen Gewinn oder Folgeschaeden, soweit gesetzlich zulaessig.</p>
      <p>Bei nicht ausschliessbarer Haftung ist diese auf die in den letzten 12 Monaten bezahlten Betraege begrenzt (max. CHF 100).</p>

      <h4>12. Verfuegbarkeit und Gewaehrleistung</h4>
      <p>Es wird keine durchgehende Verfuegbarkeit garantiert. Wartungen und Stoerungen sind moeglich. Ein Anspruch auf Entschaedigung besteht nicht.</p>

      <h4>13. Aenderungen des Services und der AGB</h4>
      <p>Der Anbieter kann den Service und diese AGB anpassen. Wesentliche Aenderungen werden angemessen mitgeteilt.</p>

      <h4>14. Salvatorische Klausel</h4>
      <p>Unwirksame Bestimmungen beruehren die Gueltigkeit der uebrigen Bestimmungen nicht.</p>

      <h4>15. Anwendbares Recht und Gerichtsstand</h4>
      <p>Es gilt schweizerisches Recht. Gerichtsstand ist, soweit zulaessig, der Wohnsitz des Anbieters.</p>

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
      <p>Der Autor uebernimmt keine Gewaehr fuer die Richtigkeit, Genauigkeit, Aktualitaet, Zuverlaessigkeit und Vollstaendigkeit der Informationen.</p>
      <p>Haftungsansprueche gegen den Autor wegen Schaeden materieller oder immaterieller Art, die aus dem Zugriff oder der Nutzung bzw. Nichtnutzung der veroeffentlichten Informationen, durch Missbrauch der Verbindung oder durch technische Stoerungen entstanden sind, werden ausgeschlossen.</p>
      <p>Alle Angebote sind freibleibend. Der Autor behaelt es sich vor, Teile der Seiten oder das gesamte Angebot ohne Ankuendigung zu veraendern, zu ergaenzen, zu loeschen oder die Veroeffentlichung zeitweise oder endgueltig einzustellen.</p>
      <h4>Haftungsausschluss fuer Links</h4>
      <p>Verweise und Links auf Websites Dritter liegen ausserhalb unseres Verantwortungsbereichs. Es wird jegliche Verantwortung fuer solche Websites abgelehnt. Der Zugriff und die Nutzung erfolgen auf eigene Gefahr.</p>
      <h4>Urheberrechte</h4>
      <p>Die Urheber- und alle anderen Rechte an Inhalten, Bildern, Fotos oder anderen Dateien auf dieser Website gehoeren ausschliesslich dem Betreiber oder den speziell genannten Rechteinhabern.</p>
      <p>Fuer die Reproduktion jeglicher Elemente ist die schriftliche Zustimmung des Urheberrechtstraegers im Voraus einzuholen.</p>
      <h4>Anwendbares Recht und Gerichtsstand</h4>
      <p>Diese Website sowie deren Inhalte unterliegen dem Schweizer Recht. Ausschliesslicher Gerichtsstand ist Buchrain, Schweiz, soweit gesetzlich zulaessig.</p>
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
    { title: `10 Min üben: ${skillName}`, desc: "Timer an, kurz und fokussiert.", points: 5 },
    { title: `Mini-Output bauen`, desc: "Etwas Kleines erstellen (Snippet/Design/Übung).", points: 10 },
    { title: `1 Tutorial-Teil anschauen`, desc: "Ein Abschnitt reicht – nicht perfekt sein.", points: 7 },
  ];
}

function ensureQuestsForSkill(skillId){
  const skills = getSkills();
  const s = skills.find(x => x.id === skillId);
  if (!s) return;

  const existing = getQuests(skillId);
  if (existing.length) return;

  const quests = makeQuestTemplates(s.name).map(t => ({
    id: uid(),
    title: t.title,
    desc: t.desc,
    points: t.points,
    done: false
  }));
  setQuests(skillId, quests);
}

function regenQuests(skillId){
  const skills = getSkills();
  const s = skills.find(x => x.id === skillId);
  if (!s) return;

  const quests = makeQuestTemplates(s.name).map(t => ({
    id: uid(),
    title: t.title,
    desc: t.desc,
    points: t.points,
    done: false
  }));
  setQuests(skillId, quests);
}

function addSkill(name, progress){
  const trimmed = (name || "").trim();
  if (!trimmed) return;

  const skills = getSkills();
  const exists = skills.some(s => s.name.toLowerCase() === trimmed.toLowerCase());
  if (exists) { toast("Schon vorhanden", "Diesen Skill hast du bereits."); return; }

  const id = uid();
  skills.unshift({ id, name: trimmed, progress: clamp(progress ?? 50, 0, 100), notes: "" });
  setSkills(skills);

  ensureQuestsForSkill(id);

  renderSkills();
  hydrateSkillSelects();
  renderQuests();
  updateStats();
}

function updateSkillProgressById(skillId, delta){
  const skills = getSkills();
  const i = skills.findIndex(s => s.id === skillId);
  if (i === -1) return;

  skills[i].progress = clamp(skills[i].progress + delta, 0, 100);
  setSkills(skills);

  renderSkills();
  updateStats();
}

function updateSkillById(skillId, data){
  const skills = getSkills();
  const i = skills.findIndex(s => s.id === skillId);
  if (i === -1) return;

  const nextName = (data.name ?? skills[i].name).trim();
  const nextNotes = data.notes ?? skills[i].notes ?? "";
  if (!nextName) return;

  skills[i].name = nextName;
  skills[i].notes = String(nextNotes);
  setSkills(skills);

  renderSkills();
  updateStats();
}

function deleteSkill(id){
  const ok = confirm("Skill wirklich loeschen?");
  if (!ok) return;
  setSkills(getSkills().filter(s => s.id !== id));

  const qmap = getQuestMap();
  delete qmap[id];
  setQuestMap(qmap);

  renderSkills();
  hydrateSkillSelects();
  renderQuests();
  updateStats();
  toast("Skill geloescht", "Und Quests entfernt.");
}

function renderSkills(){
  if (!skillList) return;

  let skills = getSkills();
  const q = (skillSearch?.value || "").trim().toLowerCase();
  const sortMode = skillSort?.value || "name";
  const filterMode = skillFilter?.value || "all";

  if (q) skills = skills.filter(s => s.name.toLowerCase().includes(q));
  if (filterMode === "low") skills = skills.filter(s => s.progress <= 39);
  if (filterMode === "mid") skills = skills.filter(s => s.progress >= 40 && s.progress <= 69);
  if (filterMode === "high") skills = skills.filter(s => s.progress >= 70);

  if (sortMode === "name") skills.sort((a,b) => a.name.localeCompare(b.name));
  if (sortMode === "progress") skills.sort((a,b) => b.progress - a.progress);

  skillList.innerHTML = "";
  if (emptyHint) emptyHint.style.display = skills.length ? "none" : "block";

  skills.forEach(s => {
    const item = document.createElement("div");
    item.className = "skill-item";

    const isEditing = editingSkillId === s.id;
    const notesText = (s.notes || "").trim();

    item.innerHTML = `
      <div class="skill-head">
        <div class="skill-name">${escapeHTML(s.name)}</div>
        <div class="skill-actions">
          <button class="small-btn" data-a="minus" title="-5">-5</button>
          <button class="small-btn" data-a="plus" title="+5">+5</button>
          <button class="small-btn" data-a="edit" title="Bearbeiten">Edit</button>
          <button class="small-btn danger" data-a="del" title="Loeschen">X</button>
        </div>
      </div>
      <div class="skill-meta">
        <span>Progress</span>
        <span><strong>${s.progress}%</strong></span>
      </div>
      <div class="bar"><div style="width:${s.progress}%"></div></div>
      ${isEditing ? `
        <div class="skill-edit">
          <input class="skill-input" id="skillEditName-${s.id}" value="${escapeHTML(s.name)}" />
          <textarea class="skill-textarea" id="skillEditNotes-${s.id}" rows="3" placeholder="Notizen...">${escapeHTML(notesText)}</textarea>
          <div class="skill-edit-actions">
            <button class="small-btn" data-a="save">Speichern</button>
            <button class="small-btn" data-a="cancel">Abbrechen</button>
          </div>
        </div>
      ` : `
        <div class="skill-notes">${notesText ? escapeHTML(notesText) : "Notizen: leer"}</div>
      `}
    `;

    item.querySelector('[data-a="minus"]').addEventListener("click", () => updateSkillProgressById(s.id, -5));
    item.querySelector('[data-a="plus"]').addEventListener("click", () => updateSkillProgressById(s.id, +5));
    item.querySelector('[data-a="del"]').addEventListener("click", () => deleteSkill(s.id));
    item.querySelector('[data-a="edit"]').addEventListener("click", () => {
      editingSkillId = s.id;
      renderSkills();
      document.getElementById(`skillEditName-${s.id}`)?.focus();
    });
    item.querySelector('[data-a="cancel"]')?.addEventListener("click", () => {
      editingSkillId = null;
      renderSkills();
    });
    item.querySelector('[data-a="save"]')?.addEventListener("click", () => {
      const nameEl = document.getElementById(`skillEditName-${s.id}`);
      const notesEl = document.getElementById(`skillEditNotes-${s.id}`);
      const nextName = nameEl?.value || s.name;
      const nextNotes = notesEl?.value || "";
      editingSkillId = null;
      updateSkillById(s.id, { name: nextName, notes: nextNotes });
    });

    skillList.appendChild(item);
  });

  updateStats();
}
if (skillProgress && progressLabel){
  progressLabel.textContent = `${skillProgress.value}%`;
  skillProgress.addEventListener("input", () => {
    progressLabel.textContent = `${skillProgress.value}%`;
  });
}

addSkillBtn?.addEventListener("click", () => {
  addSkill(skillName?.value || "", Number(skillProgress?.value ?? 50));
  if (skillName) skillName.value = "";
});
skillName?.addEventListener("keydown", (e) => {
  if (e.key !== "Enter") return;
  e.preventDefault();
  addSkill(skillName?.value || "", Number(skillProgress?.value ?? 50));
  if (skillName) skillName.value = "";
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
  setView("skills");
  skillName?.focus();
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
    setView("skills");
    skillName?.focus();
  }
});

/* ========= Quests ========= */
const questSkillSelect = $("questSkillSelect");
const regenQuestsBtn = $("regenQuestsBtn");
const questList = $("questList");
const questEmptyHint = $("questEmptyHint");

function renderQuests(){
  if (!questSkillSelect || !questList) return;

  const skills = getSkills();
  questList.innerHTML = "";

  if (!skills.length) {
    if (questEmptyHint) questEmptyHint.style.display = "block";
    questSkillSelect.innerHTML = `<option value="">Kein Skill</option>`;
    return;
  }
  if (questEmptyHint) questEmptyHint.style.display = "none";

  const selected = questSkillSelect.value || skills[0].id;
  questSkillSelect.value = selected;

  ensureQuestsForSkill(selected);

  const quests = getQuests(selected);
  quests.forEach(q => {
    const row = document.createElement("div");
    row.className = "quest" + (q.done ? " done" : "");
    row.innerHTML = `
      <div>
        <div class="quest-title">${escapeHTML(q.title)}</div>
        <div class="quest-sub">${escapeHTML(q.desc)}</div>
      </div>
      <div class="quest-badges">
        <div class="badge-pill points">+${q.points}%</div>
        <button class="small-btn" data-q="done" ${q.done ? "disabled" : ""}>
          ${q.done ? "Erledigt" : "Abschließen"}
        </button>
      </div>
    `;
    row.querySelector('[data-q="done"]').addEventListener("click", () => completeQuest(selected, q.id));
    questList.appendChild(row);
  });

  updateStats();
}

function completeQuest(skillId, questId){
  const quests = getQuests(skillId);
  const i = quests.findIndex(q => q.id === questId);
  if (i === -1 || quests[i].done) return;

  quests[i].done = true;
  setQuests(skillId, quests);

  updateSkillProgressById(skillId, quests[i].points);
  renderQuests();
  toast("Quest erledigt ✅", `+${quests[i].points}% Progress`);
}

regenQuestsBtn?.addEventListener("click", () => {
  const sid = questSkillSelect?.value;
  if (!sid) return;
  regenQuests(sid);
  renderQuests();
  toast("Neue Quests", "Frische Aufgaben generiert.");
});

questSkillSelect?.addEventListener("change", () => renderQuests());

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

  if (questSkillSelect) {
    const prev = questSkillSelect.value;
    questSkillSelect.innerHTML = skills.length
      ? skills.map(s => `<option value="${s.id}">${escapeHTML(s.name)}</option>`).join("")
      : `<option value="">Kein Skill</option>`;
    if (prev && skills.some(s => s.id === prev)) questSkillSelect.value = prev;
  }

  if (tutorialSkillTarget) {
    const prev = tutorialSkillTarget.value;
    tutorialSkillTarget.innerHTML =
      `<option value="">Quest-Skill: —</option>` +
      skills.map(s => `<option value="${s.id}">${escapeHTML(s.name)}</option>`).join("");
    if (prev && skills.some(s => s.id === prev)) tutorialSkillTarget.value = prev;
  }
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
    done: false
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

/* ========= Boot ========= */
async function boot(){
  const user = await checkAuth();
  if (!user) return; // not logged in: keep landing visible

  initAppUI();
}

boot();








