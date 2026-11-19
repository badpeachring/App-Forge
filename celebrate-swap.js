(() => {
  const ver = Date.now();
  const exts = ["mp4", "webp", "png", "jpg", "jpeg"];
  let legacyUrl = null;

  async function findFile(base) {
    for (const ext of exts) {
      const url = `${base}.${ext}?v=${ver}`;
      try { if ((await fetch(url, { cache: "no-store" })).ok) return { url, ext }; } catch {}
    }
    return null;
  }

  function swapMedia(hit, label) {
    const stage = document.getElementById("stage2d");
    const target = stage?.querySelector("video, img");
    if (!stage || !hit) return;
    const el = hit.ext === "mp4" ? document.createElement("video") : document.createElement("img");
    el.src = hit.url;
    el.className = target?.className || "w-full h-full object-cover";
    if (hit.ext === "mp4") { el.autoplay = el.loop = el.muted = el.playsInline = true; }
    (target || stage).replaceWith(el);
    const sp = document.getElementById("mjSpeech")?.firstElementChild;
    if (sp && label) sp.textContent = `💬 "${label}"`;
  }

  document.addEventListener("DOMContentLoaded", async () => {
    const oldHit = await findFile("celebrate");
    if (oldHit) legacyUrl = oldHit.url;

    const newHit = await findFile("celebrate_v2");
    if (newHit) {
      const origSet = window.setMjState;
      if (typeof origSet === "function") {
        window.setMjState = async (mode, text, opts) => {
          await origSet(mode, text, opts);
          if (mode === "celebrate") swapMedia(newHit, text || "New celebrate!");
        };
      }
    }

    document.getElementById("cmdCelebrateBtn")?.remove();

    const pop = document.getElementById("settingsPopover");
    if (pop && !document.getElementById("tuckedLegacyCelebrate")) {
      const btn = document.createElement("button");
      btn.id = "tuckedLegacyCelebrate";
      btn.type = "button";
      btn.textContent = "🎉 Old Celebrate";
      btn.className = "w-full py-1.5 rounded-xl bg-emerald-950/80 border border-emerald-500/40 text-[11px] font-bold text-emerald-200";
      btn.onclick = () => {
        pop.classList.add("hidden");
        if (legacyUrl) swapMedia({ url: legacyUrl, ext: legacyUrl.includes(".mp4") ? "mp4" : "jpg" }, "Legacy celebrate!");
      };
      pop.appendChild(btn);
    }
  });
})();
