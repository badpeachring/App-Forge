(() => {
  if (window.__afLauncherLoaded) return;
  window.__afLauncherLoaded = true;

  const getRepo = () => document.getElementById('repoSelect')?.value || '';
  const getOwner = () => location.hostname.endsWith('.github.io') ? location.hostname.split('.')[0] : 'badpeachring';

  function mountLauncherBtns() {
    const grid = document.querySelector('#afGodModeBar .grid');
    if (!grid || document.getElementById('afLaunchLiveBtn')) return;

    const openBtn = document.createElement('button');
    openBtn.id = 'afLaunchLiveBtn';
    openBtn.type = 'button';
    openBtn.className = 'flex flex-col items-center justify-center px-2 py-2 leading-tight text-center rounded-xl bg-emerald-950/85 border border-emerald-400/50 text-emerald-200';
    openBtn.innerHTML = `<span class='font-black text-xs'>🚀 Open Live App</span><span class='text-[10px] font-normal opacity-75 mt-0.5'>Launch in Chrome to install</span>`;
    openBtn.onclick = () => {
      const repo = getRepo();
      if (!repo) return alert('Select a repo in Section 2 first.');
      window.open(`https://${getOwner()}.github.io/${repo}/`, '_blank');
    };

    const zipBtn = document.createElement('button');
    zipBtn.id = 'afDownloadZipBtn';
    zipBtn.type = 'button';
    zipBtn.className = 'flex flex-col items-center justify-center px-2 py-2 leading-tight text-center rounded-xl bg-violet-950/85 border border-violet-400/50 text-violet-200';
    zipBtn.innerHTML = `<span class='font-black text-xs'>⬇️ Download .zip</span><span class='text-[10px] font-normal opacity-75 mt-0.5'>Save full repo backup</span>`;
    zipBtn.onclick = () => {
      const repo = getRepo();
      if (!repo) return alert('Select a repo in Section 2 first.');
      window.open(`https://github.com/${getOwner()}/${repo}/archive/refs/heads/main.zip`, '_blank');
    };

    grid.appendChild(openBtn);
    grid.appendChild(zipBtn);
  }

  setInterval(mountLauncherBtns, 800);
})();