(() => {
  if (window.__afLaunchBoostLoaded) return;
  window.__afLaunchBoostLoaded = true;

  const $ = id => document.getElementById(id);
  const getToken = () => localStorage.getItem('app_forge_gh_token_v1') || $('ghToken')?.value.trim() || '';
  const getRepo = () => $('repoSelect')?.value || '';
  const getHeaders = () => ({
    Authorization: `Bearer ${getToken()}`,
    Accept: 'application/vnd.github+json',
    'Content-Type': 'application/json'
  });

  function encodeB64(str) {
    const bytes = new TextEncoder().encode(str);
    let bin = '';
    for (let i = 0; i < bytes.length; i += 8192) bin += String.fromCharCode(...bytes.subarray(i, i + 8192));
    return btoa(bin);
  }

  async function getOwner() {
    const r = await fetch('https://api.github.com/user', { headers: getHeaders(), cache: 'no-store' });
    if (!r.ok) throw new Error('Connect GitHub token first.');
    return (await r.json()).login;
  }

  let pollTimer = null;
  async function startPagesPoll(targetRepo) {
    const repo = targetRepo || getRepo();
    if (!repo || !getToken()) return;
    if (pollTimer) clearInterval(pollTimer);
    let tries = 0;
    const badge = $('afPollBadge');
    if (badge) { badge.textContent = `⏳ Building ${repo}...`; badge.classList.remove('hidden'); }

    const check = async () => {
      tries++;
      if (tries > 14) { clearInterval(pollTimer); if (badge) badge.textContent = '⚠️ Poll timeout — tap Refresh'; return; }
      try {
        const owner = await getOwner();
        const r = await fetch(`https://api.github.com/repos/${owner}/${repo}/pages`, { headers: getHeaders(), cache: 'no-store' });
        if (!r.ok) return;
        const pg = await r.json();
        if (badge) badge.textContent = `📡 ${repo}: ${pg.status || 'queued'} (${tries * 10}s)`;
        if (pg.status === 'built') {
          clearInterval(pollTimer);
          if (badge) badge.textContent = `🟢 ${repo} LIVE!`;
          const openBtn = $('afLaunchLiveBtn');
          if (openBtn) {
            openBtn.classList.add('ring-2', 'ring-emerald-300', 'animate-pulse');
            setTimeout(() => openBtn.classList.remove('animate-pulse'), 8000);
          }
        }
      } catch {}
    };
    pollTimer = setInterval(check, 10000);
    setTimeout(check, 4000);
  }
  window.afStartPagesPoll = startPagesPoll;

  function enhancePatchModal() {
    const modal = $('afPatchModal');
    if (!modal || modal.classList.contains('hidden')) return;
    const ta = modal.querySelector('textarea');
    if (!ta || modal.querySelector('#afJsonFileWrap')) return;

    const wrap = document.createElement('div');
    wrap.id = 'afJsonFileWrap';
    wrap.className = 'flex items-center justify-between gap-2';
    wrap.innerHTML = `<label class='px-3 py-1.5 rounded-lg bg-indigo-600/30 border border-indigo-400/50 text-indigo-200 text-[11px] font-bold cursor-pointer'>📂 Load .json File<input id='afJsonFileIn' type='file' accept='.json,application/json,.txt' class='hidden'></label><span id='afCharCount' class='text-[10px] font-mono text-slate-400'>0 chars</span>`;
    ta.insertAdjacentElement('beforebegin', wrap);

    const upd = () => {
      const n = ta.value.length;
      const c = $('afCharCount');
      if (c) { c.textContent = `${n.toLocaleString()} chars`; c.className = n >= 19500 ? 'text-[10px] font-mono text-amber-300 font-bold' : 'text-[10px] font-mono text-slate-400'; }
    };
    ta.addEventListener('input', upd);
    upd();

    $('afJsonFileIn').onchange = async e => {
      const f = e.target.files?.[0];
      if (!f) return;
      ta.value = await f.text();
      ta.dispatchEvent(new Event('input', { bubbles: true }));
      e.target.value = '';
    };

    modal.querySelectorAll('button').forEach(b => {
      if (/Execute Patch/i.test(b.textContent) && !b.dataset.pollHook) {
        b.dataset.pollHook = '1';
        b.addEventListener('click', () => setTimeout(() => startPagesPoll(getRepo()), 3000));
      }
    });
  }

  async function openFastLaunch() {
    if (!getToken()) return alert('Connect your GitHub token first.');
    const rawName = prompt('New Repo Name (no spaces, e.g. Job-Tracker):');
    if (!rawName) return;
    const repo = rawName.trim().replace(/[^a-zA-Z0-9._-]/g, '-');
    const title = prompt('App Display Title:', repo.replace(/-/g, ' ')) || repo;
    const headers = getHeaders();
    try {
      const owner = await getOwner();
      const cr = await fetch('https://api.github.com/user/repos', {
        method: 'POST', headers,
        body: JSON.stringify({ name: repo, description: `${title} — forged with App Forge`, private: false, auto_init: true })
      });
      if (!cr.ok) throw new Error('Repo create failed (HTTP ' + cr.status + ')');
      await new Promise(r => setTimeout(r, 1500));

      const manifest = JSON.stringify({
        name: title, short_name: title, start_url: `/${repo}/`, scope: `/${repo}/`,
        display: 'standalone', background_color: '#09090b', theme_color: '#18181b',
        icons: [
          { src: `/${repo}/icon.png`, sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: `/${repo}/icon.png`, sizes: '512x512', type: 'image/png', purpose: 'maskable' }
        ]
      }, null, 2);

      const html = `<!DOCTYPE html>\n<html lang="en">\n<head>\n  <meta charset="UTF-8">\n  <meta name="viewport" content="width=device-width,initial-scale=1">\n  <title>${title}</title>\n  <link rel="manifest" href="manifest.json?v=1">\n  <script src="https://cdn.tailwindcss.com"></script>\n</head>\n<body class="bg-zinc-950 text-white min-h-screen flex items-center justify-center p-6">\n  <div class="text-center space-y-2">\n    <h1 class="text-2xl font-black">${title}</h1>\n    <p class="text-xs text-zinc-400">Ready for Patch 1 via App Forge</p>\n  </div>\n</body>\n</html>`;

      for (const [file, content] of [['manifest.json', manifest], ['index.html', html]]) {
        await fetch(`https://api.github.com/repos/${owner}/${repo}/contents/${file}`, {
          method: 'PUT', headers,
          body: JSON.stringify({ message: `Init ${file} via Fast-Launch`, content: encodeB64(content) })
        });
      }

      await fetch(`https://api.github.com/repos/${owner}/${repo}/pages`, {
        method: 'POST', headers,
        body: JSON.stringify({ source: { branch: 'main', path: '/' } })
      });

      alert(`✅ ${repo} created & Pages enabled! Polling live build...`);
      startPagesPoll(repo);
    } catch (e) {
      alert('Fast-Launch Error: ' + e.message);
    }
  }

  function mountControls() {
    const bar = $('afGodModeBar');
    const grid = bar?.querySelector('.grid');
    if (!grid) return;
    if (!$('afPollBadge')) {
      const b = document.createElement('div');
      b.id = 'afPollBadge';
      b.className = 'hidden col-span-2 text-center py-1 px-2 rounded-lg bg-black/60 border border-emerald-500/35 text-[11px] font-mono text-emerald-300';
      grid.prepend(b);
    }
    if (!$('afFastLaunchBtn')) {
      const btn = document.createElement('button');
      btn.id = 'afFastLaunchBtn';
      btn.type = 'button';
      btn.className = 'col-span-2 flex flex-col items-center justify-center px-2 py-2 leading-tight text-center rounded-xl bg-fuchsia-950/85 border border-fuchsia-400/50 text-fuchsia-200';
      btn.innerHTML = `<span class='font-black text-xs'>⚡ Fast-Launch New App</span><span class='text-[10px] font-normal opacity-75 mt-0.5'>Public repo + maskable PWA + auto-Pages</span>`;
      btn.onclick = openFastLaunch;
      grid.appendChild(btn);
    }
  }

  const obs = new MutationObserver(() => { mountControls(); enhancePatchModal(); });
  obs.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });
  setInterval(mountControls, 1000);
})();