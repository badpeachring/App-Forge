(() => {
  if (window.__afRepoScannerV2) return;
  window.__afRepoScannerV2 = true;

  function decodeB64Utf8(b64) {
    const clean = (b64 || '').replace(/\n/g, '');
    const raw = atob(clean);
    const bytes = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
    return new TextDecoder().decode(bytes);
  }

  function getSnippet(content, targetLine, radius = 6) {
    const lines = content.split('\n');
    const idx = Math.max(1, Math.min(lines.length, targetLine || lines.length));
    const start = Math.max(1, idx - radius);
    const end = Math.min(lines.length, idx + radius);
    const out = [];
    for (let i = start; i <= end; i++) {
      const mark = i === idx ? '>>>' : '   ';
      out.push(`    ${mark} ${String(i).padStart(4, ' ')} | ${lines[i - 1]}`);
    }
    return out.join('\n');
  }

  function checkBalanced(code) {
    const issues = [];
    const stack = [];
    const pairs = { '{': '}', '(': ')', '[': ']' };
    const closers = new Set(['}', ')', ']']);
    let inS = false, inD = false, inT = false, inLC = false, inBC = false;
    let line = 1;
    for (let i = 0; i < code.length; i++) {
      const ch = code[i], next = code[i + 1];
      if (ch === '\n') { line++; inLC = false; continue; }
      if (inLC) continue;
      if (inBC) { if (ch === '*' && next === '/') { inBC = false; i++; } continue; }
      if (!inS && !inD && !inT) {
        if (ch === '/' && next === '/') { inLC = true; i++; continue; }
        if (ch === '/' && next === '*') { inBC = true; i++; continue; }
      }
      if (ch === '\\' && (inS || inD || inT)) { i++; continue; }
      if (!inD && !inT && ch === "'") { inS = !inS; continue; }
      if (!inS && !inT && ch === '"') { inD = !inD; continue; }
      if (!inS && !inD && ch === '`') { inT = !inT; continue; }
      if (inS || inD || inT) continue;
      if (pairs[ch]) stack.push({ ch, expected: pairs[ch], line });
      else if (closers.has(ch)) {
        const top = stack.pop();
        if (!top) issues.push({ line, msg: `Unexpected closing '${ch}' with no matching opener.` });
        else if (top.expected !== ch) issues.push({ line, msg: `Mismatched '${ch}' (expected '${top.expected}' from line ${top.line}).` });
      }
    }
    if (inS || inD || inT) issues.push({ line, msg: 'Unterminated string literal at EOF.' });
    while (stack.length) {
      const u = stack.pop();
      issues.push({ line: u.line, msg: `Unclosed '${u.ch}' (missing '${u.expected}').` });
    }
    return issues;
  }

  function scanHtml(content, repoFileSet) {
    const issues = [];
    const lines = content.split('\n');
    const bodyClose = (content.match(/<\/body\s*>/gi) || []).length;
    const htmlClose = (content.match(/<\/html\s*>/gi) || []).length;
    if (bodyClose !== 1) issues.push({ line: lines.length, msg: `Found ${bodyClose} </body> tags (expected 1).` });
    if (htmlClose !== 1) issues.push({ line: lines.length, msg: `Found ${htmlClose} </html> tags (expected 1).` });
    const lastHtml = content.toLowerCase().lastIndexOf('</html>');
    if (lastHtml !== -1 && content.slice(lastHtml + 7).trim()) {
      issues.push({ line: lines.length, msg: 'Stray trailing content after </html>.' });
    }
    lines.forEach((ln, idx) => {
      if (/<[a-z]+[^>]*<script/i.test(ln)) issues.push({ line: idx + 1, msg: 'Truncated HTML tag colliding with <script>.' });
      if (/^\s*script\s+src=/i.test(ln)) issues.push({ line: idx + 1, msg: 'Malformed <script> tag missing opening <.' });
    });
    const refRe = /\b(?:src|href)=["']([^"'#?]+)(?:\?[^"']*)?["']/gi;
    let m;
    while ((m = refRe.exec(content)) !== null) {
      const ref = m[1].trim();
      if (!ref || /^(https?:|data:|mailto:|tel:|javascript:)/i.test(ref)) continue;
      const cleanRef = ref.replace(/^\.?\//, '');
      if (!repoFileSet.has(cleanRef)) issues.push({ line: null, msg: `Missing local reference: "${ref}"` });
    }
    const htmlIds = new Set();
    const idRe = /\bid=["']([^"']+)["']/gi;
    while ((m = idRe.exec(content)) !== null) htmlIds.add(m[1]);
    return { issues, htmlIds };
  }

  function scanJs(content, htmlIds) {
    const issues = [];
    try { new Function(content); } catch (err) {
      issues.push({ line: content.split('\n').length, msg: `SyntaxError: ${err.message}` });
    }
    checkBalanced(content).slice(0, 3).forEach(d => issues.push(d));
    if (htmlIds && htmlIds.size) {
      const missing = new Set();
      const re = /document\.getElementById\(\s*["']([^"']+)["']\s*\)/g;
      let m;
      while ((m = re.exec(content)) !== null) {
        const id = m[1];
        const created = content.includes(`id = "${id}"`) || content.includes(`id = '${id}'`) || content.includes(`id="${id}"`);
        if (!htmlIds.has(id) && !created) missing.add(id);
      }
      if (missing.size) issues.push({ line: null, msg: `Missing DOM IDs not in index.html: ${[...missing].map(x => '#' + x).join(', ')}` });
    }
    return issues;
  }

  function scanJson(path, content, repoFileSet) {
    const issues = [];
    try {
      const p = JSON.parse(content);
      if (path === 'manifest.json' && Array.isArray(p.icons)) {
        p.icons.forEach(ic => {
          const src = String(ic.src || '').split('?')[0].replace(/^\.?\//, '');
          if (src && !repoFileSet.has(src)) issues.push({ line: null, msg: `manifest.json icon missing: "${ic.src}"` });
        });
      }
    } catch (err) {
      issues.push({ line: 1, msg: `Invalid JSON: ${err.message}` });
    }
    return issues;
  }

  async function runFullScan(statusCb) {
    const repo = document.getElementById('repoSelect')?.value;
    const token = localStorage.getItem('app_forge_gh_token_v1') || document.getElementById('ghToken')?.value.trim();
    if (!repo || !token) return 'Connect your GitHub token and select a repo first.';
    const headers = { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json' };
    statusCb(`Fetching file tree for ${repo}...`);
    const uRes = await fetch('https://api.github.com/user', { headers });
    if (!uRes.ok) return `GitHub auth failed (HTTP ${uRes.status}).`;
    const { login: owner } = await uRes.json();
    const tRes = await fetch(`https://api.github.com/repos/${owner}/${repo}/git/trees/HEAD?recursive=1`, { headers });
    if (!tRes.ok) return `Tree fetch failed (HTTP ${tRes.status}).`;
    const blobs = ((await tRes.json()).tree || []).filter(i => i.type === 'blob');
    const repoFileSet = new Set(blobs.map(b => b.path));
    const codeBlobs = blobs.filter(b => /\.(html?|js|mjs|json|css)$/i.test(b.path));

    const contents = new Map();
    for (let i = 0; i < codeBlobs.length; i++) {
      const f = codeBlobs[i];
      statusCb(`Scanning (${i + 1}/${codeBlobs.length}): ${f.path}`);
      const r = await fetch(`https://api.github.com/repos/${owner}/${repo}/contents/${f.path}`, { headers });
      if (r.ok) {
        const d = await r.json();
        if (d.content) contents.set(f.path, decodeB64Utf8(d.content));
      }
    }

    const report = [`REPO AUDIT v2: ${owner}/${repo}`, `Scanned ${codeBlobs.length} files`, '----------------------------------------'];
    let htmlIds = new Set();
    if (contents.has('index.html')) htmlIds = scanHtml(contents.get('index.html'), repoFileSet).htmlIds;
    let total = 0;

    for (const [path, content] of contents.entries()) {
      let list = [];
      if (/\.html?$/i.test(path)) list = scanHtml(content, repoFileSet).issues;
      else if (/\.m?js$/i.test(path)) list = scanJs(content, htmlIds);
      else if (/\.json$/i.test(path)) list = scanJson(path, content, repoFileSet);

      if (list.length) {
        total += list.length;
        report.push(`\n[!] ${path} (${list.length} issue${list.length === 1 ? '' : 's'}):`);
        const shownLines = new Set();
        list.forEach(iss => {
          report.push(`  - ${iss.line ? 'Line ' + iss.line + ': ' : ''}${iss.msg}`);
          if (iss.line && !shownLines.has(iss.line)) {
            shownLines.add(iss.line);
            report.push(getSnippet(content, iss.line, 6));
          }
        });
      } else {
        report.push(`[OK] ${path}`);
      }
    }
    report.push('\n----------------------------------------');
    report.push(`SUMMARY: ${total} issue${total === 1 ? '' : 's'} across ${codeBlobs.length} files.`);
    return report.join('\n');
  }

  function mountUI() {
    if (document.getElementById('afScanRepoBtn')) return;
    const row = document.getElementById('createFileModeBtn')?.parentElement;
    if (!row) return;
    const btn = document.createElement('button');
    btn.id = 'afScanRepoBtn';
    btn.type = 'button';
    btn.textContent = '🔍 Scan v2';
    btn.className = 'px-3 py-1.5 bg-sky-500/20 border border-sky-400/45 text-sky-200 font-bold rounded-xl text-xs shrink-0';
    row.appendChild(btn);

    const modal = document.createElement('div');
    modal.id = 'afScannerModal';
    modal.className = 'hidden fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-4';
    modal.innerHTML = `<div class="w-full max-w-lg rounded-2xl bg-[#120b1c] border border-sky-500/40 p-4 space-y-3 shadow-2xl"><div class="flex items-center justify-between gap-2"><span class="text-xs font-black uppercase tracking-wider text-sky-300">🔍 Context Scanner v2</span><div class="flex gap-1.5"><button id="afCopyScanBtn" type="button" class="px-2.5 py-1 rounded-lg bg-amber-400 text-slate-950 font-black text-[11px]">Copy Report</button><button id="afCloseScanBtn" type="button" class="px-2.5 py-1 rounded-lg bg-slate-800 text-slate-200 font-bold text-[11px]">Close</button></div></div><div id="afScanStatus" class="text-[11px] font-mono text-emerald-300">Ready...</div><textarea id="afScanOutput" readonly rows="16" class="w-full bg-[#07040b] border border-sky-500/25 rounded-xl p-3 text-[10px] text-slate-100 font-mono leading-relaxed outline-none"></textarea></div>`;
    document.body.appendChild(modal);

    btn.addEventListener('click', async () => {
      modal.classList.remove('hidden');
      const st = document.getElementById('afScanStatus');
      const out = document.getElementById('afScanOutput');
      out.value = 'Scanning...';
      try {
        out.value = await runFullScan(m => { st.textContent = m; });
        st.textContent = 'Audit complete.';
      } catch (e) {
        st.textContent = 'Failed.';
        out.value = e.message;
      }
    });
    document.getElementById('afCloseScanBtn').addEventListener('click', () => modal.classList.add('hidden'));
    document.getElementById('afCopyScanBtn').addEventListener('click', async () => {
      await navigator.clipboard.writeText(document.getElementById('afScanOutput').value);
      document.getElementById('afCopyScanBtn').textContent = 'Copied!';
      setTimeout(() => { document.getElementById('afCopyScanBtn').textContent = 'Copy Report'; }, 1600);
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mountUI);
  else mountUI();
})();