(() => {
  const ver = Date.now();
  const exts = ["mp4", "webp", "png", "jpg", "jpeg"];
  let oldMedia = null;
  let newMedia = null;

  async function findFile(base) {
    for (const ext of exts) {
      const url = `${base}.${ext}?v=${ver}`;
      try {
        if ((await fetch(url, { cache: "no-store" })).ok) return { url, ext };
      } catch {}
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
    if (hit.ext === "mp4") el.autoplay = el.loop = el.muted = el.playsInline = true;
    (target || stage).replaceWith(el);
    const sp = document.getElementById("mjSpeech")?.firstElementChild;
    if (sp && label) sp.textContent = `💬 "${label}"`;
  }

  document.addEventListener("DOMContentLoaded", async () => {
    oldMedia = await findFile("celebrate");
    newMedia = (await findFile("celebrate_v2")) || oldMedia;

    document.getElementById("cmdCelebrateBtn")?.remove();

    const origSet = window.setMjState;
    if (typeof origSet === "function") {
      window.setMjState = async (mode, text, opts) => {
        await origSet(mode, text, opts);
        if (mode === "celebrate" && newMedia) {
          swapMedia(newMedia, text || "Celebrating!");
        }
      };
    }

    const pop = document.getElementById("settingsPopover");
    if (pop && !document.getElementById("tuckedNewCelebrate")) {
      const sBtn = document.createElement("button");
      sBtn.id = "tuckedNewCelebrate";
      sBtn.type = "button";
      sBtn.textContent = "🎉 Celebrate";
      sBtn.className = "w-full py-1.5 rounded-xl bg-emerald-950/80 border border-emerald-500/40 text-[11px] font-bold text-emerald-200";
      sBtn.onclick = () => {
        pop.classList.add("hidden");
        if (newMedia) swapMedia(newMedia, "Celebrating!");
      };
      pop.appendChild(sBtn);
    }

    const posesPanel = document.getElementById("posesPanel");
    const bottomRow = posesPanel?.querySelectorAll(".grid")?.[1];
    if (bottomRow && !document.getElementById("cmdBikiniCelebrateBtn")) {
      const bBtn = document.createElement("button");
      bBtn.id = "cmdBikiniCelebrateBtn";
      bBtn.type = "button";
      bBtn.textContent = "👙 Bikini Celebrate";
      bBtn.className = "py-1.5 rounded-lg bg-pink-950/90 border border-pink-500/50 text-[11px] font-bold text-pink-200 truncate";
      bBtn.onclick = () => {
        if (oldMedia) swapMedia(oldMedia, "Bikini Celebrate!");
      };
      bottomRow.appendChild(bBtn);
      bottomRow.classList.remove("grid-cols-4");
      bottomRow.classList.add("grid-cols-5");
    }
  });
})();
