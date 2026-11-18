import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { VRMLoaderPlugin, VRMUtils } from "@pixiv/three-vrm";

if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {});
const TOKEN_KEY = "app_forge_gh_token_v1";
let ghUser = "", currentSha = null, isNewFile = false, typingTimer = null, mjMode = "idle", currentVrm = null;
let baseFacing = 0, nsfwEnabled = false;
const $ = id => document.getElementById(id);
const getHeaders = () => ({ "Authorization": `Bearer ${localStorage.getItem(TOKEN_KEY) || ""}`, "Accept": "application/vnd.github+json", "Content-Type": "application/json" });

const box = $("stage3d");
const w = box.clientWidth || 400, h = box.clientHeight || 256;
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x140b20);
scene.fog = new THREE.FogExp2(0x140b20, 0.055);

const cam = new THREE.PerspectiveCamera(34, w / h, 0.1, 50);
cam.position.set(0.15, 1.28, 2.25);
cam.lookAt(-0.08, 1.00, 0);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(w, h);
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.18;
box.appendChild(renderer.domElement);

scene.add(new THREE.AmbientLight(0xffedd5, 0.85));
const keyLight = new THREE.DirectionalLight(0xfff1f2, 1.4);
keyLight.position.set(1.5, 2.5, 2.2);
scene.add(keyLight);
const crtLight = new THREE.PointLight(0x38bdf8, 1.8, 4);
crtLight.position.set(-0.72, 1.12, 0.48);
scene.add(crtLight);

const desk = new THREE.Mesh(new THREE.BoxGeometry(1.55, 0.06, 0.85), new THREE.MeshStandardMaterial({ color: 0x4a2918, roughness: 0.55 }));
desk.position.set(-0.78, 0.72, 0.25); scene.add(desk);
const monitor = new THREE.Mesh(new THREE.BoxGeometry(0.50, 0.40, 0.22), new THREE.MeshStandardMaterial({ color: 0xe2e8f0, roughness: 0.3 }));
monitor.position.set(-0.88, 0.96, 0.18); monitor.rotation.y = 0.45; scene.add(monitor);
const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.42, 0.32), new THREE.MeshBasicMaterial({ color: 0x0ea5e9 }));
screen.position.set(-0.81, 0.96, 0.28); screen.rotation.y = 0.45; scene.add(screen);

const loader = new GLTFLoader();
loader.register(parser => new VRMLoaderPlugin(parser));

loader.load("mj.vrm", gltf => {
  const vrm = gltf.userData.vrm;
  if (!vrm) return;
  VRMUtils.removeUnnecessaryVertices(gltf.scene);
  VRMUtils.removeUnnecessaryJoints(gltf.scene);
  currentVrm = vrm;
  vrm.scene.position.set(0.10, -0.38, 0.18);
  vrm.scene.rotation.y = 0; // Faces camera directly
  vrm.scene.matrixAutoUpdate = false;
  vrm.scene.updateMatrix();
  scene.add(vrm.scene);
  setMjState("idle", "Facing forward and ready, tiger!");
}, undefined, () => setMjState("idle", "Place mj.vrm in repo root."));

const lerp = THREE.MathUtils.lerp;
function smoothBone(bone, rx, ry, rz, speed = 0.12) {
  if (!bone) return;
  bone.rotation.x = lerp(bone.rotation.x, rx, speed);
  bone.rotation.y = lerp(bone.rotation.y, ry, speed);
  bone.rotation.z = lerp(bone.rotation.z, rz, speed);
}

const clock = new THREE.Clock();
function animate() {
  requestAnimationFrame(animate);
  const dt = clock.getDelta();
  const t = clock.elapsedTime;
  if (currentVrm) {
    const h = currentVrm.humanoid, exp = currentVrm.expressionManager;
    const hips = h.getNormalizedBoneNode("hips");
    const spine = h.getNormalizedBoneNode("spine");
    const chest = h.getNormalizedBoneNode("chest");
    const neck = h.getNormalizedBoneNode("neck");
    const head = h.getNormalizedBoneNode("head");
    const lSh = h.getNormalizedBoneNode("leftShoulder"), rSh = h.getNormalizedBoneNode("rightShoulder");
    const lArm = h.getNormalizedBoneNode("leftUpperArm"), rArm = h.getNormalizedBoneNode("rightUpperArm");
    const lFore = h.getNormalizedBoneNode("leftLowerArm"), rFore = h.getNormalizedBoneNode("rightLowerArm");
    const lUpLeg = h.getNormalizedBoneNode("leftUpperLeg"), rUpLeg = h.getNormalizedBoneNode("rightUpperLeg");
    const lLoLeg = h.getNormalizedBoneNode("leftLowerLeg"), rLoLeg = h.getNormalizedBoneNode("rightLowerLeg");

    if (exp) {
      const blinkCycle = t % 3.4;
      exp.setValue("blink", blinkCycle > 3.25 ? Math.sin(((blinkCycle - 3.25) / 0.15) * Math.PI) : 0);
      exp.setValue("happy", (mjMode === "celebrate" || mjMode === "kiss") ? 0.9 : (mjMode === "tease" || mjMode === "sway") ? 0.65 : 0.35);
      exp.setValue("ou", mjMode === "kiss" ? 0.75 : 0);
    }

    smoothBone(lUpLeg, 1.32, 0.08, -0.06, 0.1);
    smoothBone(rUpLeg, 1.38, -0.14, 0.08, 0.1);
    smoothBone(lLoLeg, -1.32, 0, 0, 0.1);
    smoothBone(rLoLeg, -1.42, 0, 0, 0.1);

    const breath = Math.sin(t * 2.4);
    smoothBone(lSh, 0, 0, 0.04 + breath * 0.015, 0.1);
    smoothBone(rSh, 0, 0, -0.04 - breath * 0.015, 0.1);

    const targetRotY = baseFacing + (mjMode === "hack" ? -0.75 : mjMode === "sway" ? Math.sin(t * 3.2) * 0.22 : 0);
    currentVrm.scene.rotation.y = lerp(currentVrm.scene.rotation.y, targetRotY, 0.1);

    if (mjMode === "hack") {
      smoothBone(hips, 0.06, 0, 0, 0.12);
      smoothBone(spine, 0.10 + breath * 0.01, -0.08, 0, 0.12);
      smoothBone(chest, 0.08, -0.06, 0, 0.12);
      smoothBone(neck, 0.06, -0.08, 0, 0.12);
      smoothBone(head, 0.05, -0.10, 0, 0.12);
      smoothBone(lArm, 0.58, 0.12, 0.38, 0.14);
      smoothBone(rArm, 0.58, -0.12, -0.38, 0.14);
      smoothBone(lFore, 0.88 + Math.sin(t * 28) * 0.12, 0, 0.22, 0.25);
      smoothBone(rFore, 0.88 + Math.cos(t * 28) * 0.12, 0, -0.22, 0.25);
      screen.material.color.setHex(Math.sin(t * 18) > 0 ? 0x38bdf8 : 0x34d399);
    } else if (mjMode === "celebrate") {
      smoothBone(spine, -0.04, 0, Math.sin(t * 7) * 0.06, 0.12);
      smoothBone(head, -0.05, Math.sin(t * 5) * 0.1, 0, 0.12);
      smoothBone(lArm, 0.25, 0, -0.85 + Math.sin(t * 9) * 0.15, 0.14);
      smoothBone(rArm, 0.25, 0, 0.85 - Math.sin(t * 9) * 0.15, 0.14);
      smoothBone(lFore, 0.45, 0, -0.35, 0.14);
      smoothBone(rFore, 0.45, 0, 0.35, 0.14);
      screen.material.color.setHex(0x10b981);
    } else if (mjMode === "wave") {
      smoothBone(spine, 0, 0.04, -0.04, 0.1);
      smoothBone(head, -0.03, 0.12, -0.08, 0.1);
      smoothBone(lArm, 0.24, 0, 1.12, 0.12);
      smoothBone(lFore, 0.42, 0, 0.18, 0.12);
      smoothBone(rArm, 0.20, 0.15, 0.72 + Math.sin(t * 8) * 0.18, 0.14);
      smoothBone(rFore, 0.55, 0, 0.45 + Math.cos(t * 8) * 0.22, 0.16);
      screen.material.color.setHex(0x0ea5e9);
    } else if (mjMode === "sway") {
      const s = Math.sin(t * 3.2);
      smoothBone(hips, 0, s * 0.12, s * 0.06, 0.1);
      smoothBone(spine, 0.04, -s * 0.10, -s * 0.07, 0.1);
      smoothBone(head, -0.04, s * 0.14, s * 0.08, 0.1);
      smoothBone(lArm, 0.32, 0.2, 0.92 + s * 0.12, 0.1);
      smoothBone(rArm, 0.32, -0.2, -0.92 + s * 0.12, 0.1);
      smoothBone(lFore, 0.65, 0, 0.35, 0.1);
      smoothBone(rFore, 0.65, 0, -0.35, 0.1);
    } else if (mjMode === "kiss") {
      smoothBone(spine, 0.08, 0, -0.04, 0.12);
      smoothBone(head, -0.04, 0.08, -0.10, 0.12);
      smoothBone(lArm, 0.24, 0, 1.12, 0.12);
      smoothBone(rArm, 0.85, 0.35, -0.45, 0.14);
      smoothBone(rFore, 1.35 + Math.sin(t * 4) * 0.08, 0, -0.35, 0.14);
    } else if (mjMode === "kneel") {
      smoothBone(hips, 0.14, 0.08, 0, 0.1);
      smoothBone(spine, -0.12, 0, 0.04, 0.1);
      smoothBone(head, 0.08, 0.10, 0.09, 0.1);
      smoothBone(lArm, 0.18, -0.25, 0.85, 0.1);
      smoothBone(rArm, 0.18, 0.25, -0.85, 0.1);
      smoothBone(lFore, 0.95, 0, 0.45, 0.1);
      smoothBone(rFore, 0.95, 0, -0.45, 0.1);
    } else if (mjMode === "tease") {
      const wv = Math.sin(t * 2.8);
      smoothBone(spine, 0.10, -0.12, 0.05, 0.1);
      smoothBone(head, -0.06, 0.18, -0.12, 0.1);
      smoothBone(lArm, 0.42, 0.3, 0.78, 0.12);
      smoothBone(rArm, -0.15, -0.35, -0.75, 0.12);
      smoothBone(rFore, 0.95 + wv * 0.08, 0, -0.45, 0.12);
    } else {
      smoothBone(hips, 0, Math.sin(t * 0.9) * 0.03, 0, 0.08);
      smoothBone(spine, 0.03 + breath * 0.02, Math.sin(t * 1.1) * 0.03, 0, 0.08);
      smoothBone(head, -0.02 + breath * 0.015, 0.08 + Math.sin(t * 0.85) * 0.07, 0, 0.08);
      smoothBone(lArm, 0.24 + breath * 0.02, 0.08, 1.08, 0.1);
      smoothBone(rArm, 0.24 + breath * 0.02, -0.08, -1.08, 0.1);
      smoothBone(lFore, 0.44, 0, 0.22, 0.1);
      smoothBone(rFore, 0.44, 0, -0.22, 0.1);
      screen.material.color.setHex(0x0284c7);
    }

    currentVrm.scene.updateMatrix();
    currentVrm.update(dt);
  }
  renderer.render(scene, cam);
}
animate();

function setMjState(mode, text) { mjMode = mode; if (text) $("mjSpeech").firstElementChild.textContent = `💬 "${text}"`; }
function setBadge(text, tone = "idle") {
  const b = $("buildBadge"); b.textContent = text;
  b.className = tone === "ok" ? "px-3 py-1 rounded-full text-[11px] font-bold bg-emerald-500/25 border border-emerald-400 text-emerald-200" : tone === "busy" ? "px-3 py-1 rounded-full text-[11px] font-bold bg-amber-500/25 border border-amber-400 text-amber-200" : "px-3 py-1 rounded-full text-[11px] font-bold bg-black/65 border border-amber-400/35 text-amber-200";
}

document.addEventListener("DOMContentLoaded", () => {
  $("settingsBtn").onclick = (e) => { e.stopPropagation(); $("settingsPopover").classList.toggle("hidden"); };
  document.onclick = (e) => { if (!e.target.closest("#settingsPopover") && !e.target.closest("#settingsBtn")) $("settingsPopover").classList.add("hidden"); };
  $("flipFacingBtn").onclick = () => { baseFacing = baseFacing === 0 ? Math.PI : 0; $("settingsPopover").classList.add("hidden"); };
  $("nsfwToggleBtn").onclick = () => {
    nsfwEnabled = !nsfwEnabled;
    const btn = $("nsfwToggleBtn");
    btn.textContent = nsfwEnabled ? "ON" : "OFF";
    btn.className = nsfwEnabled ? "px-2.5 py-1 rounded-full text-[10px] font-black bg-rose-500 text-white" : "px-2.5 py-1 rounded-full text-[10px] font-black bg-slate-800 border border-rose-500/40 text-rose-300";
    $("nsfwBar").classList.toggle("hidden", !nsfwEnabled);
    $("settingsPopover").classList.add("hidden");
    if (nsfwEnabled) setMjState("tease", "Extra studio poses unlocked, tiger...");
  };

  $("cmdIdleBtn").onclick = () => setMjState("idle", "Chilling in the loft — ready when you are.");
  $("cmdHackBtn").onclick = () => setMjState("hack", "Terminal engaged! Typing your build...");
  $("cmdWaveBtn").onclick = () => setMjState("wave", "Hey there! Systems green.");
  $("cmdCelebrateBtn").onclick = () => setMjState("celebrate", "Woohoo! Build live on Pages!");
  $("cmdSwayBtn").onclick = () => setMjState("sway", "Feeling the vibe in the loft...");
  $("cmdKissBtn").onclick = () => setMjState("kiss", "Muah! Good luck on this deploy, tiger.");
  $("cmdKneelBtn").onclick = () => setMjState("kneel", "Striking a pose for you...");
  $("cmdTeaseBtn").onclick = () => setMjState("tease", "Like what you see? Let's ship some code.");

  $("saveTokenBtn").onclick = () => { const val = $("ghToken").value.trim(); if (!val) return; localStorage.setItem(TOKEN_KEY, val); initConnection(); };
  $("toggleTokenBtn").onclick = () => $("tokenWrap").classList.toggle("hidden");
  $("repoSelect").onchange = loadRepoFiles;
  $("fileSelect").onchange = () => loadFileContent($("fileSelect").value);
  $("createFileModeBtn").onclick = () => { const fn = $("newFileName").value.trim(); if (!fn) return alert("Type filename first"); isNewFile = true; currentSha = null; $("activePathLabel").textContent = `${$("repoSelect").value}/${fn} (NEW)`; $("codeEditor").value = ""; };
  $("pasteReplaceBtn").onclick = async () => {
    const editor = $("codeEditor"); editor.focus();
    try { const clip = await navigator.clipboard.readText(); if (clip) { editor.value = clip; setMjState("hack", "Clipboard pasted!"); return; } } catch {}
    const manual = prompt("Paste your code here:");
    if (manual !== null) { editor.value = manual; setMjState("hack", "Code loaded!"); }
  };
  $("copyCurrentBtn").onclick = async () => { await navigator.clipboard.writeText($("codeEditor").value); setBadge("Copied!", "ok"); };
  $("deployBtn").onclick = deployFile;
  if (localStorage.getItem(TOKEN_KEY)) initConnection();
});

async function initConnection() {
  const tok = localStorage.getItem(TOKEN_KEY); if (!tok) return;
  $("ghToken").value = tok; $("tokenWrap").classList.add("hidden"); setBadge("Connecting...", "busy");
  const uRes = await fetch("https://api.github.com/user", { headers: getHeaders() });
  if (!uRes.ok) { setBadge("Token Error"); $("tokenWrap").classList.remove("hidden"); return; }
  const u = await uRes.json(); ghUser = u.login;
  const rRes = await fetch("https://api.github.com/user/repos?per_page=100&sort=updated", { headers: getHeaders() });
  const repos = await rRes.json();
  $("repoSelect").innerHTML = repos.map(r => `<option value="${r.name}">${r.name}</option>`).join("");
  $("repoCounterPill").textContent = `${repos.length} Repos`;
  if (repos.some(r => r.name === "Skill-Tree")) $("repoSelect").value = "Skill-Tree";
  setBadge(`Connected: ${ghUser}`, "ok"); await loadRepoFiles();
}
async function loadRepoFiles() {
  const repo = $("repoSelect").value; if (!repo || !ghUser) return;
  const link = $("liveSiteLink"); link.href = `https://${ghUser.toLowerCase()}.github.io/${repo}/`; link.textContent = `↗ Open Live ${repo}`; link.classList.remove("hidden");
  const res = await fetch(`https://api.github.com/repos/${ghUser}/${repo}/contents/`, { headers: getHeaders() });
  const items = await res.json();
  const files = Array.isArray(items) ? items.filter(x => x.type === "file") : [];
  $("fileSelect").innerHTML = files.map(f => `<option value="${f.path}">${f.path}</option>`).join("");
  if (files.length) await loadFileContent(files[0].path);
}
async function loadFileContent(path) {
  const repo = $("repoSelect").value; isNewFile = false; $("activePathLabel").textContent = `${repo}/${path}`; setBadge("Loading...", "busy");
  const res = await fetch(`https://api.github.com/repos/${ghUser}/${repo}/contents/${path}`, { headers: getHeaders() });
  const data = await res.json(); currentSha = data.sha;
  $("codeEditor").value = new TextDecoder().decode(Uint8Array.from(atob(data.content.replace(/\n/g, "")), c => c.charCodeAt(0)));
  setBadge("Ready", "ok");
}
async function deployFile() {
  const repo = $("repoSelect").value, path = isNewFile ? $("newFileName").value.trim() : $("fileSelect").value;
  if (!repo || !path) return alert("Select or name a file first.");
  const encoded = btoa(String.fromCharCode(...new TextEncoder().encode($("codeEditor").value)));
  setBadge("Deploying...", "busy");
  setMjState("hack", `Deploying ${path}...`);
  const body = { message: $("commitMsg").value.trim() || `Update ${path}`, content: encoded };
  if (!isNewFile && currentSha) body.sha = currentSha;
  const res = await fetch(`https://api.github.com/repos/${ghUser}/${repo}/contents/${path}`, { method: "PUT", headers: getHeaders(), body: JSON.stringify(body) });
  if (!res.ok) { const err = await res.json(); setBadge("Deploy Failed"); setMjState("idle", "Deploy failed."); return alert("API Error: " + (err.message || res.status)); }
  const out = await res.json(); currentSha = out.content.sha; isNewFile = false; $("activePathLabel").textContent = `${repo}/${path}`;
  setBadge("Building Pages...", "busy");
  pollPagesStatus(repo);
}
async function pollPagesStatus(repo) {
  for (let i = 0; i < 18; i++) {
    await new Promise(r => setTimeout(r, 4000));
    try {
      const res = await fetch(`https://api.github.com/repos/${ghUser}/${repo}/pages/builds/latest`, { headers: getHeaders() });
      if (res.ok) {
        const b = await res.json();
        if (b.status === "built") { setBadge("🟢 Live on Pages!", "ok"); setMjState("celebrate", `${repo} is live!`); setTimeout(() => setMjState("idle", "Ready!"), 4500); return; }
        if (b.status === "errored") { setBadge("🔴 Build Error"); setMjState("idle", "Build error."); return; }
      }
    } catch {}
  }
  setBadge("🟢 Pushed to Main", "ok");
  setMjState("celebrate", "Pushed to main!");
}

$("codeEditor").addEventListener("input", () => {
  setMjState("hack", "Typing edits into terminal...");
  clearTimeout(typingTimer);
  typingTimer = setTimeout(() => setMjState("idle", "Ready — hit Deploy Now!"), 1800);
});
