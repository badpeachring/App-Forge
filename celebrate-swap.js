(() => {
  const ver = Date.now();
  const exts = ["mp4", "webm", "webp", "png", "jpg", "jpeg"];
  const dirs = ["", "assets/", "media/", "videos/", "img/", "images/"];
  let oldMedia = null;
  let newMedia = null;

  async function probeUrl(url) {
    try {
      const res = await fetch(url, { cache: "no-store" });
      return res.ok;
    } catch {
      return false;
    }
  }

  async function findCelebrateMedia(candidates) {
    for (const base of candidates) {
      for (const dir of dirs) {
        for (const ext of exts) {
          const url = `${dir}${base}.${ext}?v=${ver}`;
          if (await probeUrl(url)) {
            return { url, isVideo: ext === "mp4" || ext === "webm" };
          }
        }
      }
    }
    return null;
  }

  async function discoverRepoMedia() {
    try {
      const res = await fetch(`https://api.github.com/repos/badpeachring/App-Forge/contents/?ref=main`, {
        cache: "no-store"
      });
      if (!res.ok) return [];
      const items = await res.json();
      if (!Array.isArray(items)) return [];
      return items
        .filter((f) => f && f.type === "file" && /\.(mp4|webm|webp|png|jpe?g)$/i.test(f.name))
        .map((f) => ({
          name: f.name.toLowerCase(),
          url: `${f.path}?v=${ver}`,
          isVideo: /\.(mp4|webm)$/i.test(f.name)
        }));
    } catch {
      return [];
    }
  }

  function playMedia(media, caption) {
    const stage = document.getElementById("stage2d");
    if (!stage || !media?.url) return;

    const existing = stage.querySelector("video, img");
    const el = media.isVideo ? document.createElement("video") : document.createElement("img");
    el.src = media.url;
    el.className = existing?.className || "w-full h-full object-cover";
    if (media.isVideo) {
      el.autoplay = true;
      el.loop = true;
      el.muted = true;
      el.playsInline = true;
      el.play?.().catch(() => {});
    }

    if (existing) {
      existing.replaceWith(el);
    } else {
      const layer = document.getElementById("layerA") || stage;
      layer.innerHTML = "";
      layer.appendChild(el);
    }

    const speech = document.getElementById("mjSpeech")?.firstElementChild;
    if (speech && caption) speech.textContent = `💬 "${caption}"`;
  }

  function ensureControls(currentNewMedia, currentOldMedia) {
    document.getElementById("cmdCelebrateBtn")?.remove();

    const posesPanel = document.getElementById("posesPanel");
    const rows = posesPanel ? posesPanel.querySelectorAll(".grid") : [];
    const bottomRow = rows[rows.length - 1];
    if (bottomRow && !document.getElementById("cmdBikiniCelebrateBtn")) {
      const bBtn = document.createElement("button");
      bBtn.id = "cmdBikiniCelebrateBtn";
      bBtn.type = "button";
      bBtn.textContent = "👙 Bikini Cel...";
      bBtn.title = "Bikini Celebrate";
      bBtn.className = "py-1.5 rounded-lg bg-pink-950/90 border border-pink-500/50 text-[11px] font-bold text-pink-200 truncate";
      bBtn.onclick = () => {
        if (currentOldMedia) {
          playMedia(currentOldMedia, "Bikini Celebrate!");
        } else {
          alert("Original celebrate video file not found yet.");
        }
      };
      bottomRow.appendChild(bBtn);
      bottomRow.classList.remove("grid-cols-4");
      bottomRow.classList.add("grid-cols-5");
    }

    const pop = document.getElementById("settingsPopover");
    if (pop && !document.getElementById("testCurrentCelebrateBtn")) {
      const tBtn = document.createElement("button");
      tBtn.id = "testCurrentCelebrateBtn";
      tBtn.type = "button";
      tBtn.textContent = "🎉 Test Celebrate";
      tBtn.className = "w-full py-1.5 rounded-xl bg-emerald-950/80 border border-emerald-500/40 text-[11px] font-bold text-emerald-200";
      tBtn.onclick = () => {
        pop.classList.add("hidden");
        if (currentNewMedia) {
          playMedia(currentNewMedia, "Testing current celebrate!");
        } else {
          alert("New celebrate video file not found yet.");
        }
      };
      pop.appendChild(tBtn);
    }
  }

  async function initSwap() {
    oldMedia = await findCelebrateMedia(["celebrate_old", "bikini_celebrate", "celebrate_legacy", "celebrate"]);
    newMedia = await findCelebrateMedia(["celebrate_v2", "celebrate_new", "new_celebrate"]);

    if (!oldMedia || !newMedia) {
      const repoMedia = await discoverRepoMedia();
      if (!newMedia) {
        const matchNew = repoMedia.find((m) => m.name.includes("celebrate") && (m.name.includes("v2") || m.name.includes("new")));
        if (matchNew) newMedia = { url: matchNew.url, isVideo: matchNew.isVideo };
      }
      if (!oldMedia) {
        const matchOld = repoMedia.find((m) => m.name.includes("celebrate") && m.url !== newMedia?.url);
        if (matchOld) oldMedia = { url: matchOld.url, isVideo: matchOld.isVideo };
      }
    }

    if (!newMedia && oldMedia) newMedia = oldMedia;

    const origSet = window.setMjState;
    if (typeof origSet === "function") {
      window.setMjState = async (mode, text, opts) => {
        await origSet(mode, text, opts);
        if (mode === "celebrate" && newMedia) {
          playMedia(newMedia, text || "Celebrating!");
        }
      };
    }

    ensureControls(newMedia, oldMedia);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initSwap);
  } else {
    initSwap();
  }
})();
