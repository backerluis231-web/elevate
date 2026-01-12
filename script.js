/*******************************
 * Elevate - script.js (Supabase Auth)
 * Uses Supabase OAuth providers.
 *******************************/

const LS = {
  theme: "elevate_theme",
  skills: "elevate_skills",
  view: "elevate_view",
  quests: "elevate_quests" // { [skillId]: Quest[] }
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

/* ========= Modal open/close ========= */
const modal = $("modal");

const openLogin = $("openLogin");
const openLogin2 = $("openLogin2");
const openLogin3 = $("openLogin3");
const openLogin4 = $("openLogin4");
const openLogin5 = $("openLogin5");

const closeModal = $("closeModal");
const cancelBtn = $("cancelBtn");

function openModal(){
  if (!modal) return;
  modal.style.display = "flex";
}
function hideModal(){
  if (!modal) return;
  modal.style.display = "none";
}

openLogin?.addEventListener("click", openModal);
openLogin2?.addEventListener("click", openModal);
openLogin3?.addEventListener("click", openModal);
openLogin4?.addEventListener("click", openModal);
openLogin5?.addEventListener("click", openModal);

closeModal?.addEventListener("click", hideModal);
cancelBtn?.addEventListener("click", hideModal);
modal?.addEventListener("click", (e) => { if (e.target === modal) hideModal(); });

/* ========= Supabase Auth ========= */
const SUPABASE_URL = "https://rippjxcshbgynurtttar.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJpcHBqeGNzaGJneW51cnR0dGFyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjgyMzYxMjIsImV4cCI6MjA4MzgxMjEyMn0.dtkW8ENJldBYkYwOa5IfB7E2GHI5LOaFuce5-ovM2W4";
const supabase = window.supabase?.createClient
  ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
  : null;

const googleLoginBtn = $("googleLoginBtn");
const microsoftLoginBtn = $("microsoftLoginBtn");
const logoutTop = $("logoutTop");
const logoutSide = $("logoutSide");
const userNameLabel = $("userNameLabel");

function displayUser(user){
  if (!userNameLabel) return;
  const meta = user.user_metadata || {};
  userNameLabel.textContent = meta.full_name || meta.name || user.email || "User";
}

async function checkAuth() {
  try {
    if (!supabase) {
      document.body.classList.remove("authed");
      return null;
    }
    const { data, error } = await supabase.auth.getSession();
    if (error || !data?.session) {
      document.body.classList.remove("authed");
      return null;
    }
    const user = data.session.user;
    document.body.classList.add("authed");
    displayUser(user);
    return user;
  } catch {
    document.body.classList.remove("authed");
    return null;
  }
}

async function startOAuth(provider){
  if (!supabase) {
    toast("Login Fehler", "Supabase nicht geladen.");
    return;
  }
  const { error } = await supabase.auth.signInWithOAuth({
    provider,
    options: { redirectTo: window.location.origin }
  });
  if (error) toast("Login fehlgeschlagen", error.message);
}

async function logout(){
  try {
    await supabase?.auth.signOut();
  } catch {}
  location.reload();
}

googleLoginBtn?.addEventListener("click", () => startOAuth("google"));
microsoftLoginBtn?.addEventListener("click", () => startOAuth("microsoft"));
logoutTop?.addEventListener("click", logout);
logoutSide?.addEventListener("click", logout);

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

supabase?.auth.onAuthStateChange((_event, session) => {
  if (session?.user) {
    document.body.classList.add("authed");
    displayUser(session.user);
    initAppUI();
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

const views = {
  dashboard: { el: $("view-dashboard"), title: "Dashboard", sub: "Dein Überblick. Starte mit einem Skill.", action: "Zu Skills" },
  skills: { el: $("view-skills"), title: "Skills", sub: "Skills & Quests verwalten – Progress durch Aufgaben.", action: "Neuen Skill" },
  tutorials: { el: $("view-tutorials"), title: "Tutorials", sub: "Suchen, filtern und als Quest speichern.", action: "Zu Skills" },
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

const skillSearch = $("skillSearch");
const skillSort = $("skillSort");
const skillFilter = $("skillFilter");

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
  skills.unshift({ id, name: trimmed, progress: clamp(progress ?? 50, 0, 100) });
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

function deleteSkill(id){
  setSkills(getSkills().filter(s => s.id !== id));

  const qmap = getQuestMap();
  delete qmap[id];
  setQuestMap(qmap);

  renderSkills();
  hydrateSkillSelects();
  renderQuests();
  updateStats();
  toast("Skill gelöscht", "Und Quests entfernt.");
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
    item.innerHTML = `
      <div class="skill-head">
        <div class="skill-name">${escapeHTML(s.name)}</div>
        <div class="skill-actions">
          <button class="small-btn" data-a="minus" title="-5">-5</button>
          <button class="small-btn" data-a="plus" title="+5">+5</button>
          <button class="small-btn danger" data-a="del" title="Löschen">✕</button>
        </div>
      </div>
      <div class="skill-meta">
        <span>Progress</span>
        <span><strong>${s.progress}%</strong></span>
      </div>
      <div class="bar"><div style="width:${s.progress}%"></div></div>
    `;

    item.querySelector('[data-a="minus"]').addEventListener("click", () => updateSkillProgressById(s.id, -5));
    item.querySelector('[data-a="plus"]').addEventListener("click", () => updateSkillProgressById(s.id, +5));
    item.querySelector('[data-a="del"]').addEventListener("click", () => deleteSkill(s.id));

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

skillSearch?.addEventListener("input", renderSkills);
skillSort?.addEventListener("change", renderSkills);
skillFilter?.addEventListener("change", renderSkills);

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
    el.className = "tcard col-6";

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



