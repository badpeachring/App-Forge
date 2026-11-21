(() => {
  if (window.__afContextPackerLoaded) return;
  window.__afContextPackerLoaded = true;

  const $ = id => document.getElementById(id);
  const getToken = () => localStorage.getItem('app_forge_gh_token_v1') || $('ghToken')?.value.trim() || '';
  const getRepo = () => $('repoSelect')?.value || '';
  const getHeaders = () => ({
    Authorization: `Bearer ${getToken()}`,
    Accept: 'application/vnd.github+json',
    'Content-Type': 'application/json'
  });

  function decodeB64(b64) {
    const raw = atob((b64 || '').replace(/\n/g, ''));
    const bytes = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
    return new TextDecoder().decode(bytes);
  }

  function encodeB64(str) {
    const bytes = new TextEncoder().encode(str);
    let bin = '';
    for (let i = 0; i < bytes.length; i += 8192) bin += String.fromCharCode(...bytes.subarray(i, i + 8192));
    return btoa(bin);
  }

  async function getOwner() {
    const r = await fetch('https://api.github.com/user', { headers: getHeaders() });
    if (!r.ok) throw new Error('Connect GitHub token first.');
    return (await r.json()).login;
  }

  function extractSkeleton(path, content) {
    const lines = [];
    if (/\.html?$/i.test(path)) {
      const ids = [...content.matchAll(/\bid=["']([^"']+)["']/gi)].map(m => '#' + m[1]);
      const scripts = [...content.matchAll(/<script[^>]+src=["']([^"']+)["']/gi)].map(m => m[1]);
      lines.push(`  HTML IDs (${ids.length}): ${[...new Set(ids)].join(', ')}`);
      if (scripts.length) lines.push(`  Scripts: ${scripts.join(', ')}`);
    } else if (/\.m?js$/i.test(path)) {
      const fns = [...content.matchAll(/(?:async\s+)?function\s+([a-zA-Z0-9_$]+)\s*\([^)]*\)/g)].map(m => m[0]);
      const win = [...content.matchAll(/window\.([a-zA-Z0-9_$]+)\s*=/g)].map(m => 'window.' + m[1]);
      const ls = [...content.matchAll(/localStorage\.(?:getItem|setItem)\(\s*["']([^"']+)["']/g)].map(m => m[1]);
      const fs = [...content.matchAll(/\.collection\(\s*["']([^"']+)["']\s*\)/g)].map(m => m[1]);
      if (fns.length) lines.push(`  Functions: ${[...new Set(fns)].join(' | ')}`);
      if (win.length) lines.push(`  Globals: ${[...new Set(win)].join(', ')}`);
      if (ls.length) lines.push(`  localStorage: ${[...new Set(ls)].join(', ')}`);
      if (fs.length) lines.push(`  Firestore: ${[...new Set(fs)].join(', ')}`);
    } else if (/\.json$/i.test(path)) {
      try {
        const obj = JSON.parse(content);
        lines.push(`  JSON Keys: ${Object.keys(obj).join(', ')}`);
      } catch { lines.push('  [Invalid JSON]'); }
    }
    return lines.length ? `=== ${path} ===\n${lines.join('\n')}` : `=== ${path} === (no symbols)`;
  }

  function minifyText(content) {
    return content
      .split('\n')
      .map(l => l.trimEnd())
      .filter(l => l.trim() !== '' && !l.trim().startsWith('//'))
      .join('\n');
  }

  async function buildPack(mode, statusCb) {
    const repo = getRepo();
    if (!repo || !getToken()) throw new Error('Connect GitHub token and select a repo first.');
    const owner = await getOwner();
    const headers = getHeaders();

    if (mode === 'delta') {
      statusCb('Fetching last 5 commits...');
      const cRes = await fetch(`https://api.github.com/repos/${owner}/${repo}/commits?per_page=6`, { headers, cache: 'no-store' });
      if (!cRes.ok) throw new Error('Could not fetch commits.');
      const commits = await cRes.json();
      if (commits.length < 2) return `GIT DELTA: ${owner}/${repo}\nNot enough commits to compare.`;
      const base = commits[commits.length - 1].sha;
      const head = commits[0].sha;
      statusCb(`Comparing ${base.slice(0, 7)}...${head.slice(0, 7)}...`);
      const cmpRes = await fetch(`https://api.github.com/repos/${owner}/${repo}/compare/${base}...${head}`, { headers, cache: 'no-store' });
      const cmp = await cmpRes.json();
      const out = [`GIT DELTA: ${owner}/${repo} (${commits.length - 1} recent commits)`, '----------------------------------------'];
      (cmp.files || []).forEach(f => {
        out.push(`\n=== ${f.filename} (${f.status}, +${f.additions}/-${f.deletions}) ===`);
        out.push(f.patch || '(binary or too large)');
      });
      return out.join('\n');
    }

    statusCb(`Reading file tree for ${repo}...`);
    const tRes = await fetch(`https://api.github.com/repos/${owner}/${repo}/git/trees/HEAD?recursive=1`, { headers, cache: 'no-store' });
    if (!tRes.ok) throw new Error('Could not read repo tree.');
    const blobs = ((await tRes.json()).tree || []).filter(i => i.type === 'blob');
    const codeFiles = blobs.filter(b => /\.(html?|js|mjs|json|css|md)$/i.test(b.path) && (b.size || 0) < 65000);

    const out = [
      `REPO CONTEXT (${mode.toUpperCase()}): ${owner}/${repo}`,
      `Total Files: ${blobs.length} | Packed Code Files: ${codeFiles.length}`,
      `All Files: ${blobs.map(b => b.path).join(', ')}`,
      '----------------------------------------'
    ];

    for (let i = 0; i < codeFiles.length; i++) {
      const f = codeFiles[i];
      statusCb(`Packing (${i + 1}/${codeFiles.length}): ${f.path}`);
      const r = await fetch(`https://api.github.com/repos/${owner}/${repo}/contents/${f.path}`, { headers, cache: 'no-store' });
      if (!r.ok) continue;
      const d = await r.json();
      if (!d.content) continue;
      const text = decodeB64(d.content);
      if (mode === 'skeleton') {
        out.push(extractSkeleton(f.path, text));
      } else {
        out.push(`\n=== FILE: ${f.path} ===\n${minifyText(text)}`);
      }
    }
    return out.join('\n');
  }

  function openPackerModal() {
    const repo = getRepo();
    if (!repo) return alert('Select a repo first.');
    let m = $('afPackerModal');
    if (!m) {
      m = document.createElement('div');
      m.id = 'afPackerModal';
      m.className = 'fixed inset-0 z-50 bg-black/90 backdrop-blur-md flex items-center justify-center p-3';
      document.body.appendChild(m);
    }
    m.classList.remove('hidden');
    m.innerHTML = `<div class='w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-2xl bg-[#120b1c] border border-cyan-500/45 p-4 space-y-3 shadow-2xl'>
      <div class='flex items-center justify-between gap-2'>
        <span class='text-xs font-black uppercase tracking-wider text-cyan-300'>📦 Repo Context Packer • ${repo}</span>
        <button id='afPackClose' type='button' class='px-2.5 py-1 rounded-lg bg-slate-800 text-slate-200 font-bold text-[11px]'>Close</button>
      </div>
      <div class='af-ux-guide p-2.5 rounded-xl bg-cyan-950/50 border border-cyan-500/30 text-[11px] text-cyan-100 leading-relaxed'>
        <strong class='text-cyan-300'>How to use:</strong> Pick a mode below to compress <b>${repo}</b> for AI debugging. Use <b>Skeleton</b> for a tiny architecture map, <b>Full Bundle</b> for all code, or <b>Git Delta</b> for recent changes. Tap <b>Download .txt</b> to attach the file directly to chat without clipboard lag.
      </div>
      <div class='grid grid-cols-3 gap-1.5'>
        <button id='pkSkelBtn' type='button' class='py-2 rounded-xl bg-cyan-900/60 border border-cyan-400/45 text-cyan-100 font-bold text-[11px]'>🦴 Skeleton</button>
        <button id='pkFullBtn' type='button' class='py-2 rounded-xl bg-indigo-900/60 border border-indigo-400/45 text-indigo-100 font-bold text-[11px]'>📚 Full Bundle</button>
        <button id='pkDeltaBtn' type='button' class='py-2 rounded-xl bg-amber-900/60 border border-amber-400/45 text-amber-100 font-bold text-[11px]'>🔀 Git Delta</button>
      </div>
      <div id='pkStatus' class='text-[11px] font-mono text-emerald-300'>Select a packing mode above...</div>
      <textarea id='pkOut' readonly rows='12' class='w-full bg-[#07040b] border border-cyan-500/25 rounded-xl p-2.5 text-[10px] text-slate-100 font-mono leading-relaxed outline-none'></textarea>
      <div class='grid grid-cols-3 gap-1.5'>
        <button id='pkCopyBtn' type='button' class='py-2 rounded-xl bg-amber-400 text-slate-950 font-black text-[11px]'>📋 Copy</button>
        <button id='pkDlBtn' type='button' class='py-2 rounded-xl bg-emerald-400 text-slate-950 font-black text-[11px]'>⬇️ .txt File</button>
        <button id='pkCommitBtn' type='button' class='py-2 rounded-xl bg-fuchsia-500 text-slate-950 font-black text-[11px]'>💾 CONTEXT.md</button>
      </div>
    </div>`;

    $('afPackClose').onclick = () => m.classList.add('hidden');
    const run = async (mode) => {
      $('pkOut').value = '';
      try {
        const txt = await buildPack(mode, s => { $('pkStatus').textContent = s; });
        $('pkOut').value = txt;
        $('pkStatus').textContent = `Done (${(txt.length / 1024).toFixed(1)} KB).`;
      } catch (e) { $('pkStatus').textContent = 'Error: ' + e.message; }
    };
    $('pkSkelBtn').onclick = () => run('skeleton');
    $('pkFullBtn').onclick = () => run('full');
    $('pkDeltaBtn').onclick = () => run('delta');

    $('pkCopyBtn').onclick = async () => {
      if (!$('pkOut').value) return;
      await navigator.clipboard.writeText($('pkOut').value);
      $('pkCopyBtn').textContent = 'Copied!';
      setTimeout(() => { $('pkCopyBtn').textContent = '📋 Copy'; }, 1500);
    };
    $('pkDlBtn').onclick = () => {
      const txt = $('pkOut').value;
      if (!txt) return alert('Pack a mode first.');
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([txt], { type: 'text/plain' }));
      a.download = `${repo}-context.txt`;
      a.click();
    };
    $('pkCommitBtn').onclick = async () => {
      const txt = $('pkOut').value;
      if (!txt) return alert('Generate a Skeleton or Bundle first.');
      try {
        $('pkStatus').textContent = 'Committing CONTEXT.md...';
        const owner = await getOwner();
        const headers = getHeaders();
        let sha = null;
        const chk = await fetch(`https://api.github.com/repos/${owner}/${repo}/contents/CONTEXT.md`, { headers, cache: 'no-store' });
        if (chk.ok) sha = (await chk.json()).sha;
        const body = { message: 'Update CONTEXT.md via App Forge', content: encodeB64(txt) };
        if (sha) body.sha = sha;
        const put = await fetch(`https://api.github.com/repos/${owner}/${repo}/contents/CONTEXT.md`, { method: 'PUT', headers, body: JSON.stringify(body) });
        if (!put.ok) throw new Error('Commit failed (HTTP ' + put.status + ')');
        $('pkStatus').textContent = `✅ Saved CONTEXT.md to ${repo}!`;
      } catch (e) { $('pkStatus').textContent = '❌ ' + e.message; }
    };
  }

  function mountPackerBtn() {
    const grid = document.querySelector('#afGodModeBar .grid');
    if (!grid || $('afPackContextBtn')) return;
    const btn = document.createElement('button');
    btn.id = 'afPackContextBtn';
    btn.type = 'button';
    btn.className = 'col-span-2 py-2 rounded-xl bg-cyan-950/85 border border-cyan-400/50 text-cyan-200 font-bold text-xs';
    btn.textContent = '📦 Pack Context for AI';
    btn.onclick = openPackerModal;
    grid.appendChild(btn);
  }

  setInterval(mountPackerBtn, 800);
})();