/* Teaser-Seite Zählerleser – gemeinsames Verhalten der drei Entwürfe (ohne Bibliotheken, 13.11.2026).
   - Einblenden beim Scrollen:        [data-zeig]            → Klasse .ist-da
   - Videos erst laden, wenn nötig:   <video data-lazy>      → Quellen aus data-src, Start bei data-start (Sekunden)
     Pause-Knopf je Video:            [data-video-knopf="#id"]
     Text im Takt des Videos:         [data-takt="#id"] mit Kindern [data-von][data-bis] → Klasse .aktiv
   - Reiter:                          [data-reiter] mit Knöpfen [aria-controls]
   - Meldeformular (nur Vorschau):    form[data-melden]
   ?foto in der Adresse: alles im Endzustand, keine Bewegung, keine Videos (für Screenshots). */
(() => {
  const html = document.documentElement;
  const foto = new URLSearchParams(location.search).has("foto");
  const ruhig = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const sparen = !!(navigator.connection && navigator.connection.saveData);
  html.classList.add("js");
  if (foto) html.classList.add("foto");

  /* ---------- Einblenden ---------- */
  const zeig = [...document.querySelectorAll("[data-zeig]")];
  if (foto || ruhig || !("IntersectionObserver" in window)) {
    zeig.forEach((e) => e.classList.add("ist-da"));
  } else {
    const io = new IntersectionObserver((treffer) => {
      treffer.forEach((t) => {
        if (!t.isIntersecting) return;
        const e = t.target;
        e.style.transitionDelay = (Number(e.dataset.zeig) || 0) * 90 + "ms";
        e.classList.add("ist-da");
        io.unobserve(e);
      });
    }, { rootMargin: "0px 0px -12% 0px", threshold: 0.08 });
    zeig.forEach((e) => io.observe(e));
  }

  /* ---------- Videos ---------- */
  const knopfVon = (v) => document.querySelector(`[data-video-knopf="#${v.id}"]`);
  const zeigeZustand = (v) => {
    const k = knopfVon(v);
    if (!k) return;
    const laeuft = !v.paused && !v.ended;
    k.setAttribute("aria-pressed", String(!laeuft));
    k.setAttribute("aria-label", laeuft ? "Video anhalten" : "Video abspielen");
    k.dataset.zustand = laeuft ? "laeuft" : "steht";
  };
  const laden = (v) => {
    if (v.dataset.geladen) return;
    v.dataset.geladen = "1";
    const start = Number(v.dataset.start || 0);          // Einstieg mitten im Loop: dort, wo das Standbild herkommt
    if (start) {
      // Einmal an die Stelle springen. Kann der Server noch nicht springen (Datei erst teilweise da), später nochmals versuchen;
      // nach dem ersten Durchlauf nie mehr, sonst würde der Loop am Anfang jedes Mal überspringen.
      let fertig = false, versuche = 0;
      const springe = () => {
        if (fertig) return;
        if (v.currentTime >= start - 0.3 || versuche >= 3) { fertig = true; return; }
        for (let i = 0; i < v.seekable.length; i++) {
          if (v.seekable.start(i) <= start && v.seekable.end(i) >= start) { versuche++; v.currentTime = start; return; }
        }
      };
      ["loadedmetadata", "canplay", "progress"].forEach((n) => v.addEventListener(n, springe));
    }
    v.querySelectorAll("source[data-src]").forEach((q) => { q.src = q.dataset.src + (start ? "#t=" + start : ""); });
    v.load();
  };
  const spielen = (v) => { laden(v); const p = v.play(); if (p) p.catch(() => zeigeZustand(v)); };
  const videos = [...document.querySelectorAll("video[data-lazy]")];
  videos.forEach((v) => {
    v.muted = true;
    ["play", "pause", "ended"].forEach((n) => v.addEventListener(n, () => zeigeZustand(v)));
    const k = knopfVon(v);
    if (k) k.addEventListener("click", () => { v.dataset.hand = "1"; v.paused ? spielen(v) : v.pause(); });
    zeigeZustand(v);
  });
  if (!foto && "IntersectionObserver" in window) {
    const selbst = !(ruhig || sparen);          // bei «weniger Bewegung» oder Datensparen startet nur der Knopf das Video
    const vio = new IntersectionObserver((treffer) => {
      treffer.forEach((t) => {
        const v = t.target;
        if (t.isIntersecting) { if (selbst && !v.dataset.hand) spielen(v); }
        else if (!v.paused) { v.pause(); delete v.dataset.hand; }
      });
    }, { rootMargin: "200px 0px", threshold: 0.15 });
    videos.forEach((v) => vio.observe(v));
  }

  /* ---------- Text im Takt des Videos ---------- */
  document.querySelectorAll("[data-takt]").forEach((box) => {
    const v = document.querySelector(box.dataset.takt);
    const teile = [...box.querySelectorAll("[data-von]")];
    if (!v || !teile.length) return;
    const setze = () => {
      const t = v.currentTime;
      teile.forEach((e) => e.classList.toggle("aktiv", !v.paused && t >= Number(e.dataset.von) && t < Number(e.dataset.bis)));
    };
    v.addEventListener("timeupdate", setze);
    v.addEventListener("pause", setze);
  });

  /* ---------- Reiter ---------- */
  document.querySelectorAll("[data-reiter]").forEach((leiste) => {
    const knoepfe = [...leiste.querySelectorAll("[role=tab]")];
    const waehle = (k, fokus) => {
      knoepfe.forEach((b) => {
        const an = b === k;
        b.setAttribute("aria-selected", String(an));
        b.tabIndex = an ? 0 : -1;
        const tafel = document.getElementById(b.getAttribute("aria-controls"));
        if (tafel) tafel.hidden = !an;
      });
      if (fokus) k.focus();
    };
    knoepfe.forEach((b, i) => {
      b.addEventListener("click", () => waehle(b));
      b.addEventListener("keydown", (e) => {
        const d = { ArrowRight: 1, ArrowLeft: -1 }[e.key];
        if (d) { e.preventDefault(); waehle(knoepfe[(i + d + knoepfe.length) % knoepfe.length], true); }
      });
    });
    if (knoepfe.length) waehle(knoepfe.find((b) => b.getAttribute("aria-selected") === "true") || knoepfe[0]);
  });

  /* ---------- Meldeformular ----------
     Ohne data-ziel (Entwürfe): Vorschau, sendet nichts.
     Mit data-ziel="/api/kontakt" (kohlilab.ch): schickt die Adresse als Kontaktanfrage, sie kommt als Mail bei KohliLab an. */
  document.querySelectorAll("form[data-melden]").forEach((f) => {
    const feld = f.querySelector("input[type=email]");
    const meldung = f.querySelector("[data-meldung]");
    const knopf = f.querySelector("button[type=submit]");
    const sage = (art, text) => { meldung.dataset.art = art; meldung.textContent = text; };
    f.addEventListener("submit", async (e) => {
      e.preventDefault();
      const ok = feld.value.trim() !== "" && feld.checkValidity();
      feld.setAttribute("aria-invalid", String(!ok));
      if (!ok) { sage("fehler", "Bitte gib eine gültige E-Mail-Adresse ein, zum Beispiel name@beispiel.ch."); feld.focus(); return; }
      if (!f.dataset.ziel) { sage("ok", "Danke! In dieser Vorschau wird noch nichts gesendet."); return; }
      knopf.disabled = true;
      sage("", "Wird gesendet …");
      try {
        const honig = f.querySelector("[name=firma]");
        const r = await fetch(f.dataset.ziel, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({
          name: "Zählerleser-Interesse", email: feld.value.trim(), telefon: "", firma: honig ? honig.value : "",
          nachricht: "Bitte benachrichtigt mich, sobald der Zählerleser erhältlich ist. (Meldefeld auf kohlilab.ch/zaehlerleser)" }) });
        const d = await r.json().catch(() => ({}));
        if (r.ok && d.ok) { sage("ok", "Danke! Wir melden uns, sobald der Zählerleser erhältlich ist."); f.reset(); }
        else sage("fehler", d.fehler || "Das hat nicht geklappt. Schreib uns bitte über die Kontaktseite.");
      } catch { sage("fehler", "Keine Verbindung. Bitte versuch es später nochmals."); }
      knopf.disabled = false;
    });
  });
})();
