(() => {
  if (window.__afCelebrateSwapV3) return;
  window.__afCelebrateSwapV3 = true;

  const MAP_KEY = 'af_pose_media_map_v3';
  let repoMedia = [];

  function getSavedMap() {
    try { return JSON.parse(localStorage.getItem(MAP_KEY) || '{}'); } catch { return {}; }
  }
  function setSavedMap(map) {
    try { localStorage.setItem(MAP_KEY, JSON.stringify(map)); } catch {}
  }

  async function loadRepoMediaList() {
    try {
      const r = await fetch('https://api.github.com/repos/badpeachring/App-Forge/git/trees/HEAD?recursive=1', { cache: 'no-store' });
      if (!r.ok) return [];
      const data = await r.json();
      const all = (data.tree || [])
        .filter(i => i.type === 'blob' && /\.(mp4|webm|mov|webp|png|jpe?g|gif)$/i.test(i.path))
        .map(i => i.path);
      // Sort videos (.mp4/.webm/.mov) ahead of static images
      return all.sort((a, b) => {
        const av = /\.(mp4|webm|mov)$/i.test(a) ? 0 : 1;
        const bv = /\.(mp4|webm|mov)$/i.test(b) ? 0 : 1;
        return av - bv || a.localeCompare(b);
      });
    } catch {
      return [];
    }
  }

  function playMediaFile(filename, label) {
    const stage = document.getElementById('stage2d');
    const speech = document.getElementById('mjSpeech')?.firstElementChild;
    if (!stage) return false;
    if (!filename) {
      if (speech) speech.textContent = '💬 "No video assigned yet — upload via 📤 Upload Asset and pick it in ⚙️."';
      return false;
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
      if (speech) speech.textContent = `💬 "Could not load ${filename} — check ⚙️ pose mapping."`;
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
    return true;
  }

  function autoPopulateDefaults(files, map) {
    const videos = files.filter(f => /\.(mp4|webm|mov)$/i.test(f));
    const pool = videos.length ? videos : files;
    const lowPool = pool.map(f => ({ raw: f, low: f.toLowerCase() }));

    // Clear any stale image mapping if a matching video exists
    if (map.celebrate && !/\.(mp4|webm|mov)$/i.test(map.celebrate) && videos.length) delete map.celebrate;
    if (map.bikini && !/\.(mp4|webm|mov)$/i.test(map.bikini) && videos.length) delete map.bikini;

    if (!map.celebrate || !files.includes(map.celebrate)) {
      const hit = lowPool.find(f => f.low.includes('juice') || (f.low.includes('celebrate') && (f.low.includes('v2') || f.low.includes('new') || f.low.includes('2')))) || lowPool.find(f => f.low.includes('celebrate'));
      if (hit) map.celebrate = hit.raw;
    }
    if (!map.bikini || !files.includes(map.bikini) || map.bikini === map.celebrate) {
      const hit = lowPool.find(f => f.low.includes('bikini') && f.raw !== map.celebrate) || lowPool.find(f => f.raw !== map.celebrate);
      if (hit) map.bikini = hit.raw;
    }
    setSavedMap(map);
    return map;
  }

  async function init() {
    repoMedia = await loadRepoMediaList();
    const map = autoPopulateDefaults(repoMedia, getSavedMap());

    const posesPanel = document.getElementById('posesPanel');
    const rows = posesPanel ? posesPanel.querySelectorAll('.grid') : [];
    const bottomRow = rows[rows.length - 1];

    // Ensure main Celebrate button is present and wired
    let mainCelBtn = document.getElementById('cmdCelebrateBtn');
    if (!mainCelBtn && bottomRow) {
      mainCelBtn = document.createElement('button');
      mainCelBtn.id = 'cmdCelebrateBtn';
      mainCelBtn.type = 'button';
      mainCelBtn.textContent = '🎉 Celebrate';
      mainCelBtn.className = 'py-1.5 rounded-lg bg-emerald-950/90 border border-emerald-500/50 text-[11px] font-bold text-emerald-200 truncate';
      bottomRow.appendChild(mainCelBtn);
    }
    if (mainCelBtn) {
      mainCelBtn.onclick = (e) => {
        e.preventDefault();
        e.stopPropagation();
        const cur = getSavedMap();
        playMediaFile(cur.celebrate, 'Celebrate!');
      };
    }

    // Ensure Bikini Celebrate button sits right beside it
    let bikiniBtn = document.getElementById('cmdBikiniCelebrateBtn');
    if (!bikiniBtn && bottomRow) {
      bikiniBtn = document.createElement('button');
      bikiniBtn.id = 'cmdBikiniCelebrateBtn';
      bikiniBtn.type = 'button';
      bikiniBtn.textContent = '👙 Bikini Cel...';
      bikiniBtn.className = 'py-1.5 rounded-lg bg-pink-950/90 border border-pink-500/50 text-[11px] font-bold text-pink-200 truncate';
      bottomRow.appendChild(bikiniBtn);
    }
    if (bikiniBtn) {
      bikiniBtn.onclick = (e) => {
        e.preventDefault();
        e.stopPropagation();
        const cur = getSavedMap();
        playMediaFile(cur.bikini, 'Bikini Celebrate!');
      };
    }

    if (bottomRow) {
      const count = bottomRow.querySelectorAll('button').length;
      bottomRow.classList.remove('grid-cols-3', 'grid-cols-4', 'grid-cols-5');
      bottomRow.classList.add(count >= 5 ? 'grid-cols-5' : 'grid-cols-4');
    }

    // Collect all pose buttons in #posesPanel so any button can be assigned a video
    const poseSlots = [
      { key: 'celebrate', label: '🎉 Celebrate (Main / Juice)' },
      { key: 'bikini', label: '👙 Bikini Celebrate' }
    ];

    if (posesPanel) {
      posesPanel.querySelectorAll('button').forEach(btn => {
        if (btn.id === 'cmdCelebrateBtn' || btn.id === 'cmdBikiniCelebrateBtn') return;
        const rawLabel = (btn.textContent || '').trim();
        if (!rawLabel) return;
        const slug = 'pose_' + rawLabel.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
        if (!poseSlots.some(s => s.key === slug)) {
          poseSlots.push({ key: slug, label: rawLabel });
        }
        // Intercept pose click if user mapped a custom video to this pose button
        btn.addEventListener('click', (e) => {
          const cur = getSavedMap();
          if (cur[slug]) {
            e.preventDefault();
            e.stopImmediatePropagation();
            playMediaFile(cur[slug], rawLabel);
          }
        }, true);
      });
    }

    // Build Universal Pose Video Studio inside #settingsPopover
    const pop = document.getElementById('settingsPopover');
    if (pop) {
      document.getElementById('afCelebrateMapperBox')?.remove();
      const box = document.createElement('div');
      box.id = 'afCelebrateMapperBox';
      box.className = 'pt-2 mt-2 border-t border-fuchsia-500/25 space-y-2 max-h-64 overflow-y-auto pr-1';

      const makeOptions = (selectedVal) => {
        const opts = ['<option value="">-- Default / None --</option>'];
        repoMedia.forEach(f => {
          const tag = /\.(mp4|webm|mov)$/i.test(f) ? '🎬 ' : '🖼️ ';
          const sel = f === selectedVal ? 'selected' : '';
          opts.push(`<option value="${f}" ${sel}>${tag}${f}</option>`);
        });
        return opts.join('');
      };

      const curMap = getSavedMap();
      box.innerHTML = `<div class='text-[10px] font-black uppercase tracking-wider text-fuchsia-300'>🎬 Pose Video Studio (${repoMedia.length} files found)</div>` +
        poseSlots.map(slot => `
          <div class='space-y-1 bg-black/40 p-1.5 rounded-lg border border-slate-800'>
            <div class='flex items-center justify-between gap-1'>
              <span class='text-[10px] text-slate-200 font-bold truncate'>${slot.label}</span>
              <button type='button' data-test-pose='${slot.key}' data-test-label='${slot.label}' class='px-2 py-0.5 rounded bg-sky-500/25 border border-sky-400/40 text-sky-200 font-bold text-[10px] shrink-0'>▶ Play</button>
            </div>
            <select data-map-pose='${slot.key}' class='w-full bg-black/85 border border-slate-700 rounded px-1.5 py-1 text-[10px] text-white'>${makeOptions(curMap[slot.key] || '')}</select>
          </div>
        `).join('');

      pop.appendChild(box);

      box.querySelectorAll('[data-map-pose]').forEach(sel => {
        sel.onchange = () => {
          const updated = getSavedMap();
          const k = sel.getAttribute('data-map-pose');
          if (sel.value) updated[k] = sel.value;
          else delete updated[k];
          setSavedMap(updated);
        };
      });

      box.querySelectorAll('[data-test-pose]').forEach(btn => {
        btn.onclick = () => {
          pop.classList.add('hidden');
          const k = btn.getAttribute('data-test-pose');
          const lbl = btn.getAttribute('data-test-label');
          const updated = getSavedMap();
          playMediaFile(updated[k], lbl);
        };
      });
    }

    // Hook automatic deploy celebrations
    const origSet = window.setMjState;
    if (typeof origSet === 'function' && !window.__celebrateHookedV3) {
      window.__celebrateHookedV3 = true;
      window.setMjState = async (mode, text, opts) => {
        await origSet(mode, text, opts);
        if (mode === 'celebrate') {
          const cur = getSavedMap();
          if (cur.celebrate) playMediaFile(cur.celebrate, text || 'Celebrating!');
        }
      };
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();