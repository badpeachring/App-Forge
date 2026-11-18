import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { VRMLoaderPlugin, VRMUtils } from "@pixiv/three-vrm";

if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {});
const TOKEN_KEY = "app_forge_gh_token_v1";
let ghUser = "", currentSha = null, isNewFile = false, typingTimer = null, mjMode = "idle", currentVrm = null;
const $ = id => document.getElementById(id);
const getHeaders = () => ({ "Authorization": `Bearer ${localStorage.getItem(TOKEN_KEY) || ""}`, "Accept": "application/vnd.github+json", "Content-Type": "application/json" });

const box = $("stage3d");
const w = box.clientWidth || 400, h = box.clientHeight || 256;
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x140b20);
scene.fog = new THREE.FogExp2(0x140b20, 0.055);

const cam = new THREE.PerspectiveCamera(34, w / h, 0.1, 50);
cam.position.set(0.18, 1.30, 2.30);
cam.lookAt(-0.10, 1.02, 0);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(w, h);
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.15;
box.appendChild(renderer.domElement);

scene.add(new THREE.AmbientLight(0xffedd5, 0.8));
const keyLight = new THREE.DirectionalLight(0xfff1f2, 1.35);
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
  VRMUtils.rotateVRM0(vrm);
  currentVrm = vrm;
  vrm.scene.position.set(0.08, -0.38, 0.15);
  vrm.scene.matrixAutoUpdate = false;
  vrm.scene.updateMatrix();
  scene.add(vrm.scene);
  setMjState("idle", "mj.vrm loaded & locked in place!");
}, undefined, err => setMjState("idle", "Place mj.vrm in repo root."));

const lerp = THREE.MathUtils.lerp;
const clock = new THREE.Clock();
function animate() {
  requestAnimationFrame(animate);
  const dt = clock.getDelta();
  const t = clock.elapsedTime;
  if (currentVrm) {
    const h = currentVrm.humanoid, exp = currentVrm.expressionManager;
    if (exp) {
      const blinkCycle = t % 3.6;
      exp.setValue("blink", blinkCycle > 3.45 ? Math.sin(((blinkCycle - 3.45) / 0.15) * Math.PI) : 0);
      exp.setValue("happy", mjMode === "celebrate" ? 0.95 : mjMode === "wave" ? 0.65 : 0.3);
    }
    const lUpLeg = h.getNormalizedBoneNode("leftUpperLeg"), rUpLeg = h.getNormalizedBoneNode("rightUpperLeg");
    const lLoLeg = h.getNormalizedBoneNode("leftLowerLeg"), rLoLeg = h.getNormalizedBoneNode("rightLowerLeg");
    if (lUpLeg && rUpLeg) { lUpLeg.rotation.x = 1.35; rUpLeg.rotation.x = 1.35; }
    if (lLoLeg && rLoLeg) { lLoLeg.rotation.x = -1.35; rLoLeg.rotation.x = -1.35; }

    const spine = h.getNormalizedBoneNode("spine"), head = h.getNormalizedBoneNode("head");
    const lArm = h.getNormalizedBoneNode("leftUpperArm"), rArm = h.getNormalizedBoneNode("rightUpperArm");
    const lFore = h.getNormalizedBoneNode("leftLowerArm"), rFore = h.getNormalizedBoneNode("rightLowerArm");

    if (mjMode === "hack") {
      currentVrm.scene.rotation.y = lerp(currentVrm.scene.rotation.y, -0.78, 0.12);
      if (spine) spine.rotation.x = 0.14 + Math.sin(t * 14) * 0.015;
      if (head) head.rotation.y = -0.15;
      if (lArm && rArm) { lArm.rotation.set(0.62, 0, 0.42); rArm.rotation.set(0.62, 0, -0.42); }
      if (lFore && rFore) { lFore.rotation.set(0.85 + Math.sin(t * 28) * 0.14, 0, 0.25); rFore.rotation.set(0.85 + Math.cos(t * 28) * 0.14, 0, -0.25); }
      screen.material.color.setHex(Math.sin(t * 18) > 0 ? 0x38bdf8 : 0x34d399);
    } else if (mjMode === "celebrate") {
      currentVrm.scene.rotation.y = lerp(currentVrm.scene.rotation.y, 0.18, 0.12);
      if (spine) spine.rotation.z = Math.sin(t * 8) * 0.06;
      if (lArm && rArm) { lArm.rotation.set(0.25, 0, -0.95 + Math.sin(t * 10) * 0.18); rArm.rotation.set(0.25, 0, 0.95 - Math.sin(t * 10) * 0.18); }
      screen.material.color.setHex(0x10b981);
    } else if (mjMode === "wave") {
      currentVrm.scene.rotation.y = lerp(currentVrm.scene.rotation.y, 0.22, 0.12);
      if (lArm && rArm) { lArm.rotation.set(0.18, 0, 1.15); rArm.rotation.set(0.22, 0, 0.85 + Math.sin(t * 9) * 0.25); }
      screen.material.color.setHex(0x0ea5e9);
    } else {
      currentVrm.scene.rotation.y = lerp(currentVrm.scene.rotation.y, 0.22, 0.08);
      if (spine) { spine.rotation.x = Math.sin(t * 2) * 0.025; spine.rotation.z = 0; }
      if (head) head.rotation.y = Math.sin(t * 1.1) * 0.07;
      if (lArm && rArm) { lArm.rotation.set(0.22, 0, 1.12); rArm.rotation.set(0.22, 0, -1.12); }
      if (lFore && rFore) { lFore.rotation.set(0.38, 0, 0.18); rFore.rotation.set(0.38, 0, -0.18); }
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

$("cmdIdleBtn").onclick = () => setMjState("idle", "Locked in place and ready.");
$("cmdHackBtn").onclick = () => setMjState("hack", "Terminal engaged!");
$("cmdWaveBtn").onclick = () => setMjState("wave", "Hey there!");
$("cmdCelebrateBtn").onclick = () => setMjState("celebrate", "Build live!");

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
