(() => {
  if (window.__afUxGuideLoaded) return;
  window.__afUxGuideLoaded = true;

  const BUTTON_SUBTITLES = {
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

  function upgradeButtons() {
    Object.entries(BUTTON_SUBTITLES).forEach(([id, [title, sub]]) => {
      const btn = document.getElementById(id);
      if (!btn || btn.dataset.uxUpgraded) return;
      btn.dataset.uxUpgraded = '1';
      btn.classList.add('flex', 'flex-col', 'items-center', 'justify-center', 'px-2', 'py-2', 'leading-tight');
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
    upgradeButtons();
    injectModalGuides();
    const obs = new MutationObserver(() => {
      upgradeButtons();
      injectModalGuides();
    });
    obs.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();