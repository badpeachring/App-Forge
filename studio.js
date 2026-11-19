if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {});

const TOKEN_KEY = "app_forge_gh_token_v1";
const NSFW_KEY = "app_forge_nsfw_v1";
const MOTION_KEY = "app_forge_motion_v1";

let ghUser = "", currentSha = null, isNewFile = false, typingTimer = null, introTimer = null, resetTimer = null;
let activeLayer = "A", currentMode = "idle", deploySeq = 0;
let nsfwEnabled = localStorage.getItem(NSFW_KEY) === "1";
let motionEnabled = localStorage.getItem(MOTION_KEY) !== "0";

const assetCache = new Map();
const $ = id => document.getElementById(id);
const getHeaders = () => ({
  "Authorization": `Bearer ${localStorage.getItem(TOKEN_KEY) || ""}`,
  "Accept": "application/vnd.github+json",
  "Content-Type": "application/json"
});

const FX_MAP = {
  idle: { cls: "fx-idle", glow: "radial-gradient(circle at 22% 52%, rgba(56,189,248,0.14), transparent 55%)" },
  hack: { cls: "fx-hack", glow: "radial-gradient(circle at 22% 52%, rgba(52,211,153,0.28), transparent 58%)" },
  wave: { cls: "fx-idle", glow: "radial-gradient(circle at 60% 45%, rgba(251,191,36,0.14), transparent 55%)" },
  celebrate: { cls: "fx-celebrate", glow: "radial-gradient(circle at 30% 48%, rgba(16,185,129,0.32), transparent 65%)" },
  sway: { cls: "fx-sway", glow: "radial-gradient(circle at 55% 50%, rgba(244,63,94,0.22), transparent 60%)" },
  kiss: { cls: "fx-idle", glow: "radial-gradient(circle at 55% 45%, rgba(236,72,153,0.24), transparent 60%)" },
  pose: { cls: "fx-sway", glow: "radial-gradient(circle at 55% 50%, rgba(192,38,211,0.22), transparent 60%)" },
  tease: { cls: "fx-sway", glow: "radial-gradient(circle at 55% 50%, rgba(239,68,68,0.25), transparent 60%)" }
};

function toBase64(str) {
  const bytes = new TextEncoder().encode(str);
  let bin = "";
  for (let i = 0; i < bytes.length; i += 8192) {
    bin += String.fromCharCode(...bytes.subarray(i, i + 8192));
  }
  return btoa(bin);
}

async function resolveAsset(stateName) {
  if (assetCache.has(stateName)) return assetCache.get(stateName);
  const exts = ["mp4", "webp", "png", "jpg"];
  for (const ext of exts) {
    const url = `${stateName}.${ext}`;
    try {
      const res = await fetch(url, { method: "HEAD" });
      if (res.ok) {
        const entry = { url, type: ext === "mp4" ? "video" : "image" };
        assetCache.set(stateName, entry);
        return entry;
      }
    } catch {}
  }
  assetCache.set(stateName, null);
  return null;
}

function buildMediaNode(asset, fxClass) {
  const paused = motionEnabled ? "" : " fx-paused";
  if (asset.type === "video") {
    const v = document.createElement("video");
    v.src = asset.url;
    v.autoplay = true;
    v.loop = true;
    v.muted = true;
    v.playsInline = true;
    v.className = `w-full h-full object-cover ${fxClass}${paused}`;
    return v;
  }
  const img = document.createElement("img");
  img.src = asset.url;
  img.alt = currentMode;
  img.className = `w-full h-full object-cover ${fxClass}${paused}`;
  return img;
}

async function renderScene(mode) {
  const fx = FX_MAP[mode] || FX_MAP.idle;
  $("fxGlow").style.background = fx.glow;

  let asset = await resolveAsset(mode);
  let usedFallback = false;
  if (!asset && mode !== "idle") {
    asset = await resolveAsset("idle");
    usedFallback = true;
  }

  const nextId = activeLayer === "A" ? "layerB" : "layerA";
  const prevId = activeLayer === "A" ? "layerA" : "layerB";
  const nextEl = $(nextId);
  const prevEl = $(prevId);

  if (!asset) {
    nextEl.innerHTML = `<div class="w-full h-full flex flex-col items-center justify-center text-center px-6">
      <div class="text-xs font-black uppercase tracking-widest text-rose-300">Waiting for Art Pack</div>
      <div class="text-[11px] text-amber-100/80 mt-1">Upload <b>idle</b>, <b>hack</b>, <b>wave</b>, <b>celebrate</b> assets to App-Forge root.</div>
    </div>`;
  } else {
    nextEl.innerHTML = "";
    nextEl.appendChild(buildMediaNode(asset, fx.cls));
  }

  nextEl.classList.remove("opacity-0");
  nextEl.classList.add("opacity-100");
  prevEl.classList.remove("opacity-100");
  prevEl.classList.add("opacity-0");
  activeLayer = nextId === "layerA" ? "A" : "B";
  return usedFallback;
}

async function setMjState(mode, text, { cancelIntro = true } = {}) {
  if (cancelIntro && introTimer) {
    clearTimeout(introTimer);
    introTimer = null;
  }
  if (resetTimer) {
    clearTimeout(resetTimer);
    resetTimer = null;
  }
  currentMode = mode;
  if (text) $("mjSpeech").firstElementChild.textContent = `💬 "${text}"`;
  const usedFallback = await renderScene(mode);
  if (usedFallback && text) {
    $("mjSpeech").firstElementChild.textContent = `💬 "${text} (add ${mode} asset for custom art)"`;
  }
}

function scheduleIdleReturn(delayMs, text = "Ready for the next move!") {
  if (resetTimer) clearTimeout(resetTimer);
  resetTimer = setTimeout(() => {
    setMjState("idle", text);
  }, delayMs);
}

function runGreetingSequence() {
  setMjState("wave", "Hey there! Welcome back to the loft.", { cancelIntro: false });
  introTimer = setTimeout(() => {
    introTimer = null;
    if (currentMode === "wave") {
      setMjState("idle", "Loft studio online — ready when you are.");
    }
  }, 2800);
}

function setBadge(text, tone = "idle") {
  const b = $("buildBadge");
  b.textContent = text;
  b.className = tone === "ok"
    ? "px-3 py-1 rounded-full text-[11px] font-bold bg-emerald-500/25 backdrop-blur-md border border-emerald-400 text-emerald-200"
    : tone === "busy"
    ? "px-3 py-1 rounded-full text-[11px] font-bold bg-amber-500/25 backdrop-blur-md border border-amber-400 text-amber-200"
    : "px-3 py-1 rounded-full text-[11px] font-bold bg-black/75 backdrop-blur-md border border-amber-400/35 text-amber-200";
}

function syncSettingsUI() {
  const nBtn = $("nsfwToggleBtn");
  nBtn.textContent = nsfwEnabled ? "ON" : "OFF";
  nBtn.className = nsfwEnabled
    ? "px-2.5 py-1 rounded-full text-[10px] font-black bg-rose-500 text-white"
    : "px-2.5 py-1 rounded-full text-[10px] font-black bg-slate-800 border border-rose-500/40 text-rose-300";
  $("nsfwBar").classList.toggle("hidden", !nsfwEnabled);

  const mBtn = $("motionToggleBtn");
  mBtn.textContent = motionEnabled ? "ON" : "OFF";
  mBtn.className = motionEnabled
    ? "px-2.5 py-1 rounded-full text-[10px] font-black bg-emerald-500 text-slate-950"
    : "px-2.5 py-1 rounded-full text-[10px] font-black bg-slate-800 border border-amber-500/40 text-amber-300";

  document.querySelectorAll("#stage2d img, #stage2d video").forEach(el => {
    el.classList.toggle("fx-paused", !motionEnabled);
  });
}

async function initConnection() {
  const tok = localStorage.getItem(TOKEN_KEY);
  if (!tok) return;
  $("ghToken").value = tok;
  $("tokenWrap").classList.add("hidden");
  setBadge("Connecting...", "busy");
  const uRes = await fetch("https://api.github.com/user", { headers: getHeaders() });
  if (!uRes.ok) { setBadge("Token Error"); $("tokenWrap").classList.remove("hidden"); return; }
  const u = await uRes.json();
  ghUser = u.login;
  const rRes = await fetch("https://api.github.com/user/repos?per_page=100&sort=updated", { headers: getHeaders() });
  const repos = await rRes.json();
  $("repoSelect").innerHTML = repos.map(r => `<option value="${r.name}">${r.name}</option>`).join("");
  $("repoCounterPill").textContent = `${repos.length} Repos`;
  if (repos.some(r => r.name === "Skill-Tree")) $("repoSelect").value = "Skill-Tree";
  setBadge(`Connected: ${ghUser}`, "ok");
  await loadRepoFiles();
}

async function loadRepoFiles() {
  const repo = $("repoSelect").value;
  if (!repo || !ghUser) return;
  const link = $("liveSiteLink");
  link.href = `https://${ghUser.toLowerCase()}.github.io/${repo}/`;
  link.textContent = `↗ Open Live ${repo}`;
  link.classList.remove("hidden");
  const res = await fetch(`https://api.github.com/repos/${ghUser}/${repo}/contents/`, { headers: getHeaders() });
  const items = await res.json();
  const files = Array.isArray(items) ? items.filter(x => x.type === "file") : [];
  $("fileSelect").innerHTML = files.map(f => `<option value="${f.path}">${f.path}</option>`).join("");
  if (files.length) await loadFileContent(files[0].path);
}

async function loadFileContent(path) {
  const repo = $("repoSelect").value;
  isNewFile = false;
  $("activePathLabel").textContent = `${repo}/${path}`;
  setBadge("Loading...", "busy");
  const res = await fetch(`https://api.github.com/repos/${ghUser}/${repo}/contents/${path}`, { headers: getHeaders() });
  const data = await res.json();
  currentSha = data.sha;
  if (data.content) {
    $("codeEditor").value = new TextDecoder().decode(Uint8Array.from(atob(data.content.replace(/\n/g, "")), c => c.charCodeAt(0)));
  } else {
    $("codeEditor").value = "[Binary or large file — edit text files only]";
  }
  setBadge("Ready", "ok");
}

function triggerUpdateActive(repo, path, badgeLabel, speechText) {
  setBadge(badgeLabel, "ok");
  setMjState("celebrate", speechText);
  scheduleIdleReturn(5000, `${repo}/${path} is live and ready.`);
}

async function deployFile() {
  const repo = $("repoSelect").value;
  const path = isNewFile ? $("newFileName").value.trim() : $("fileSelect").value;
  if (!repo || !path) return alert("Select or name a file first.");
  const seq = ++deploySeq;
  const commitStartMs = Date.now();
  const encoded = toBase64($("codeEditor").value);

  setBadge("Deploying...", "busy");
  await setMjState("hack", `Hacking & pushing ${path} to ${repo}...`);

  const body = { message: $("commitMsg").value.trim() || `Update ${path}`, content: encoded };
  if (!isNewFile && currentSha) body.sha = currentSha;

  const res = await fetch(`https://api.github.com/repos/${ghUser}/${repo}/contents/${path}`, {
    method: "PUT",
    headers: getHeaders(),
    body: JSON.stringify(body)
  });

  if (seq !== deploySeq) return;
  if (!res.ok) {
    const err = await res.json();
    setBadge("Deploy Failed");
    await setMjState("idle", "Deploy failed — check alert.");
    return alert("API Error: " + (err.message || res.status));
  }

  const out = await res.json();
  currentSha = out.content.sha;
  isNewFile = false;
  $("activePathLabel").textContent = `${repo}/${path}`;
  setBadge("Building Live...", "busy");
  await setMjState("hack", `Update committed — waiting for ${path} to go active...`);
  pollPagesStatus(repo, path, seq, commitStartMs);
}

async function pollPagesStatus(repo, path, seq, commitStartMs) {
  for (let i = 0; i < 24; i++) {
    await new Promise(r => setTimeout(r, 3500));
    if (seq !== deploySeq) return;
    try {
      const res = await fetch(`https://api.github.com/repos/${ghUser}/${repo}/pages/builds/latest`, { headers: getHeaders() });
      if (res.ok) {
        const b = await res.json();
        const updatedAtMs = b.updated_at ? Date.parse(b.updated_at) : 0;
        if (b.status === "built" && (!updatedAtMs || updatedAtMs >= commitStartMs - 5000)) {
          triggerUpdateActive(repo, path, "🟢 Update Active!", `${path} is live and active on ${repo}!`);
          return;
        }
        if (b.status === "errored") {
          setBadge("🔴 Build Error");
          await setMjState("idle", `Build errored on ${repo}.`);
          return;
        }
      } else if (res.status === 404) {
        // Repo does not have GitHub Pages enabled; commit itself is active on branch
        triggerUpdateActive(repo, path, "🟢 Update Active!", `${path} is active on ${repo}!`);
        return;
      }
    } catch {}
  }
  if (seq === deploySeq) {
    triggerUpdateActive(repo, path, "🟢 Update Active!", `${path} update is active!`);
  }
}

function boot() {
  syncSettingsUI();
  ["idle", "hack", "wave", "celebrate"].forEach(s => resolveAsset(s));
  runGreetingSequence();

  $("settingsBtn").onclick = e => {
    e.stopPropagation();
    $("settingsPopover").classList.toggle("hidden");
  };
  document.addEventListener("click", e => {
    if (!e.target.closest("#settingsPopover") && !e.target.closest("#settingsBtn")) {
      $("settingsPopover").classList.add("hidden");
    }
  });
  $("motionToggleBtn").onclick = () => {
    motionEnabled = !motionEnabled;
    localStorage.setItem(MOTION_KEY, motionEnabled ? "1" : "0");
    syncSettingsUI();
  };
  $("nsfwToggleBtn").onclick = () => {
    nsfwEnabled = !nsfwEnabled;
    localStorage.setItem(NSFW_KEY, nsfwEnabled ? "1" : "0");
    syncSettingsUI();
    $("settingsPopover").classList.add("hidden");
    if (nsfwEnabled) setMjState("tease", "Extra studio poses unlocked, tiger...");
  };

  $("cmdIdleBtn").onclick = () => setMjState("idle", "Chilling in the loft — ready when you are.");
  $("cmdHackBtn").onclick = () => setMjState("hack", "Terminal engaged! Hacking build...");
  $("cmdWaveBtn").onclick = () => setMjState("wave", "Hey tiger! Systems are green.");
  $("cmdCelebrateBtn").onclick = () => setMjState("celebrate", "Woohoo! Build is live!");
  $("cmdSwayBtn").onclick = () => setMjState("sway", "Feeling the vibe in the loft...");
  $("cmdKissBtn").onclick = () => setMjState("kiss", "Muah! Good luck on this deploy.");
  $("cmdKneelBtn").onclick = () => setMjState("pose", "Striking a pose for you...");
  $("cmdTeaseBtn").onclick = () => setMjState("tease", "Like what you see? Let's ship some code.");

  $("codeEditor").addEventListener("input", () => {
    if (currentMode !== "hack") setMjState("hack", "Typing edits into terminal...");
    scheduleIdleReturn(2000, "Ready — hit Deploy Now!");
  });

  $("saveTokenBtn").onclick = () => {
    const val = $("ghToken").value.trim();
    if (!val) return;
    localStorage.setItem(TOKEN_KEY, val);
    initConnection();
  };
  $("toggleTokenBtn").onclick = () => $("tokenWrap").classList.toggle("hidden");
  $("repoSelect").onchange = loadRepoFiles;
  $("fileSelect").onchange = () => loadFileContent($("fileSelect").value);
  $("createFileModeBtn").onclick = () => {
    const fn = $("newFileName").value.trim();
    if (!fn) return alert("Type filename first");
    isNewFile = true;
    currentSha = null;
    $("activePathLabel").textContent = `${$("repoSelect").value}/${fn} (NEW)`;
    $("codeEditor").value = "";
  };
  $("pasteReplaceBtn").onclick = async () => {
    const editor = $("codeEditor");
    editor.focus();
    try {
      const clip = await navigator.clipboard.readText();
      if (clip) { editor.value = clip; setMjState("hack", "Clipboard loaded — ready to deploy!"); return; }
    } catch {}
    const manual = prompt("Paste your code here:");
    if (manual !== null) { editor.value = manual; setMjState("hack", "Code loaded!"); }
  };
  $("copyCurrentBtn").onclick = async () => {
    await navigator.clipboard.writeText($("codeEditor").value);
    setBadge("Copied!", "ok");
  };
  $("deployBtn").onclick = deployFile;

  if (localStorage.getItem(TOKEN_KEY)) initConnection();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", boot);
} else {
  boot();
}
