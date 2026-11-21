(() => {
  if (window.__afCelebrateSwapV2) return;
  window.__afCelebrateSwapV2 = true;

  const NEW_KEY = 'af_celebrate_new_file_v1';
  const OLD_KEY = 'af_celebrate_old_file_v1';
  let repoMedia = [];

  async function loadRepoMediaList() {
    try {
      const r = await fetch('https://api.github.com/repos/badpeachring/App-Forge/git/trees/HEAD?recursive=1', { cache: 'no-store' });
      if (!r.ok) return [];
      const data = await r.json();
      return (data.tree || [])
        .filter(i => i.type === 'blob' && /\.(mp4|webm|mov|webp|png|jpe?g|gif)$/i.test(i.path))
        .map(i => i.path);
    } catch {
      return [];
    }
  }

  function resolveFiles(files) {
    const lower = files.map(f => ({ raw: f, low: f.toLowerCase() }));
    let savedNew = localStorage.getItem(NEW_KEY) || '';
    let savedOld = localStorage.getItem(OLD_KEY) || '';

    if (savedNew && !files.includes(savedNew)) savedNew = '';
    if (savedOld && !files.includes(savedOld)) savedOld = '';

    if (!savedNew) {
      const hit = lower.find(f => f.low.includes('celebrate') && (f.low.includes('v2') || f.low.includes('new') || f.low.includes('2')));
      if (hit) savedNew = hit.raw;
    }
    if (!savedOld) {
      const hit = lower.find(f => (f.low.includes('bikini') || f.low.includes('celebrate')) && f.raw !== savedNew);
      if (hit) savedOld = hit.raw;
    }
    if (!savedNew && savedOld) savedNew = savedOld;

    if (savedNew) localStorage.setItem(NEW_KEY, savedNew);
    if (savedOld) localStorage.setItem(OLD_KEY, savedOld);
    return { newFile: savedNew, oldFile: savedOld };
  }

  function playMediaFile(filename, label) {
    const stage = document.getElementById('stage2d');
    const speech = document.getElementById('mjSpeech')?.firstElementChild;
    if (!stage) return;
    if (!filename) {
      if (speech) speech.textContent = '💬 "No video uploaded yet — use 📤 Upload Asset or pick a file in ⚙️ settings."';
      return;
    }

    const url = `${filename}?v=${Date.now()}`;
    const isVideo = /\.(mp4|webm|mov)$/i.test(filename);
    const el = isVideo ? document.createElement('video') : document.createElement('img');
    el.src = url;
    el.className = 'w-full h-full object-cover';
    if (isVideo) {
      el.autoplay = true;
      el.loop = true;
      el.muted = true;
      el.playsInline = true;
    }

    el.onerror = () => {
      if (speech) speech.textContent = `💬 "Failed to load ${filename} — check ⚙️ video mapping."`;
    };

    const layerA = document.getElementById('layerA');
    const layerB = document.getElementById('layerB');
    if (layerA && layerB) {
      layerA.innerHTML = '';
      layerA.appendChild(el);
      layerA.classList.remove('opacity-0');
      layerA.classList.add('opacity-100');
      layerB.classList.add('opacity-0');
      layerB.classList.remove('opacity-100');
    } else {
      stage.innerHTML = '';
      stage.appendChild(el);
    }

    if (isVideo) el.play().catch(() => {});
    if (speech && label) speech.textContent = `💬 "${label}"`;
  }

  async function init() {
    repoMedia = await loadRepoMediaList();
    let { newFile, oldFile } = resolveFiles(repoMedia);

    document.getElementById('cmdCelebrateBtn')?.remove();

    const posesPanel = document.getElementById('posesPanel');
    const rows = posesPanel ? posesPanel.querySelectorAll('.grid') : [];
    const bottomRow = rows[rows.length - 1];
    if (bottomRow && !document.getElementById('cmdBikiniCelebrateBtn')) {
      const btn = document.createElement('button');
      btn.id = 'cmdBikiniCelebrateBtn';
      btn.type = 'button';
      btn.textContent = '👙 Bikini Cel...';
      btn.className = 'py-1.5 rounded-lg bg-pink-950/90 border border-pink-500/50 text-[11px] font-bold text-pink-200 truncate';
      btn.onclick = () => {
        const file = localStorage.getItem(OLD_KEY) || oldFile;
        playMediaFile(file, 'Bikini Celebrate!');
      };
      bottomRow.appendChild(btn);
      bottomRow.classList.remove('grid-cols-4');
      bottomRow.classList.add('grid-cols-5');
    }

    const pop = document.getElementById('settingsPopover');
    if (pop && !document.getElementById('afCelebrateMapperBox')) {
      const box = document.createElement('div');
      box.id = 'afCelebrateMapperBox';
      box.className = 'pt-2 mt-2 border-t border-fuchsia-500/25 space-y-1.5';
      const options = ['<option value="">-- Select Media File --</option>']
        .concat(repoMedia.map(f => `<option value="${f}">${f}</option>`))
        .join('');

      box.innerHTML = `
        <button id='testCurrentCelebrateBtn' type='button' class='w-full py-1.5 rounded-xl bg-emerald-950/85 border border-emerald-500/45 text-[11px] font-bold text-emerald-200'>🎉 Test New Celebrate</button>
        <div class='text-[10px] text-slate-400 font-bold'>New Celebrate File:</div>
        <select id='selNewCel' class='w-full bg-black/80 border border-slate-700 rounded-lg px-2 py-1 text-[10px] text-white'>${options}</select>
        <div class='text-[10px] text-slate-400 font-bold'>Bikini Celebrate File:</div>
        <select id='selOldCel' class='w-full bg-black/80 border border-slate-700 rounded-lg px-2 py-1 text-[10px] text-white'>${options}</select>
      `;
      pop.appendChild(box);

      const selNew = document.getElementById('selNewCel');
      const selOld = document.getElementById('selOldCel');
      if (newFile) selNew.value = newFile;
      if (oldFile) selOld.value = oldFile;

      selNew.onchange = () => localStorage.setItem(NEW_KEY, selNew.value);
      selOld.onchange = () => localStorage.setItem(OLD_KEY, selOld.value);

      document.getElementById('testCurrentCelebrateBtn').onclick = () => {
        pop.classList.add('hidden');
        const file = localStorage.getItem(NEW_KEY) || newFile;
        playMediaFile(file, 'Celebrating!');
      };
    }

    const origSet = window.setMjState;
    if (typeof origSet === 'function' && !window.__celebrateHooked) {
      window.__celebrateHooked = true;
      window.setMjState = async (mode, text, opts) => {
        await origSet(mode, text, opts);
        if (mode === 'celebrate') {
          const file = localStorage.getItem(NEW_KEY) || newFile;
          playMediaFile(file, text || 'Celebrating!');
        }
      };
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();