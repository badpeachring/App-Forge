(() => {
  if (window.__afPagesMgrLoaded) return;
  window.__afPagesMgrLoaded = true;

  const $ = id => document.getElementById(id);
  const getToken = () => localStorage.getItem('app_forge_gh_token_v1') || $('ghToken')?.value.trim() || '';
  const getRepo = () => $('repoSelect')?.value || '';
  const getHeaders = () => ({
    Authorization: `Bearer ${getToken()}`,
    Accept: 'application/vnd.github+json',
    'Content-Type': 'application/json'
  });

  async function runPagesFix() {
    const repo = getRepo();
    if (!repo || !getToken()) return alert('Connect GitHub token and select a repo in Section 2 first.');

    let m = $('afPagesModal');
    if (!m) {
      m = document.createElement('div');
      m.id = 'afPagesModal';
      m.className = 'fixed inset-0 z-50 bg-black/90 backdrop-blur-md flex items-center justify-center p-3';
      document.body.appendChild(m);
    }
    m.classList.remove('hidden');
    m.innerHTML = `<div class='w-full max-w-md rounded-2xl bg-[#120b1c] border border-emerald-500/45 p-4 space-y-3 shadow-2xl'>
      <div class='flex items-center justify-between'>
        <span class='text-xs font-black uppercase tracking-wider text-emerald-300'>🌐 Pages Manager • ${repo}</span>
        <button id='afPmClose' type='button' class='px-2.5 py-1 rounded-lg bg-slate-800 text-slate-200 font-bold text-[11px]'>Close</button>
      </div>
      <div id='afPmLog' class='p-3 rounded-xl bg-[#07040b] border border-emerald-500/25 text-[11px] font-mono text-slate-200 space-y-1 max-h-60 overflow-y-auto'></div>
      <div id='afPmActions' class='flex gap-2'></div>
    </div>`;
    $('afPmClose').onclick = () => m.classList.add('hidden');

    const log = (msg, cls = 'text-slate-200') => {
      const d = document.createElement('div');
      d.className = cls;
      d.textContent = msg;
      $('afPmLog').appendChild(d);
    };

    try {
      const headers = getHeaders();
      log('1. Checking GitHub account...');
      const uRes = await fetch('https://api.github.com/user', { headers, cache: 'no-store' });
      if (!uRes.ok) throw new Error('Invalid GitHub token.');
      const owner = (await uRes.json()).login;

      log(`2. Inspecting ${owner}/${repo}...`);
      const rRes = await fetch(`https://api.github.com/repos/${owner}/${repo}`, { headers, cache: 'no-store' });
      if (!rRes.ok) throw new Error('Repo not found (HTTP ' + rRes.status + ')');
      const rData = await rRes.json();
      const branch = rData.default_branch || 'main';

      if (rData.private) {
        log('Repo is Private. Switching to Public for free Pages...', 'text-amber-300');
        const pRes = await fetch(`https://api.github.com/repos/${owner}/${repo}`, {
          method: 'PATCH', headers, body: JSON.stringify({ private: false })
        });
        if (!pRes.ok) throw new Error('Could not set Public (token needs repo scope).');
        log('Repo is now Public.', 'text-emerald-300');
      } else {
        log('Visibility: Public (OK)', 'text-emerald-300');
      }

      log('3. Checking GitHub Pages status...');
      let pgRes = await fetch(`https://api.github.com/repos/${owner}/${repo}/pages`, { headers, cache: 'no-store' });
      if (pgRes.status === 404) {
        log(`Pages disabled. Enabling on branch "${branch}" (root)...`, 'text-amber-300');
        pgRes = await fetch(`https://api.github.com/repos/${owner}/${repo}/pages`, {
          method: 'POST', headers, body: JSON.stringify({ source: { branch, path: '/' } })
        });
        if (!pgRes.ok) {
          const err = await pgRes.json().catch(() => ({}));
          throw new Error(err.message || 'Enable Pages failed (HTTP ' + pgRes.status + ')');
        }
        log('GitHub Pages enabled! First build takes ~45-60s.', 'text-emerald-300');
      }

      const pg = await pgRes.json();
      const liveUrl = pg.html_url || `https://${owner}.github.io/${repo}/`;
      log(`Status: ${pg.status || 'queued'}`, 'text-cyan-300');
      log(`Live URL: ${liveUrl}`, 'text-emerald-300');

      $('afPmActions').innerHTML = `<button id='afPmOpen' type='button' class='flex-1 py-2 rounded-xl bg-emerald-400 text-slate-950 font-black text-xs'>🚀 Open Live App</button><button id='afPmRecheck' type='button' class='px-3 py-2 rounded-xl bg-slate-800 text-slate-200 font-bold text-xs'>↻ Refresh</button>`;
      $('afPmOpen').onclick = () => window.open(liveUrl, '_blank');
      $('afPmRecheck').onclick = runPagesFix;
    } catch (e) {
      log('ERROR: ' + e.message, 'text-rose-400');
    }
  }

  function mountBtn() {
    const grid = document.querySelector('#afGodModeBar .grid');
    if (!grid || $('afPagesMgrBtn')) return;
    const btn = document.createElement('button');
    btn.id = 'afPagesMgrBtn';
    btn.type = 'button';
    btn.className = 'col-span-2 flex flex-col items-center justify-center px-2 py-2 leading-tight text-center rounded-xl bg-teal-950/85 border border-teal-400/50 text-teal-200';
    btn.innerHTML = `<span class='font-black text-xs'>🌐 Enable / Fix Pages</span><span class='text-[10px] font-normal opacity-75 mt-0.5'>Set Public, turn on Pages & check build</span>`;
    btn.onclick = runPagesFix;
    grid.appendChild(btn);
  }

  setInterval(mountBtn, 800);
})();