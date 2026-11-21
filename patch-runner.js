(() => {
  if (window.__afPatchRunnerLoaded) return;
  window.__afPatchRunnerLoaded = true;

  function toUtf8Base64(str) {
    const bytes = new TextEncoder().encode(str);
    let bin = "";
    for (let i = 0; i < bytes.length; i += 8192) {
      bin += String.fromCharCode(...bytes.subarray(i, i + 8192));
    }
    return btoa(bin);
  }

  function fromUtf8Base64(b64) {
    const clean = (b64 || "").replace(/\n/g, "");
    const raw = atob(clean);
    const bytes = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
    return new TextDecoder().decode(bytes);
  }

  function getAuthHeaders() {
    const token =
      localStorage.getItem("app_forge_gh_token_v1") ||
      document.getElementById("ghToken")?.value.trim() ||
      "";
    if (!token) throw new Error("GitHub token missing. Connect your token first.");
    return {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "Content-Type": "application/json"
    };
  }

  async function getOwner(headers) {
    const res = await fetch("https://api.github.com/user", { headers });
    if (!res.ok) throw new Error(`GitHub auth failed (HTTP ${res.status})`);
    const data = await res.json();
    return data.login;
  }

  async function fetchFile(owner, repo, path, headers) {
    const res = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/contents/${path}`,
      { headers, cache: "no-store" }
    );
    if (res.status === 404) return { exists: false, sha: null, content: "" };
    if (!res.ok) throw new Error(`GET ${path} failed (HTTP ${res.status})`);
    const data = await res.json();
    return {
      exists: true,
      sha: data.sha,
      content: data.content ? fromUtf8Base64(data.content) : ""
    };
  }

  async function putFile(owner, repo, path, content, sha, message, headers) {
    const body = { message, content: toUtf8Base64(content) };
    if (sha) body.sha = sha;
    const res = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/contents/${path}`,
      { method: "PUT", headers, body: JSON.stringify(body) }
    );
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(`PUT ${path} failed: ${err.message || res.status}`);
    }
    return res.json();
  }

  async function deleteFile(owner, repo, path, sha, message, headers) {
    const res = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/contents/${path}`,
      {
        method: "DELETE",
        headers,
        body: JSON.stringify({ message, sha })
      }
    );
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(`DELETE ${path} failed: ${err.message || res.status}`);
    }
    return res.json();
  }

  async function runPatch(rawJson, { dryRun = false, log }) {
    let payload;
    try {
      payload = JSON.parse(rawJson);
    } catch (err) {
      throw new Error(`Invalid JSON syntax: ${err.message}`);
    }

    const repo = String(payload.repo || "").trim();
    const ops = Array.isArray(payload.ops) ? payload.ops : [];
    const commitMsg = payload.commitMessage || "Automated patch via App Forge";

    if (!repo) throw new Error('Patch JSON missing required "repo" field.');
    if (!ops.length) throw new Error('Patch JSON has no operations in "ops".');

    const headers = getAuthHeaders();
    const owner = await getOwner(headers);

    log(`${dryRun ? "[DRY RUN]" : "[EXECUTE]"} Target: ${owner}/${repo} (${ops.length} op${ops.length === 1 ? "" : "s"})`);
    if (!dryRun && typeof window.setMjState === "function") {
      window.setMjState("hack", `Running ${ops.length} patch op(s) on ${repo}...`);
    }

    let passed = 0;
    let failed = 0;

    for (let i = 0; i < ops.length; i++) {
      const op = ops[i];
      const tag = `#${i + 1} [${String(op.action || "").toUpperCase()}] ${op.file || "?"}`;
      try {
        if (!op.file) throw new Error('Missing "file" path.');
        const current = await fetchFile(owner, repo, op.file, headers);

        if (op.action === "replace") {
          if (!current.exists) throw new Error("File does not exist.");
          if (typeof op.find !== "string" || !op.find.length) throw new Error('Missing "find" string.');
          if (!current.content.includes(op.find)) throw new Error("Target snippet not found in live file.");
          const nextContent = op.all
            ? current.content.split(op.find).join(op.replace ?? "")
            : current.content.replace(op.find, op.replace ?? "");
          if (!dryRun) {
            await putFile(owner, repo, op.file, nextContent, current.sha, `${commitMsg} (${op.file})`, headers);
          }
          log(`  [OK] ${tag} — matched & ${dryRun ? "ready" : "updated"}`);
          passed++;
        } else if (op.action === "write" || op.action === "create") {
          if (typeof op.content !== "string") throw new Error('Missing "content" string.');
          if (!dryRun) {
            await putFile(owner, repo, op.file, op.content, current.sha, `${commitMsg} (${op.file})`, headers);
          }
          log(`  [OK] ${tag} — ${current.exists ? "overwrite" : "create"} ${dryRun ? "ready" : "pushed"}`);
          passed++;
        } else if (op.action === "append") {
          if (!current.exists) throw new Error("File does not exist.");
          if (typeof op.content !== "string") throw new Error('Missing "content" string.');
          let nextContent;
          if (op.before) {
            if (!current.content.includes(op.before)) throw new Error(`Anchor "${op.before}" not found.`);
            nextContent = current.content.replace(op.before, `${op.content}\n${op.before}`);
          } else {
            nextContent = `${current.content}\n${op.content}`;
          }
          if (!dryRun) {
            await putFile(owner, repo, op.file, nextContent, current.sha, `${commitMsg} (${op.file})`, headers);
          }
          log(`  [OK] ${tag} — ${dryRun ? "ready" : "appended"}`);
          passed++;
        } else if (op.action === "delete") {
          if (!current.exists) {
            log(`  [SKIP] ${tag} — already deleted`);
            passed++;
            continue;
          }
          if (!dryRun) {
            await deleteFile(owner, repo, op.file, current.sha, `${commitMsg} (delete ${op.file})`, headers);
          }
          log(`  [OK] ${tag} — ${dryRun ? "ready to delete" : "deleted"}`);
          passed++;
        } else {
          throw new Error(`Unknown action "${op.action}"`);
        }
      } catch (err) {
        failed++;
        log(`  [FAIL] ${tag} — ${err.message}`);
      }
    }

    log(`----------------------------------------`);
    log(`DONE: ${passed} passed, ${failed} failed.`);
    if (!dryRun && failed === 0 && typeof window.setMjState === "function") {
      window.setMjState("celebrate", `All ${passed} patch ops deployed to ${repo}!`);
    }
  }

  function mountPatchRunnerUI() {
    if (document.getElementById("afPatchRunnerBtn")) return;

    const createBtn = document.getElementById("createFileModeBtn");
    const targetRow = createBtn?.parentElement;
    if (!targetRow) return;

    const btn = document.createElement("button");
    btn.id = "afPatchRunnerBtn";
    btn.type = "button";
    btn.textContent = "⚡ Patch";
    btn.className = "px-3 py-1.5 bg-amber-500/20 border border-amber-400/50 text-amber-200 font-bold rounded-xl text-xs shrink-0";
    targetRow.appendChild(btn);

    const modal = document.createElement("div");
    modal.id = "afPatchModal";
    modal.className = "hidden fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-4";
    modal.innerHTML = `
      <div class="w-full max-w-lg rounded-2xl bg-[#120b1c] border border-amber-500/45 p-4 space-y-3 shadow-2xl">
        <div class="flex items-center justify-between gap-2">
          <span class="text-xs font-black uppercase tracking-wider text-amber-300">⚡ JSON Patch Runner</span>
          <div class="flex gap-1.5">
            <button id="afPastePatchBtn" type="button" class="px-2.5 py-1 rounded-lg bg-amber-400 text-slate-950 font-black text-[11px]">📋 Paste JSON</button>
            <button id="afClosePatchBtn" type="button" class="px-2.5 py-1 rounded-lg bg-slate-800 text-slate-200 font-bold text-[11px]">Close</button>
          </div>
        </div>
        <textarea id="afPatchInput" rows="8" spellcheck="false" placeholder='Paste JSON patch payload here...' class="w-full bg-[#07040b] border border-amber-500/25 rounded-xl p-2.5 text-[11px] text-amber-100 font-mono leading-relaxed outline-none"></textarea>
        <div class="flex gap-2">
          <button id="afDryRunPatchBtn" type="button" class="flex-1 py-2 rounded-xl bg-slate-800 border border-sky-400/45 text-sky-200 font-bold text-xs">🧪 Dry Run</button>
          <button id="afExecPatchBtn" type="button" class="flex-1 py-2 rounded-xl bg-gradient-to-r from-amber-500 to-rose-500 text-slate-950 font-black text-xs">🚀 Execute Patch</button>
        </div>
        <textarea id="afPatchLog" readonly rows="7" placeholder="Execution log will appear here..." class="w-full bg-[#050308] border border-slate-700/60 rounded-xl p-2.5 text-[10px] text-emerald-300 font-mono leading-relaxed outline-none"></textarea>
      </div>
    `;
    document.body.appendChild(modal);

    const inputEl = document.getElementById("afPatchInput");
    const logEl = document.getElementById("afPatchLog");
    const appendLog = (line) => {
      logEl.value += (logEl.value ? "\n" : "") + line;
      logEl.scrollTop = logEl.scrollHeight;
    };

    btn.addEventListener("click", () => modal.classList.remove("hidden"));
    document.getElementById("afClosePatchBtn").addEventListener("click", () => modal.classList.add("hidden"));

    document.getElementById("afPastePatchBtn").addEventListener("click", async () => {
      try {
        const clip = await navigator.clipboard.readText();
        if (clip) inputEl.value = clip;
      } catch {
        const manual = prompt("Paste JSON patch:");
        if (manual !== null) inputEl.value = manual;
      }
    });

    const trigger = async (dryRun) => {
      logEl.value = "";
      try {
        await runPatch(inputEl.value, { dryRun, log: appendLog });
      } catch (err) {
        appendLog(`[ERROR] ${err.message}`);
      }
    };

    document.getElementById("afDryRunPatchBtn").addEventListener("click", () => trigger(true));
    document.getElementById("afExecPatchBtn").addEventListener("click", () => trigger(false));
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", mountPatchRunnerUI);
  } else {
    mountPatchRunnerUI();
  }
})();
