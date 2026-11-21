(() => {
  if (window.__afRepoScannerLoaded) return;
  window.__afRepoScannerLoaded = true;

  function decodeB64Utf8(b64) {
    const clean = (b64 || "").replace(/\n/g, "");
    const raw = atob(clean);
    const bytes = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
    return new TextDecoder().decode(bytes);
  }

  function checkBalancedDelimiters(code) {
    const issues = [];
    const stack = [];
    const pairs = { "{": "}", "(": ")", "[": "]" };
    const closers = new Set(["}", ")", "]"]);
    let inSingle = false, inDouble = false, inTemplate = false, inLineComment = false, inBlockComment = false;
    let line = 1;

    for (let i = 0; i < code.length; i++) {
      const ch = code[i];
      const next = code[i + 1];
      if (ch === "\n") {
        line++;
        inLineComment = false;
        continue;
      }
      if (inLineComment) continue;
      if (inBlockComment) {
        if (ch === "*" && next === "/") { inBlockComment = false; i++; }
        continue;
      }
      if (!inSingle && !inDouble && !inTemplate) {
        if (ch === "/" && next === "/") { inLineComment = true; i++; continue; }
        if (ch === "/" && next === "*") { inBlockComment = true; i++; continue; }
      }
      if (ch === "\\" && (inSingle || inDouble || inTemplate)) { i++; continue; }
      if (!inDouble && !inTemplate && ch === "'") { inSingle = !inSingle; continue; }
      if (!inSingle && !inTemplate && ch === '"') { inDouble = !inDouble; continue; }
      if (!inSingle && !inDouble && ch === "`") { inTemplate = !inTemplate; continue; }
      if (inSingle || inDouble || inTemplate) continue;

      if (pairs[ch]) {
        stack.push({ ch, expected: pairs[ch], line });
      } else if (closers.has(ch)) {
        const top = stack.pop();
        if (!top) {
          issues.push(`Line ${line}: Unexpected closing '${ch}' with no matching opener.`);
        } else if (top.expected !== ch) {
          issues.push(`Line ${line}: Mismatched '${ch}' (expected '${top.expected}' from line ${top.line}).`);
        }
      }
    }

    if (inSingle || inDouble || inTemplate) {
      issues.push(`EOF (Line ${line}): Unterminated string literal.`);
    }
    while (stack.length) {
      const unclosed = stack.pop();
      issues.push(`Line ${unclosed.line}: Unclosed '${unclosed.ch}' (missing '${unclosed.expected}').`);
    }
    return issues;
  }

  function scanHtmlFile(path, content, repoFileSet) {
    const issues = [];
    const lines = content.split("\n");

    const bodyCloseCount = (content.match(/<\/body\s*>/gi) || []).length;
    const htmlCloseCount = (content.match(/<\/html\s*>/gi) || []).length;
    if (bodyCloseCount !== 1) issues.push(`Found ${bodyCloseCount} </body> tags (expected exactly 1).`);
    if (htmlCloseCount !== 1) issues.push(`Found ${htmlCloseCount} </html> tags (expected exactly 1).`);

    const lastHtmlIdx = content.toLowerCase().lastIndexOf("</html>");
    if (lastHtmlIdx !== -1) {
      const trailing = content.slice(lastHtmlIdx + 7).trim();
      if (trailing) {
        issues.push(`Stray trailing content after </html>: "${trailing.slice(0, 80).replace(/\n/g, " ")}"`);
      }
    }

    lines.forEach((ln, idx) => {
      if (/<[a-z]+[^>]*<script/i.test(ln)) {
        issues.push(`Line ${idx + 1}: Truncated HTML tag colliding with <script>: "${ln.trim().slice(0, 90)}"`);
      }
      if (/^\s*script\s+src=/i.test(ln)) {
        issues.push(`Line ${idx + 1}: Malformed <script> tag missing '<': "${ln.trim().slice(0, 80)}"`);
      }
    });

    const openScripts = (content.match(/<script\b[^>]*>/gi) || []).length;
    const closeScripts = (content.match(/<\/script\s*>/gi) || []).length;
    if (openScripts !== closeScripts) {
      issues.push(`Mismatched <script> tags: ${openScripts} opening vs ${closeScripts} closing.`);
    }

    // Check local src/href references
    const refRegex = /\b(?:src|href)=["']([^"'#?]+)(?:\?[^"']*)?["']/gi;
    let m;
    while ((m = refRegex.exec(content)) !== null) {
      const ref = m[1].trim();
      if (!ref || /^(https?:|data:|mailto:|tel:|javascript:)/i.test(ref)) continue;
      const cleanRef = ref.replace(/^\.?\//, "");
      if (!repoFileSet.has(cleanRef)) {
        issues.push(`Missing local asset/script reference: "${ref}" (not found in repo root).`);
      }
    }

    // Check inline <script> blocks syntax
    const inlineScriptRegex = /<script\b(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi;
    let sIdx = 0;
    while ((m = inlineScriptRegex.exec(content)) !== null) {
      sIdx++;
      const jsBody = m[1];
      try {
        new Function(jsBody);
      } catch (err) {
        issues.push(`Inline <script> #${sIdx} syntax error: ${err.message}`);
      }
      const delimIssues = checkBalancedDelimiters(jsBody);
      delimIssues.slice(0, 3).forEach((d) => issues.push(`Inline <script> #${sIdx} -> ${d}`));
    }

    // Extract HTML IDs for cross-checking JS files
    const htmlIds = new Set();
    const idRegex = /\bid=["']([^"']+)["']/gi;
    while ((m = idRegex.exec(content)) !== null) htmlIds.add(m[1]);

    return { issues, htmlIds };
  }

  function scanJsFile(path, content, htmlIds) {
    const issues = [];
    try {
      new Function(content);
    } catch (err) {
      issues.push(`JavaScript SyntaxError: ${err.message}`);
    }

    const delimIssues = checkBalancedDelimiters(content);
    delimIssues.slice(0, 4).forEach((d) => issues.push(d));

    // Check DOM getElementById references against index.html IDs
    if (htmlIds && htmlIds.size > 0) {
      const missingIds = new Set();
      const getElRegex = /document\.getElementById\(\s*["']([^"']+)["']\s*\)/g;
      let m;
      while ((m = getElRegex.exec(content)) !== null) {
        const targetId = m[1];
        // Ignore IDs created dynamically in the same file
        const createdInFile = content.includes(`id = "${targetId}"`) || content.includes(`id = '${targetId}'`) || content.includes(`id="${targetId}"`);
        if (!htmlIds.has(targetId) && !createdInFile) {
          missingIds.add(targetId);
        }
      }
      if (missingIds.size) {
        issues.push(`References missing DOM IDs not in index.html: ${[...missingIds].map((x) => `#${x}`).join(", ")}`);
      }
    }

    // Check for unguarded JSON.parse
    const lines = content.split("\n");
    lines.forEach((ln, idx) => {
      if (ln.includes("JSON.parse(") && !content.slice(Math.max(0, content.indexOf(ln) - 180), content.indexOf(ln)).includes("try")) {
        issues.push(`Line ${idx + 1}: Unguarded JSON.parse() without nearby try/catch (can crash on corrupt localStorage).`);
      }
    });

    return issues;
  }

  function scanJsonFile(path, content, repoFileSet) {
    const issues = [];
    try {
      const parsed = JSON.parse(content);
      if (path === "manifest.json" && Array.isArray(parsed.icons)) {
        parsed.icons.forEach((ic) => {
          const cleanSrc = String(ic.src || "").split("?")[0].replace(/^\.?\//, "");
          if (cleanSrc && !repoFileSet.has(cleanSrc)) {
            issues.push(`manifest.json icon missing from repo: "${ic.src}"`);
          }
        });
      }
    } catch (err) {
      issues.push(`Invalid JSON: ${err.message}`);
    }
    return issues;
  }

  async function runFullRepoScan(statusCb) {
    const repoSelect = document.getElementById("repoSelect");
    const tokenInput = document.getElementById("ghToken");
    const repo = repoSelect?.value;
    const token = localStorage.getItem("app_forge_gh_token_v1") || tokenInput?.value.trim();

    if (!repo || !token) {
      return "Connect your GitHub token and select a repository first.";
    }

    const headers = {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json"
    };

    statusCb(`Fetching file tree for ${repo}...`);
    const userRes = await fetch("https://api.github.com/user", { headers });
    if (!userRes.ok) return `GitHub auth failed (HTTP ${userRes.status}).`;
    const { login: owner } = await userRes.json();

    const treeRes = await fetch(`https://api.github.com/repos/${owner}/${repo}/git/trees/HEAD?recursive=1`, { headers });
    if (!treeRes.ok) return `Could not read repository tree for ${repo} (HTTP ${treeRes.status}).`;
    const treeData = await treeRes.json();

    const blobs = (treeData.tree || []).filter((item) => item.type === "blob");
    const repoFileSet = new Set(blobs.map((b) => b.path));
    const codeBlobs = blobs.filter((b) => /\.(html?|js|mjs|json|css)$/i.test(b.path));

    const fileContents = new Map();
    for (let i = 0; i < codeBlobs.length; i++) {
      const file = codeBlobs[i];
      statusCb(`Scanning (${i + 1}/${codeBlobs.length}): ${file.path}`);
      const fRes = await fetch(`https://api.github.com/repos/${owner}/${repo}/contents/${file.path}`, { headers });
      if (!fRes.ok) continue;
      const fData = await fRes.json();
      if (fData.content) {
        fileContents.set(file.path, decodeB64Utf8(fData.content));
      }
    }

    const report = [];
    report.push(`REPO AUDIT: ${owner}/${repo}`);
    report.push(`Scanned ${codeBlobs.length} code/config files (${blobs.length} total files in repo)`);
    report.push(`Timestamp: ${new Date().toLocaleString()}`);
    report.push("----------------------------------------");

    let htmlIds = new Set();
    if (fileContents.has("index.html")) {
      const htmlRes = scanHtmlFile("index.html", fileContents.get("index.html"), repoFileSet);
      htmlIds = htmlRes.htmlIds;
    }

    let totalIssues = 0;

    for (const [path, content] of fileContents.entries()) {
      let fileIssues = [];
      if (/\.html?$/i.test(path)) {
        fileIssues = scanHtmlFile(path, content, repoFileSet).issues;
      } else if (/\.m?js$/i.test(path)) {
        fileIssues = scanJsFile(path, content, htmlIds);
      } else if (/\.json$/i.test(path)) {
        fileIssues = scanJsonFile(path, content, repoFileSet);
      }

      if (fileIssues.length) {
        totalIssues += fileIssues.length;
        report.push(`\n[!] ${path} (${fileIssues.length} issue${fileIssues.length === 1 ? "" : "s"}):`);
        fileIssues.forEach((iss) => report.push(`  - ${iss}`));
      } else {
        report.push(`\n[OK] ${path} — clean`);
      }
    }

    report.push("\n----------------------------------------");
    report.push(`SUMMARY: ${totalIssues} total issue${totalIssues === 1 ? "" : "s"} detected across ${codeBlobs.length} files.`);
    return report.join("\n");
  }

  function mountScannerUI() {
    if (document.getElementById("afScanRepoBtn")) return;

    const createBtn = document.getElementById("createFileModeBtn");
    const targetRow = createBtn?.parentElement;
    if (!targetRow) return;

    const scanBtn = document.createElement("button");
    scanBtn.id = "afScanRepoBtn";
    scanBtn.type = "button";
    scanBtn.textContent = "🔍 Scan Repo";
    scanBtn.className = "px-3 py-1.5 bg-sky-500/20 border border-sky-400/45 text-sky-200 font-bold rounded-xl text-xs shrink-0";
    targetRow.appendChild(scanBtn);

    const modal = document.createElement("div");
    modal.id = "afScannerModal";
    modal.className = "hidden fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-4";
    modal.innerHTML = `
      <div class="w-full max-w-lg rounded-2xl bg-[#120b1c] border border-sky-500/40 p-4 space-y-3 shadow-2xl">
        <div class="flex items-center justify-between gap-2">
          <span class="text-xs font-black uppercase tracking-wider text-sky-300">🔍 Full Repository Code Audit</span>
          <div class="flex gap-1.5">
            <button id="afCopyScanBtn" type="button" class="px-2.5 py-1 rounded-lg bg-amber-400 text-slate-950 font-black text-[11px]">Copy Report</button>
            <button id="afCloseScanBtn" type="button" class="px-2.5 py-1 rounded-lg bg-slate-800 text-slate-200 font-bold text-[11px]">Close</button>
          </div>
        </div>
        <div id="afScanStatus" class="text-[11px] font-mono text-emerald-300">Ready to scan selected repository...</div>
        <textarea id="afScanOutput" readonly rows="15" class="w-full bg-[#07040b] border border-sky-500/25 rounded-xl p-3 text-[11px] text-slate-100 font-mono leading-relaxed outline-none"></textarea>
      </div>
    `;
    document.body.appendChild(modal);

    scanBtn.addEventListener("click", async () => {
      modal.classList.remove("hidden");
      const statusEl = document.getElementById("afScanStatus");
      const outEl = document.getElementById("afScanOutput");
      outEl.value = "Running audit across all files...";
      try {
        const result = await runFullRepoScan((msg) => {
          statusEl.textContent = msg;
        });
        statusEl.textContent = "Audit complete.";
        outEl.value = result;
      } catch (err) {
        statusEl.textContent = "Audit failed.";
        outEl.value = `Error: ${err.message}`;
      }
    });

    document.getElementById("afCloseScanBtn").addEventListener("click", () => {
      modal.classList.add("hidden");
    });

    document.getElementById("afCopyScanBtn").addEventListener("click", async () => {
      const txt = document.getElementById("afScanOutput").value;
      await navigator.clipboard.writeText(txt);
      document.getElementById("afCopyScanBtn").textContent = "Copied!";
      setTimeout(() => {
        document.getElementById("afCopyScanBtn").textContent = "Copy Report";
      }, 1800);
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", mountScannerUI);
  } else {
    mountScannerUI();
  }
})();
