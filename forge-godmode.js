(() => {
  if (window.__afGodModeLoaded) return;
  window.__afGodModeLoaded = true;

  const $ = id => document.getElementById(id);
  const getToken = () => localStorage.getItem('app_forge_gh_token_v1') || $('ghToken')?.value.trim() || '';
  const getRepo = () => $('repoSelect')?.value || '';
  const getHeaders = () => ({
    Authorization: `Bearer ${getToken()}`,
    Accept: 'application/vnd.github+json',
    'Content-Type': 'application/json'
  });

  let cachedOwner = '';
  async function getOwner() {
    if (cachedOwner) return cachedOwner;
    const r = await fetch('https://api.github.com/user', { headers: getHeaders() });
    if (!r.ok) throw new Error('Connect GitHub token first.');
    cachedOwner = (await r.json()).login;
    return cachedOwner;
  }

  function toB64(str) {
    const bytes = new TextEncoder().encode(str);
    let bin = '';
    for (let i = 0; i < bytes.length; i += 8192) bin += String.fromCharCode(...bytes.subarray(i, i + 8192));
    return btoa(bin);
  }

  function openModal(title, bodyHtml) {
    let m = $('afGodModal');
    if (!m) {
      m = document.createElement('div');
      m.id = 'afGodModal';
      m.className = 'fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-4';
      document.body.appendChild(m);
    }
    m.classList.remove('hidden');
    m.innerHTML = `<div class='w-full max-w-lg max-h-[85vh] overflow-y-auto rounded-2xl bg-[#120b1c] border border-fuchsia-500/45 p-4 space-y-3 shadow-2xl'>
      <div class='flex items-center justify-between gap-2'>
        <span class='text-xs font-black uppercase tracking-wider text-fuchsia-300'>${title}</span>
        <button id='afGodClose' type='button' class='px-2.5 py-1 rounded-lg bg-slate-800 text-slate-200 font-bold text-[11px]'>Close</button>
      </div>
      <div id='afGodBody' class='space-y-2.5 text-xs text-slate-200'>${bodyHtml}</div>
    </div>`;
    $('afGodClose').onclick = () => m.classList.add('hidden');
  }

  // 1. LIVE PAGES BUILD RADAR
  let radarTimer = null;
  async function pollPagesRadar() {
    const pill = $('afRadarPill');
    const repo = getRepo();
    if (!pill || !repo || !getToken()) return;
    try {
      const owner = await getOwner();
      const r = await fetch(`https://api.github.com/repos/${owner}/${repo}/pages/builds/latest`, { headers: getHeaders(), cache: 'no-store' });
      if (!r.ok) { pill.textContent = '📡 No Pages'; return; }
      const d = await r.json();
      if (d.status === 'built') { pill.textContent = '🟢 Pages Live'; pill.className = 'px-2.5 py-1 rounded-lg bg-emerald-500/20 border border-emerald-400/40 text-emerald-200 font-bold text-[11px] shrink-0'; }
      else if (d.status === 'building' || d.status === 'queued') { pill.textContent = '🟡 Building...'; pill.className = 'px-2.5 py-1 rounded-lg bg-amber-500/20 border border-amber-400/40 text-amber-200 font-bold text-[11px] shrink-0 animate-pulse'; }
      else { pill.textContent = `🔴 ${d.status || 'Error'}`; pill.className = 'px-2.5 py-1 rounded-lg bg-rose-500/20 border border-rose-400/40 text-rose-200 font-bold text-[11px] shrink-0'; }
    } catch { pill.textContent = '📡 Radar Idle'; }
  }

  // 2. TIME MACHINE (1-TAP ROLLBACK)
  async function openTimeMachine() {
    const repo = getRepo();
    if (!repo) return alert('Select a repo first.');
    openModal(`⏪ Time Machine • ${repo}`, '<div class="text-amber-300 font-mono">Loading recent commits...</div>');
    try {
      const owner = await getOwner();
      const r = await fetch(`https://api.github.com/repos/${owner}/${repo}/commits?per_page=8`, { headers: getHeaders(), cache: 'no-store' });
      const commits = await r.json();
      if (!Array.isArray(commits) || !commits.length) throw new Error('No commits found.');
      $('afGodBody').innerHTML = commits.map((c, idx) => `
        <div class='p-2.5 rounded-xl bg-black/60 border border-fuchsia-500/25 flex items-center justify-between gap-2'>
          <div class='min-w-0'>
            <div class='font-bold text-amber-100 truncate'>${(c.commit.message || '').split('\n')[0]}</div>
            <div class='text-[10px] text-slate-400 font-mono'>${c.sha.slice(0, 7)} • ${new Date(c.commit.author.date).toLocaleString()}</div>
          </div>
          ${idx === 0 ? '<span class="px-2 py-1 rounded-lg bg-emerald-500/20 text-emerald-300 text-[10px] font-black shrink-0">LIVE</span>' : `<button type='button' data-rb='${c.sha}' class='px-2.5 py-1 rounded-lg bg-rose-600 text-white font-black text-[10px] shrink-0'>Rollback</button>`}
        </div>`).join('');
      $('afGodBody').querySelectorAll('[data-rb]').forEach(btn => {
        btn.onclick = async () => {
          const sha = btn.getAttribute('data-rb');
          if (!confirm(`Roll back ${repo} to commit ${sha.slice(0, 7)}?`)) return;
          btn.textContent = 'Rolling...';
          const refRes = await fetch(`https://api.github.com/repos/${owner}/${repo}/git/refs/heads/main`, {
            method: 'PATCH', headers: getHeaders(), body: JSON.stringify({ sha, force: true })
          });
          if (!refRes.ok) return alert('Rollback failed (HTTP ' + refRes.status + ')');
          alert(`Rolled back ${repo} to ${sha.slice(0, 7)}! Pages will rebuild shortly.`);
          pollPagesRadar();
          openTimeMachine();
        };
      });
    } catch (e) { $('afGodBody').innerHTML = `<div class='text-rose-400'>${e.message}</div>`; }
  }

  // 3. INSTANT APP SCAFFOLDER
  function openScaffolder() {
    openModal('🏗️ Instant App Scaffolder', `
      <input id='scafName' type='text' placeholder='New repo name (e.g. Duplex-Tracker)' class='w-full bg-black/70 border border-fuchsia-500/35 rounded-xl px-3 py-2 text-xs text-white outline-none'>
      <input id='scafTitle' type='text' placeholder='App Display Title' class='w-full bg-black/70 border border-fuchsia-500/35 rounded-xl px-3 py-2 text-xs text-white outline-none'>
      <button id='scafRunBtn' type='button' class='w-full py-2.5 rounded-xl bg-gradient-to-r from-fuchsia-500 to-sky-500 text-slate-950 font-black text-xs'>🚀 Create Repo + Enable Pages</button>
      <div id='scafLog' class='font-mono text-[10px] text-emerald-300 whitespace-pre-wrap'></div>`);
    $('scafRunBtn').onclick = async () => {
      const name = $('scafName').value.trim().replace(/\s+/g, '-');
      const title = $('scafTitle').value.trim() || name;
      const log = m => { $('scafLog').textContent += m + '\n'; };
      if (!name) return alert('Enter a repo name.');
      try {
        const owner = await getOwner();
        log(`1/4 Creating repo ${owner}/${name}...`);
        const cr = await fetch('https://api.github.com/user/repos', {
          method: 'POST', headers: getHeaders(), body: JSON.stringify({ name, description: `${title} — forged with App Forge`, auto_init: true, private: false })
        });
        if (!cr.ok) throw new Error('Repo creation failed: ' + (await cr.json()).message);
        log('2/4 Pushing starter PWA index.html...');
        const html = `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><title>${title}</title><script src="https://cdn.tailwindcss.com"></script></head><body class="bg-slate-950 text-white min-h-screen flex items-center justify-center p-6"><div class="max-w-md w-full bg-slate-900 border border-sky-500/30 rounded-2xl p-6 text-center space-y-2"><h1 class="text-2xl font-black text-sky-400">${title}</h1><p class="text-xs text-slate-400">Forged with App Forge God-Mode</p></div></body></html>`;
        await fetch(`https://api.github.com/repos/${owner}/${name}/contents/index.html`, {
          method: 'PUT', headers: getHeaders(), body: JSON.stringify({ message: 'Initial PWA shell', content: toB64(html) })
        });
        log('3/4 Enabling GitHub Pages...');
        await fetch(`https://api.github.com/repos/${owner}/${name}/pages`, {
          method: 'POST', headers: getHeaders(), body: JSON.stringify({ source: { branch: 'main', path: '/' } })
        });
        log(`4/4 DONE! Live soon at: https://${owner.toLowerCase()}.github.io/${name}/`);
      } catch (e) { log('ERROR: ' + e.message); }
    };
  }

  // 4. BINARY ASSET UPLOADER
  function openAssetUploader() {
    const repo = getRepo();
    if (!repo) return alert('Select a repo first.');
    openModal(`📤 Upload Binary Asset • ${repo}`, `
      <input id='upFile' type='file' accept='image/*,video/*,.svg,.ico' class='w-full text-xs text-slate-300'>
      <input id='upPath' type='text' placeholder='Target path (e.g. celebrate_v2.mp4)' class='w-full bg-black/70 border border-fuchsia-500/35 rounded-xl px-3 py-2 text-xs text-white outline-none'>
      <button id='upRunBtn' type='button' class='w-full py-2.5 rounded-xl bg-gradient-to-r from-emerald-400 to-sky-400 text-slate-950 font-black text-xs'>⬆️ Push Binary File to GitHub</button>
      <div id='upLog' class='font-mono text-[10px] text-amber-300'></div>`);
    $('upFile').onchange = () => {
      const f = $('upFile').files?.[0];
      if (f && !$('upPath').value.trim()) $('upPath').value = f.name;
    };
    $('upRunBtn').onclick = async () => {
      const f = $('upFile').files?.[0];
      const path = $('upPath').value.trim();
      if (!f || !path) return alert('Pick a file and target path.');
      $('upLog').textContent = `Encoding ${f.name} (${Math.round(f.size / 1024)} KB)...`;
      try {
        const owner = await getOwner();
        const b64 = await new Promise((res, rej) => {
          const rd = new FileReader();
          rd.onload = () => res(String(rd.result).split(',')[1]);
          rd.onerror = rej;
          rd.readAsDataURL(f);
        });
        let sha = null;
        const chk = await fetch(`https://api.github.com/repos/${owner}/${repo}/contents/${path}`, { headers: getHeaders(), cache: 'no-store' });
        if (chk.ok) sha = (await chk.json()).sha;
        $('upLog').textContent = `Uploading ${path} to ${repo}...`;
        const body = { message: `Upload asset ${path}`, content: b64 };
        if (sha) body.sha = sha;
        const put = await fetch(`https://api.github.com/repos/${owner}/${repo}/contents/${path}`, {
          method: 'PUT', headers: getHeaders(), body: JSON.stringify(body)
        });
        if (!put.ok) throw new Error((await put.json()).message || put.status);
        $('upLog').textContent = `✅ Uploaded ${path} to ${repo}!`;
        pollPagesRadar();
      } catch (e) { $('upLog').textContent = '❌ ' + e.message; }
    };
  }

  // 5. LIVE SANDBOX PREVIEW
  function openSandbox() {
    const code = $('codeEditor')?.value || '';
    if (!code.trim()) return alert('Code editor is empty.');
    openModal('👁️ Live Sandbox Preview (Unsaved)', `<iframe id='afSandboxFrame' sandbox='allow-scripts allow-modals allow-forms' class='w-full h-[65vh] rounded-xl bg-white border border-fuchsia-500/30'></iframe>`);
    $('afSandboxFrame').srcdoc = code;
  }

  function mountGodModeBar() {
    if ($('afGodModeBar')) return;
    const anchor = $('createFileModeBtn')?.closest('.glass-card');
    if (!anchor) return;
    const bar = document.createElement('div');
    bar.id = 'afGodModeBar';
    bar.className = 'glass-card rounded-2xl p-3 space-y-2';
    bar.innerHTML = `
      <div class='flex items-center justify-between'>
        <span class='text-[10px] font-black uppercase tracking-wider text-fuchsia-300'>⚡ God-Mode IDE Suite</span>
        <button id='afRadarPill' type='button' class='px-2.5 py-1 rounded-lg bg-slate-800 border border-slate-600/50 text-slate-300 font-bold text-[11px]'>📡 Check Radar</button>
      </div>
      <div class='grid grid-cols-2 gap-1.5'>
        <button id='afTimeBtn' type='button' class='py-2 rounded-xl bg-rose-950/80 border border-rose-500/40 text-rose-200 font-bold text-xs'>⏪ Time Machine</button>
        <button id='afScafBtn' type='button' class='py-2 rounded-xl bg-fuchsia-950/80 border border-fuchsia-500/40 text-fuchsia-200 font-bold text-xs'>🏗️ New App</button>
        <button id='afUploadBtn' type='button' class='py-2 rounded-xl bg-emerald-950/80 border border-emerald-500/40 text-emerald-200 font-bold text-xs'>📤 Upload Asset</button>
        <button id='afSandboxBtn' type='button' class='py-2 rounded-xl bg-sky-950/80 border border-sky-500/40 text-sky-200 font-bold text-xs'>👁️ Sandbox</button>
      </div>`;
    anchor.insertAdjacentElement('afterend', bar);

    $('afRadarPill').onclick = pollPagesRadar;
    $('afTimeBtn').onclick = openTimeMachine;
    $('afScafBtn').onclick = openScaffolder;
    $('afUploadBtn').onclick = openAssetUploader;
    $('afSandboxBtn').onclick = openSandbox;
    $('repoSelect')?.addEventListener('change', () => setTimeout(pollPagesRadar, 500));
    setTimeout(pollPagesRadar, 2000);
    radarTimer = setInterval(pollPagesRadar, 25000);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mountGodModeBar);
  else mountGodModeBar();
})();