/**
 * app-forge-patch-engine.js
 * Remote file patcher & Skill-Tree constellation/node deletion engine via GitHub API.
 */

const AF_TOKEN_KEY = "app_forge_gh_token_v1";

function toUtf8Base64(text) {
  const bytes = new TextEncoder().encode(text);
  let binary = "";
  for (let i = 0; i < bytes.length; i += 8192) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
  }
  return btoa(binary);
}

function fromUtf8Base64(b64) {
  const clean = (b64 || "").replace(/\n/g, "");
  const raw = atob(clean);
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

function getAuthHeaders(token) {
  return {
    "Authorization": `Bearer ${token}`,
    "Accept": "application/vnd.github+json",
    "Content-Type": "application/json"
  };
}

async function getRepoFile(owner, repo, path, token) {
  const url = `https://api.github.com/repos/${owner}/${repo}/contents/${encodeURIComponent(path).replace(/%2F/g, "/")}`;
  const res = await fetch(url, { headers: getAuthHeaders(token), cache: "no-store" });
  if (res.status === 404) return { exists: false, sha: null, content: "" };
  if (!res.ok) throw new Error(`Read failed (${res.status}) for ${repo}/${path}`);
  const data = await res.json();
  return {
    exists: true,
    sha: data.sha || null,
    content: data.content ? fromUtf8Base64(data.content) : ""
  };
}

async function putRepoFile(owner, repo, path, newContent, message, token) {
  const existing = await getRepoFile(owner, repo, path, token);
  const url = `https://api.github.com/repos/${owner}/${repo}/contents/${encodeURIComponent(path).replace(/%2F/g, "/")}`;
  const body = {
    message: message || `App Forge patch ${path}`,
    content: toUtf8Base64(newContent)
  };
  if (existing.exists && existing.sha) body.sha = existing.sha;

  const res = await fetch(url, {
    method: "PUT",
    headers: getAuthHeaders(token),
    body: JSON.stringify(body)
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || `Write failed (${res.status}) for ${repo}/${path}`);
  }
  return res.json();
}

function applyPatchOperations(source, ops = []) {
  let out = String(source ?? "");
  for (const op of ops) {
    if (!op || typeof op !== "object") continue;
    if (op.type === "replace") {
      if (op.search instanceof RegExp) {
        out = out.replace(op.search, op.replacement ?? "");
      } else if (typeof op.search === "string" && out.includes(op.search)) {
        out = out.split(op.search).join(op.replacement ?? "");
      }
    } else if (op.type === "append_before_body") {
      const snippet = String(op.snippet ?? "");
      if (snippet && !out.includes(snippet)) {
        if (/<\/body>/i.test(out)) {
          out = out.replace(/<\/body>/i, `${snippet}\n</body>`);
        } else {
          out += `\n${snippet}`;
        }
      }
    } else if (op.type === "overwrite") {
      out = String(op.content ?? "");
    }
  }
  return out;
}

/**
 * Generates clean, self-contained Skill-Tree deletion runtime code
 * that deletes constellations, single nodes, or bulk-checked items without lockouts.
 */
function buildSkillTreeDeleteRuntimeCode() {
  return `/* Auto-patched by App Forge Patch Engine */
(() => {
  if (window.__appForgeSkillTreeDeleterReady) return;
  window.__appForgeSkillTreeDeleterReady = true;

  const KEYS = ["skill_tree_state_v1", "skillTreeState", "skill_tree_data", "constellations_data"];
  const clone = v => (typeof structuredClone === "function" ? structuredClone(v) : JSON.parse(JSON.stringify(v)));
  const getId = x => (x && typeof x === "object" ? String(x.id ?? x.constellationId ?? x.nodeId ?? x.key ?? x.slug ?? "") : "");

  function findStore() {
    for (const k of KEYS) {
      const raw = localStorage.getItem(k);
      if (!raw) continue;
      try {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === "object") return { key: k, state: parsed };
      } catch {}
    }
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k) continue;
      try {
        const parsed = JSON.parse(localStorage.getItem(k));
        if (parsed && typeof parsed === "object" && (Array.isArray(parsed.constellations) || Array.isArray(parsed.nodes))) {
          return { key: k, state: parsed };
        }
      } catch {}
    }
    return { key: KEYS[0], state: { constellations: [], nodes: [], edges: [], activeConstellationId: null } };
  }

  function saveStore(key, nextState) {
    localStorage.setItem(key, JSON.stringify(nextState));
    KEYS.forEach(k => { if (localStorage.getItem(k) !== null) localStorage.setItem(k, JSON.stringify(nextState)); });
    window.appState = nextState;
    window.skillTreeState = nextState;
    if (typeof window.renderApp === "function") window.renderApp(nextState);
    if (typeof window.renderConstellations === "function") window.renderConstellations(nextState);
    if (typeof window.renderTree === "function") window.renderTree(nextState);
    window.dispatchEvent(new CustomEvent("skilltree:updated", { detail: { state: nextState } }));
  }

  function getConstellations(state) {
    if (Array.isArray(state.constellations)) return state.constellations;
    if (state.constellations && typeof state.constellations === "object") {
      return Object.entries(state.constellations).map(([id, v]) => ({ id, ...v }));
    }
    return [];
  }

  function deleteConstellationIds(ids) {
    const targets = new Set((Array.isArray(ids) ? ids : [ids]).map(String));
    const { key, state } = findStore();
    const next = clone(state);
    const removedNodes = new Set();

    if (Array.isArray(next.constellations)) {
      next.constellations = next.constellations.filter(c => {
        const cid = getId(c);
        if (targets.has(cid)) {
          if (Array.isArray(c.nodes)) c.nodes.forEach(n => removedNodes.add(getId(n)));
          return false;
        }
        return true;
      });
    } else if (next.constellations && typeof next.constellations === "object") {
      for (const [k, v] of Object.entries(next.constellations)) {
        if (targets.has(String(k)) || targets.has(getId(v))) {
          if (Array.isArray(v?.nodes)) v.nodes.forEach(n => removedNodes.add(getId(n)));
          delete next.constellations[k];
        }
      }
    }

    if (Array.isArray(next.nodes)) {
      next.nodes = next.nodes.filter(n => {
        const nid = getId(n);
        const cid = String(n.constellationId ?? n.constellation ?? n.group ?? "");
        if (targets.has(cid)) {
          if (nid) removedNodes.add(nid);
          return false;
        }
        return true;
      });
    }

    for (const ek of ["edges", "links", "connections"]) {
      if (Array.isArray(next[ek])) {
        next[ek] = next[ek].filter(e => {
          const cid = String(e.constellationId ?? e.constellation ?? "");
          const s = String(e.source ?? e.from ?? e.sourceId ?? "");
          const t = String(e.target ?? e.to ?? e.targetId ?? "");
          return !targets.has(cid) && !removedNodes.has(s) && !removedNodes.has(t);
        });
      }
    }

    const rem = getConstellations(next);
    const fallback = rem.length ? getId(rem[0]) : null;
    for (const ak of ["activeConstellationId", "selectedConstellationId", "currentConstellationId"]) {
      if (ak in next && (!next[ak] || targets.has(String(next[ak])))) next[ak] = fallback;
    }

    saveStore(key, next);
  }

  function deleteNodeIds(ids) {
    const targets = new Set((Array.isArray(ids) ? ids : [ids]).map(String));
    const { key, state } = findStore();
    const next = clone(state);
    if (Array.isArray(next.nodes)) next.nodes = next.nodes.filter(n => !targets.has(getId(n)));
    if (Array.isArray(next.constellations)) {
      next.constellations.forEach(c => {
        if (Array.isArray(c.nodes)) c.nodes = c.nodes.filter(n => !targets.has(getId(n)));
      });
    }
    for (const ek of ["edges", "links", "connections"]) {
      if (Array.isArray(next[ek])) {
        next[ek] = next[ek].filter(e => !targets.has(String(e.source ?? e.from ?? e.sourceId ?? "")) && !targets.has(String(e.target ?? e.to ?? e.targetId ?? "")));
      }
    }
    saveStore(key, next);
  }

  function mountUI() {
    if (document.getElementById("afStChip")) return;
    const chip = document.createElement("button");
    chip.id = "afStChip";
    chip.type = "button";
    chip.textContent = "🗑️ Delete Menu";
    chip.style.cssText = "position:fixed;bottom:16px;right:16px;z-index:9998;padding:10px 14px;border-radius:999px;background:#1a0f2e;color:#fda4af;border:1px solid rgba(244,63,94,0.55);font:700 12px/1 system-ui,sans-serif;box-shadow:0 8px 24px rgba(0,0,0,0.45);cursor:pointer;";

    const modal = document.createElement("div");
    modal.id = "afStModal";
    modal.style.cssText = "display:none;position:fixed;inset:0;z-index:9999;background:rgba(8,4,15,0.82);backdrop-filter:blur(6px);align-items:center;justify-content:center;padding:16px;font-family:system-ui,sans-serif;";
    modal.innerHTML = \`
      <div style="width:100%;max-width:440px;max-height:82vh;overflow:auto;background:#160d26;color:#fef3c7;border:1px solid rgba(244,63,94,0.35);border-radius:20px;padding:16px;">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
          <strong style="font-size:14px;color:#fda4af;">Delete Constellations & Nodes</strong>
          <button id="afStClose" type="button" style="background:#291947;color:#fef3c7;border:none;border-radius:8px;padding:6px 10px;font-size:12px;cursor:pointer;">Close</button>
        </div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px;">
          <button id="afStDelChecked" type="button" style="background:#e11d48;color:#fff;border:none;border-radius:10px;padding:8px 12px;font-size:12px;font-weight:700;cursor:pointer;">Delete Checked</button>
          <button id="afStWipeAll" type="button" style="background:#4c0519;color:#fecdd3;border:1px solid rgba(244,63,94,0.5);border-radius:10px;padding:8px 12px;font-size:12px;font-weight:700;cursor:pointer;">Delete All Constellations</button>
        </div>
        <div id="afStCList" style="display:flex;flex-direction:column;gap:8px;margin-bottom:12px;"></div>
        <div style="font-size:11px;color:#fcd34d;margin-bottom:6px;font-weight:700;">Nodes</div>
        <div id="afStNList" style="display:flex;flex-direction:column;gap:6px;max-height:170px;overflow:auto;"></div>
      </div>\`;

    function draw() {
      const { state } = findStore();
      const cs = getConstellations(state);
      const ns = Array.isArray(state.nodes) ? state.nodes : [];
      modal.querySelector("#afStCList").innerHTML = cs.length
        ? cs.map((c, i) => {
            const id = getId(c) || String(i);
            const name = c.name || c.title || \`Constellation \${i + 1}\`;
            return \`<div style="display:flex;align-items:center;justify-content:space-between;gap:8px;background:#0e0819;padding:8px 10px;border-radius:12px;">
              <label style="display:flex;align-items:center;gap:8px;font-size:12px;cursor:pointer;flex:1;min-width:0;">
                <input type="checkbox" class="af-c-chk" value="\${id}">
                <span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">\${name}</span>
              </label>
              <button type="button" data-c-del="\${id}" style="background:#be123c;color:#fff;border:none;border-radius:8px;padding:5px 9px;font-size:11px;font-weight:700;cursor:pointer;">Delete</button>
            </div>\`;
          }).join("")
        : \`<div style="font-size:12px;color:#a1a1aa;">No constellations</div>\`;

      modal.querySelector("#afStNList").innerHTML = ns.length
        ? ns.map((n, i) => {
            const id = getId(n) || String(i);
            const name = n.title || n.name || n.label || \`Node \${i + 1}\`;
            return \`<div style="display:flex;align-items:center;justify-content:space-between;gap:8px;background:#0e0819;padding:6px 10px;border-radius:10px;font-size:11px;">
              <label style="display:flex;align-items:center;gap:8px;cursor:pointer;flex:1;min-width:0;">
                <input type="checkbox" class="af-n-chk" value="\${id}">
                <span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">\${name}</span>
              </label>
              <button type="button" data-n-del="\${id}" style="background:#3f3f46;color:#fff;border:none;border-radius:7px;padding:4px 8px;font-size:10px;font-weight:700;cursor:pointer;">Remove</button>
            </div>\`;
          }).join("")
        : \`<div style="font-size:11px;color:#a1a1aa;">No nodes</div>\`;
    }

    chip.addEventListener("click", () => { draw(); modal.style.display = "flex"; });
    modal.querySelector("#afStClose").addEventListener("click", () => { modal.style.display = "none"; });
    modal.addEventListener("click", e => {
      const c = e.target.closest("[data-c-del]");
      if (c) { deleteConstellationIds([c.getAttribute("data-c-del")]); draw(); return; }
      const n = e.target.closest("[data-n-del]");
      if (n) { deleteNodeIds([n.getAttribute("data-n-del")]); draw(); }
    });
    modal.querySelector("#afStDelChecked").addEventListener("click", () => {
      const cIds = [...modal.querySelectorAll(".af-c-chk:checked")].map(x => x.value);
      const nIds = [...modal.querySelectorAll(".af-n-chk:checked")].map(x => x.value);
      if (cIds.length) deleteConstellationIds(cIds);
      if (nIds.length) deleteNodeIds(nIds);
      draw();
    });
    modal.querySelector("#afStWipeAll").addEventListener("click", () => {
      const { state } = findStore();
      const allIds = getConstellations(state).map(getId).filter(Boolean);
      if (allIds.length) deleteConstellationIds(allIds);
      draw();
    });

    document.body.appendChild(chip);
    document.body.appendChild(modal);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", mountUI);
  else mountUI();
})();`;
}

/**
 * Automatically installs the deletion runtime into `Skill-Tree/app-forge-deleter.js`
 * and injects a non-duplicate loader script tag into `Skill-Tree/index.html`.
 */
export async function pushSkillTreeDeletePatch({ owner = "badpeachring", targetRepo = "Skill-Tree", token } = {}) {
  const authToken = token || localStorage.getItem(AF_TOKEN_KEY) || "";
  if (!authToken) throw new Error("Missing GitHub token.");

  const runtimeCode = buildSkillTreeDeleteRuntimeCode();
  await putRepoFile(
    owner,
    targetRepo,
    "app-forge-deleter.js",
    runtimeCode,
    "Install App Forge Skill-Tree deleter runtime",
    authToken
  );

  const htmlFile = await getRepoFile(owner, targetRepo, "index.html", authToken);
  if (!htmlFile.exists) throw new Error("Skill-Tree/index.html not found.");

  const loaderTag = `<script src="./app-forge-deleter.js?v=1" defer></script>`;
  const patchedHtml = applyPatchOperations(htmlFile.content, [
    { type: "append_before_body", snippet: loaderTag }
  ]);

  if (patchedHtml !== htmlFile.content) {
    await putRepoFile(
      owner,
      targetRepo,
      "index.html",
      patchedHtml,
      "Wire App Forge deleter into Skill-Tree index.html",
      authToken
    );
  }

  return { ok: true, repo: targetRepo, filesUpdated: ["app-forge-deleter.js", "index.html"] };
}

window.appForgePatchEngine = {
  getRepoFile,
  putRepoFile,
  applyPatchOperations,
  pushSkillTreeDeletePatch
};
