(() => {
  if (window.__afUxGuideV2) return;
  window.__afUxGuideV2 = true;

  const BUTTON_SUBTITLES = {
    afScanRepoBtn: ['🔍 Scan v2', 'Audit repo for bugs & snippets'],
    afPatchRunnerBtn: ['⚡ Patch', 'Apply multi-file JSON fixes'],
    afTimeBtn: ['⏪ Time Machine', 'Undo bad deploys in 1 tap'],
    afScafBtn: ['🏗️ New App', 'Create repo + GitHub Pages'],
    afUploadBtn: ['📤 Upload Asset', 'Push videos & images to repo'],
    afSandboxBtn: ['👁️ Sandbox', 'Test unsaved editor code'],
    afPackContextBtn: ['📦 Pack Context for AI', 'Export Skeleton, Full Bundle, or .txt for chat']
  };

  const MODAL_GUIDES = {
    'Time Machine': 'Pick any previous commit below and tap Rollback to instantly revert your live GitHub Pages site to that exact snapshot.',
    'Instant App Scaffolder': 'Enter a repo name and display title. App Forge creates the GitHub repository, pushes a starter PWA shell, and turns on GitHub Pages automatically.',
    'Upload Binary Asset': 'Choose any .mp4, .png, .jpg, or .webp file from your phone. Set the filename and push it straight to the currently selected repository.',
    'Live Sandbox Preview': 'Runs whatever HTML/JS is currently inside your App Forge code editor in an isolated preview before you commit it to GitHub.',
    'Context Scanner v2': 'Audits every HTML, JS, and JSON file in the selected repo for syntax crashes, unclosed tags, and missing DOM IDs, attaching line-numbered snippets.',
    'JSON Patch Runner': 'Paste a multi-file JSON patch from chat. Always tap Dry Run first to verify all matches pass, then tap Execute Patch to deploy.'
  };

  function layoutTopButtons() {
    const createBtn = document.getElementById('createFileModeBtn');
    const scanBtn = document.getElementById('afScanRepoBtn');
    const patchBtn = document.getElementById('afPatchRunnerBtn');
    const inputRow = createBtn?.parentElement;
    if (!inputRow) return;

    if (createBtn && !createBtn.dataset.uxFixed) {
      createBtn.dataset.uxFixed = '1';
      createBtn.classList.add('whitespace-nowrap', 'shrink-0', 'px-3');
      createBtn.textContent = '+ New';
    }

    if (!scanBtn && !patchBtn) return;

    let grid = document.getElementById('afTopToolsGrid');
    if (!grid) {
      grid = document.createElement('div');
      grid.id = 'afTopToolsGrid';
      grid.className = 'grid grid-cols-2 gap-1.5 mt-2';
      inputRow.insertAdjacentElement('afterend', grid);
    }

    if (scanBtn && scanBtn.parentElement !== grid) {
      scanBtn.className = 'w-full py-2 px-2 bg-sky-500/20 border border-sky-400/45 text-sky-200 font-bold rounded-xl text-xs';
      grid.appendChild(scanBtn);
    }
    if (patchBtn && patchBtn.parentElement !== grid) {
      patchBtn.className = 'w-full py-2 px-2 bg-amber-500/20 border border-amber-400/50 text-amber-200 font-bold rounded-xl text-xs';
      grid.appendChild(patchBtn);
    }
  }

  function upgradeButtons() {
    Object.entries(BUTTON_SUBTITLES).forEach(([id, [title, sub]]) => {
      const btn = document.getElementById(id);
      if (!btn || btn.dataset.uxUpgraded) return;
      btn.dataset.uxUpgraded = '1';
      btn.classList.add('flex', 'flex-col', 'items-center', 'justify-center', 'px-2', 'py-2', 'leading-tight', 'text-center');
      btn.innerHTML = `<span class='font-black text-xs'>${title}</span><span class='text-[10px] font-normal opacity-75 mt-0.5'>${sub}</span>`;
    });
  }

  function injectModalGuides() {
    ['afGodModal', 'afScannerModal', 'afPatchModal'].forEach(mid => {
      const modal = document.getElementById(mid);
      if (!modal || modal.classList.contains('hidden')) return;
      const card = modal.firstElementChild;
      if (!card || card.querySelector('.af-ux-guide')) return;
      const header = card.firstElementChild;
      const titleText = (header?.textContent || '').trim();
      const matchKey = Object.keys(MODAL_GUIDES).find(k => titleText.includes(k));
      if (!matchKey || !header) return;

      const guide = document.createElement('div');
      guide.className = 'af-ux-guide p-2.5 rounded-xl bg-fuchsia-950/45 border border-fuchsia-500/30 text-[11px] text-fuchsia-100 leading-relaxed';
      guide.innerHTML = `<strong class='text-fuchsia-300'>ℹ️ How to use:</strong> ${MODAL_GUIDES[matchKey]}`;
      header.insertAdjacentElement('afterend', guide);
    });
  }

  function start() {
    layoutTopButtons();
    upgradeButtons();
    injectModalGuides();
    const obs = new MutationObserver(() => {
      layoutTopButtons();
      upgradeButtons();
      injectModalGuides();
    });
    obs.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();