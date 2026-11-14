/* Fliegende Eule für die Startseite von kohlilab.ch — Final (Manolo 14.11.2026)
 *
 * Gleitflug, Landung unten rechts, Augen türkis (Akzent «Smart Home»), glimmen schon im Anflug. Klick auf die Eule:
 * Tafel «Neu bei KohliLab: Smart Home · Entdecken →» mit Link zur Bereichsseite. X blendet sie für diesen Besuch aus.
 * Fliegt nur einmal pro Besuch, danach sitzt sie gleich da. Nie über Bedienelementen: kommt ein Link, Knopf oder Feld
 * unter sie, duckt sie sich hinter den Fensterrand (nur noch die Augen schauen hervor) oder verschwindet ganz.
 * Auf schmalen Fenstern kleiner, unten bekommt die Fusszeile Luft (--kl-eule-luft).
 * Abflug: Klick auf einen Link zu einer anderen Seite von kohlilab.ch -> sie hebt ab und fliegt in die Tiefe, die neue
 * Seite blendet währenddessen ein (View Transition zwischen den Dokumenten, Regeln in global.css). Zurück-Knopf, Tab
 * schliessen, externe Links, neue Tabs: kein Abflug. «Weniger Bewegung»: kein Flug, kein Abflug, nur sanftes Ausblenden.
 *
 * Einbau: <script src="/eule/eule.js" defer data-medien="/eule/gleitflug/" data-blick="/eule/blick/"
 *                 data-abflug="/eule/abflug/" data-ziel="/smart-home"></script>
 * Auf kohlilab.ch setzt ein kleines Inline-Skript in src/pages/index.astro dieses Tag erst 1,2 s nach dem Laden der Seite.
 * Quelle: RaspiCam, zaehler/e450/gemeinsam/webseite/eule_flug/final/eule.js; eingebaut mit werkzeuge/einbau_kohlilab.py.
 *
 * Technik: gerenderte Einzelbilder aus Blender (Cycles, 256 Samples), freigestellt, als WebP-Tafeln. Der Flug ist im
 * Render echt (Perspektive, Kippen, Bewegungsunschärfe); die Bahn steht in daten-*.json und wird auf das Fenster
 * umgerechnet. Posen wechseln 30-mal je Sekunde, Ort und Grösse rechnet der Browser für jedes Bildschirmbild neu.
 * Das Licht der Augen ist eine eigene Bildlage («glut») und wird mit «screen» darübergelegt.
 * Laden: frühestens 1,6 s nach dem Laden der Seite im Leerlauf; die Glut bereitet ein Hintergrund-Thread auf (glut.js),
 * sonst gestückelt (keine langen Tasks).
 */
(function () {
  'use strict';
  var skript = document.currentScript;
  var D = skript ? skript.dataset : {};
  var frage = new URLSearchParams(location.search);
  var K = {
    medien: D.medien || 'medien/',
    blick: D.blick || '../blick/medien/',
    abflug: D.abflug || '',
    ziel: D.ziel || '/smart-home',
    // Vorschau-Schalter: ?modus=flug (immer fliegen), sitzt (wie beim zweiten Seitenaufruf), ruhig (wie «weniger Bewegung»)
    modus: frage.get('modus') || '',
    hand: frage.has('hand'),          // Uhr von aussen stellen (für Standbilder)
    merken: !frage.has('modus')       // nur ohne Schalter wird «schon geflogen» und «ausgeblendet» gemerkt
  };
  var HALT = 0.80;                    // s Pause nach dem Nachfedern: die Augen glühen auf, dann dreht sie sich
  var GIER_MAX = 15, NICK_MAX = 5;    // so weit folgt der Blick dem Mauszeiger (Grad)
  // Abflug: so lange spielt die Eule, bevor der Browser die neue Seite holt. Mit Übergang zwischen den Dokumenten fliegt
  // sie danach im Übergang weiter (global.css, kl-eule-fort); ohne (Firefox, ältere Safari) wartet sie fast bis zum Ende.
  var VT = typeof window.PageSwapEvent === 'function' || 'onpageswap' in window;
  var ABFLUG_HALTEN = VT ? 0.40 : 0.62;
  var BEDIEN = 'a[href],button,input,select,textarea,summary,label[for],[role="button"],[role="link"],[tabindex]:not([tabindex="-1"]),video[controls],iframe';

  var TUERKIS = '34,227,232';
  var CSS = [
    '.kl-eule{position:fixed;inset:0;z-index:60;pointer-events:none;overflow:hidden;contain:layout style;font-family:var(--body,Inter,system-ui,sans-serif)}',
    '.kl-eule *{box-sizing:border-box}',
    '.kl-eule canvas,.kl-eule-schatten,.kl-eule-schein{position:absolute;left:0;top:0;will-change:transform,opacity}',
    '.kl-eule-schatten{border-radius:50%;background:radial-gradient(closest-side,rgba(0,0,0,.62),rgba(0,0,0,.34) 45%,rgba(0,0,0,0) 100%);opacity:0}',
    '.kl-eule-schein{border-radius:50%;background:radial-gradient(closest-side,rgba(' + TUERKIS + ',.26),rgba(' + TUERKIS + ',.09) 48%,rgba(' + TUERKIS + ',0) 100%);mix-blend-mode:screen;opacity:0}',
    '.kl-eule-knopf{position:absolute;left:0;top:0;padding:0;border:0;background:none;border-radius:14px;cursor:pointer;pointer-events:auto;-webkit-tap-highlight-color:transparent;display:none}',
    '.kl-eule-knopf:focus-visible{outline:2px solid var(--sh2,#a2f4f3);outline-offset:3px}',
    '.kl-eule-zu{position:absolute;left:0;top:0;width:26px;height:26px;border-radius:50%;border:1px solid var(--line2,#4a4f56);background:rgba(20,21,23,.92);color:var(--ink,#e8e6e1);font:500 15px/1 var(--mono,monospace);cursor:pointer;pointer-events:auto;display:none;align-items:center;justify-content:center;opacity:0;transition:opacity .18s,border-color .18s,color .18s}',
    '.kl-eule-zu:hover{border-color:var(--sh,#22e3e8);color:var(--sh,#22e3e8)}',
    '.kl-eule-zu:focus-visible{outline:2px solid var(--sh2,#a2f4f3);outline-offset:2px;opacity:1}',
    '.kl-eule.wach .kl-eule-knopf{display:block}.kl-eule.wach .kl-eule-zu{display:flex}',
    '.kl-eule.wach.nah .kl-eule-zu,.kl-eule.wach.handy .kl-eule-zu,.kl-eule.wach.offen .kl-eule-zu{opacity:1}',
    '.kl-eule.versteckt .kl-eule-knopf,.kl-eule.versteckt .kl-eule-zu{visibility:hidden}',
    '.kl-eule.handy .kl-eule-zu{width:30px;height:30px}',
    '.kl-eule-tafel{position:absolute;left:0;top:0;display:block;width:max-content;max-width:min(270px,calc(100vw - 32px));padding:13px 16px 13px 15px;border-radius:8px;border:1px solid var(--line2,#4a4f56);border-left:3px solid var(--sh,#22e3e8);background:linear-gradient(180deg,#232a2c,#1c1e21);color:var(--ink,#e8e6e1);text-decoration:none;box-shadow:0 18px 40px rgba(0,0,0,.55),0 0 0 1px rgba(0,0,0,.4),0 0 34px rgba(' + TUERKIS + ',.10);pointer-events:none;opacity:0;visibility:hidden;transform-origin:var(--ux,100%) var(--uy,100%);scale:.82;transition:opacity .16s,scale .34s cubic-bezier(.2,1.5,.4,1),visibility 0s .2s}',
    '.kl-eule.offen .kl-eule-tafel{opacity:1;visibility:visible;scale:1;pointer-events:auto;transition:opacity .16s,scale .34s cubic-bezier(.2,1.5,.4,1),visibility 0s}',
    '.kl-eule-tafel:hover{border-color:var(--sh,#22e3e8)}',
    '.kl-eule-tafel:focus-visible{outline:2px solid var(--sh2,#a2f4f3);outline-offset:3px}',
    '.kl-eule-tafel b{display:block;font:500 13px/1.35 var(--mono,"JetBrains Mono",monospace);letter-spacing:1.2px;text-transform:uppercase;color:var(--muted,#9a9a93)}',
    '.kl-eule-tafel b i{display:block;margin-top:3px;font:600 24px/1.05 var(--disp,Oswald,"Arial Narrow",sans-serif);font-style:normal;letter-spacing:.6px;color:var(--sh,#22e3e8);text-shadow:0 0 18px rgba(' + TUERKIS + ',.35)}',
    '.kl-eule-tafel em{display:block;margin-top:10px;font:700 11.5px/1 var(--mono,"JetBrains Mono",monospace);font-style:normal;letter-spacing:1.4px;text-transform:uppercase;color:var(--sh2,#a2f4f3)}',
    '@media (prefers-reduced-motion:reduce){.kl-eule-tafel{transition:opacity .16s,visibility 0s .2s;scale:1}.kl-eule.offen .kl-eule-tafel{transition:opacity .16s,visibility 0s}}'
  ].join('\n');

  // ---------------------------------------------------------------- Hilfen
  function klemme(x, a, b) { return x < a ? a : x > b ? b : x; }
  function weich(a, b, x) { x = klemme((x - a) / (b - a), 0, 1); return x * x * (3 - 2 * x); }
  function misch(a, b, f) { return a + (b - a) * f; }
  function kurve(punkte, x) {         // Stützpunkte [x, y], dazwischen weich
    if (x <= punkte[0][0]) return punkte[0][1];
    for (var i = 1; i < punkte.length; i++) {
      if (x <= punkte[i][0]) {
        var f = (x - punkte[i - 1][0]) / (punkte[i][0] - punkte[i - 1][0]);
        return misch(punkte[i - 1][1], punkte[i][1], f * f * (3 - 2 * f));
      }
    }
    return punkte[punkte.length - 1][1];
  }
  function catmull(a, b, c, d, t) {
    return 0.5 * (2 * b + (c - a) * t + (2 * a - 5 * b + 4 * c - d) * t * t + (3 * b - a - 3 * c + d) * t * t * t);
  }
  function speicher(name, wert) {
    try {
      if (wert === undefined) return sessionStorage.getItem(name);
      sessionStorage.setItem(name, wert);
    } catch (e) { /* privates Fenster: dann eben ohne Merken */ }
    return null;
  }
  function hoechstens(versprechen, ms, sonst) {
    return Promise.race([Promise.resolve(versprechen), new Promise(function (ok) { setTimeout(function () { ok(sonst); }, ms); })]);
  }
  function pause() {                  // dem Browser kurz Luft lassen (keine langen Tasks)
    return window.scheduler && scheduler.yield ? scheduler.yield() : new Promise(function (ok) { setTimeout(ok, 0); });
  }
  function bild(url, leise) {
    return new Promise(function (ok, fehler) {
      var b = new Image();
      b.decoding = 'async';
      if (leise) b.fetchPriority = 'low';
      // decode() kann in einem Fenster im Hintergrund hängen bleiben: höchstens kurz darauf warten
      b.onload = function () { hoechstens(b.decode ? b.decode().catch(function () {}) : null, 1200).then(function () { ok(b); }); };
      b.onerror = function () { fehler(new Error('Bild fehlt: ' + url)); };
      b.src = url;
    });
  }
  // Die Glut kommt als gewöhnliches Bild auf Schwarz (so ist die Datei 20-mal kleiner als mit Transparenz).
  // Einmal beim Laden: Schwarz wird durchsichtig, Deckkraft = Helligkeit. In Streifen zu 48 Zeilen mit Pausen dazwischen.
  function glutTafel(b) {
    var c = document.createElement('canvas');
    c.width = b.naturalWidth; c.height = b.naturalHeight;
    var x = c.getContext('2d', { willReadFrequently: true });
    x.drawImage(b, 0, 0);
    var y = 0;
    function streifen() {
      if (y >= c.height) {
        return window.createImageBitmap ? hoechstens(createImageBitmap(c).catch(function () { return c; }), 1200, c) : c;
      }
      var hh = Math.min(48, c.height - y), d = x.getImageData(0, y, c.width, hh), p = d.data;
      for (var i = 0; i < p.length; i += 4) {
        var a = Math.max(p[i], p[i + 1], p[i + 2]);
        if (a < 6) { p[i + 3] = 0; continue; }
        var f = 255 / a;
        p[i] *= f; p[i + 1] *= f; p[i + 2] *= f; p[i + 3] = a;
      }
      x.putImageData(d, 0, y);
      y += hh;
      return pause().then(streifen);
    }
    return streifen();
  }
  // Glut im Hintergrund-Thread (glut.js neben eule.js) aufbereiten; wo das nicht geht, gestückelt hier
  var arbeiter = null, auftraege = {}, auftragNr = 0;
  var ARBEITER_URL = skript && skript.src ? skript.src.replace(/eule\.js(\?.*)?$/, 'glut.js') : '';
  function glutLaden(url, leise) {
    var hier = function () { return bild(url, leise).then(glutTafel); };
    if (!ARBEITER_URL || !window.Worker || !window.OffscreenCanvas || !window.createImageBitmap) return hier();
    try {
      if (!arbeiter) {
        arbeiter = new Worker(ARBEITER_URL);
        arbeiter.onmessage = function (e) {
          var a = auftraege[e.data.id]; delete auftraege[e.data.id];
          if (a) { if (e.data.bild) a[0](e.data.bild); else a[1](new Error(e.data.fehler)); }
        };
        arbeiter.onerror = function () {   // Thread lässt sich nicht starten: alle offenen Aufträge hier erledigen
          var offen = auftraege; auftraege = {}; arbeiter = null; ARBEITER_URL = '';
          for (var k in offen) offen[k][1](new Error('kein Hintergrund-Thread'));
        };
      }
      return new Promise(function (ok, fehler) {
        var i = ++auftragNr;
        auftraege[i] = [ok, fehler];
        arbeiter.postMessage({ id: i, url: new URL(url, location.href).href });
      }).catch(hier);
    } catch (e) { return hier(); }
  }
  // Bildtafeln als ImageBitmap: der Browser dekodiert sie im Hintergrund. Mit <img> und decode() dekodierte die
  // Zeichenfläche die grosse Tafel beim ersten Zeichnen nochmals auf dem Hauptthread (langer Task, Lighthouse 14.11.).
  function tafel(url, leise) {
    if (!window.createImageBitmap) return bild(url, leise);
    return fetch(url, { priority: 'low' }).then(function (r) {
      if (!r.ok) throw new Error('Bild fehlt: ' + url);
      return r.blob();
    }).then(function (b) { return createImageBitmap(b); })
      .catch(function () { return bild(url, leise); });
  }
  function satz(pfad, stufe, leise) { // daten-Nx.json und die Tafeln dazu laden
    return fetch(pfad + 'daten-' + stufe + 'x.json', leise ? { priority: 'low' } : undefined).then(function (r) {
      if (!r.ok) throw new Error('Daten fehlen: ' + pfad);
      return r.json();
    }).then(function (d) {
      return Promise.all([
        Promise.all(d.seiten.b.map(function (n) { return tafel(pfad + n, leise); })),
        Promise.all(d.seiten.g.map(function (n) { return glutLaden(pfad + n, leise); }))
      ]).then(function (s) { d.tafel = { b: s[0], g: s[1] }; return d; });
    });
  }
  function istHandy(vw) { return vw < 700 || (window.matchMedia && matchMedia('(pointer:coarse)').matches && vw < 900); }
  // Höhe der sitzenden Eule (CSS-Pixel): am Handy 88, sonst so gross, dass sie in den freien Rand neben der Seite passt,
  // zwischen 100 und 156. Darunter weicht sie aus (siehe ausweichen).
  function sitzHoehe(vw) {
    if (istHandy(vw)) return 88;
    var p = document.querySelector('.page'), frei = 0;
    if (p) frei = vw - p.getBoundingClientRect().right + 26;
    return Math.round(klemme((frei - 20) / 0.92, 100, 156));
  }

  // ---------------------------------------------------------------- Eule
  function Eule() {
    this.T = 0;                       // Zeit seit dem Start (s)
    this.zustand = 'laden';           // laden, flug, wach, abflug, fort, weg
    this.glut = 0;                    // Leuchtstärke der Augen, 1 = voll
    this.blitz = -9;                  // Zeitpunkt des letzten Blitzes
    this.gier = 0; this.nick = 0;     // Blick jetzt
    this.zielGier = 0; this.zielNick = 0;
    this.zeiger = null;               // letzter Ort des Mauszeigers
    this.zeigerZeit = -99;
    this.naechstesBlinzeln = 3;
    this.blinzelStart = -9; this.blinzelDoppelt = false;
    this.naechsterBlick = 6;
    this.offen = false;
    this.einblenden = 1;
    this.zufall = 12345;
    this.sink = 0; this.sinkZiel = 0; this.sinkV = 0;   // Ausweichen: so weit (px) sitzt sie unter dem Fensterrand
    this.pruefen = true; this.geprueft = -9;
    this.zeichen = '';
  }
  var P = Eule.prototype;

  P.wuerfeln = function () {          // eigener Zufall: wiederholbar für Standbilder
    this.zufall = (this.zufall * 1664525 + 1013904223) >>> 0;
    return this.zufall / 4294967296;
  };

  P.bauen = function () {
    var st = document.createElement('style');
    st.textContent = CSS;
    document.head.appendChild(st);
    var w = this.wurzel = document.createElement('div');
    w.className = 'kl-eule';
    w.innerHTML =
      '<div class="kl-eule-schein" aria-hidden="true"></div>' +
      '<div class="kl-eule-schatten" aria-hidden="true"></div>' +
      '<canvas aria-hidden="true"></canvas>' +
      '<button type="button" class="kl-eule-knopf" aria-expanded="false" aria-controls="kl-eule-tafel" aria-label="Eule: Neu bei KohliLab ist Smart Home. Hinweis zeigen"></button>' +
      '<a class="kl-eule-tafel" id="kl-eule-tafel" tabindex="-1"><b>Neu bei KohliLab: <i>Smart Home</i></b> <em>Entdecken →</em></a>' +
      '<button type="button" class="kl-eule-zu" aria-label="Eule für diesen Besuch ausblenden">×</button>';
    this.schein = w.children[0]; this.schatten = w.children[1];
    this.cv = w.children[2]; this.knopf = w.children[3]; this.tafel = w.children[4]; this.zu = w.children[5];
    this.tafel.href = K.ziel;
    this.cx = this.cv.getContext('2d');
    document.body.appendChild(w);
    this.bedienelemente();
    var ich = this;
    this.knopf.addEventListener('click', function () { ich.klick(); });
    this.knopf.addEventListener('pointerenter', function () { ich.nah = true; ich.wurzel.classList.add('nah'); });
    this.knopf.addEventListener('pointerleave', function () { ich.nah = false; ich.zeitNah = ich.T; });
    this.zu.addEventListener('pointerenter', function () { ich.nah = true; });
    this.zu.addEventListener('click', function () { ich.ausblenden(); });
    window.addEventListener('pointermove', function (e) {
      if (e.pointerType === 'touch') return;
      ich.zeiger = [e.clientX, e.clientY]; ich.zeigerZeit = ich.T;
    }, { passive: true });
    window.addEventListener('keydown', function (e) { if (e.key === 'Escape' && ich.offen) { ich.tafelZeigen(false); ich.knopf.focus(); } });
    document.addEventListener('pointerdown', function (e) {
      if (ich.offen && !ich.wurzel.contains(e.target)) ich.tafelZeigen(false);
    }, { passive: true });
    var neu = function () { ich.mass(); ich.pruefen = true; ich.zeichnen(true); };
    window.addEventListener('resize', neu, { passive: true });
    if (window.visualViewport) window.visualViewport.addEventListener('resize', neu, { passive: true });
    window.addEventListener('scroll', function () { ich.pruefen = true; }, { passive: true });
    // Abflug bei Klick auf einen Link zu einer anderen Seite dieser Website (nicht bei neuen Tabs, Downloads, extern)
    document.addEventListener('click', function (e) {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      var a = e.target && e.target.closest ? e.target.closest('a[href]') : null;
      if (!a || (a.target && a.target !== '_self') || a.hasAttribute('download')) return;
      var url;
      try { url = new URL(a.href, location.href); } catch (f) { return; }
      if (url.origin !== location.origin || !/^https?:$/.test(url.protocol)) return;
      if (url.pathname === location.pathname && url.search === location.search) return;   // Anker auf dieser Seite
      ich.abfliegen(url.href, e);
    });
    // Zurück auf die Startseite aus dem Zwischenspeicher (Zurück-Knopf): sie sitzt wieder da
    window.addEventListener('pageshow', function (e) {
      if (!e.persisted) return;
      if (ich.zustand === 'abflug' || ich.zustand === 'fort') ich.zurueck();
      else { window.klUebergang = false; ich.cv.style.viewTransitionName = ''; }
    });
  };

  P.bedienelemente = function () {    // alle Bedienelemente der Seite, ausser den eigenen
    var ich = this;
    this.bedien = Array.prototype.filter.call(document.querySelectorAll(BEDIEN), function (el) { return !ich.wurzel.contains(el); });
  };

  // Fenster ausmessen: Grösse der Eule, Landeplatz, Umrechnung Bühne -> Fenster
  P.mass = function () {
    var vw = document.documentElement.clientWidth, vh = window.innerHeight;
    var handy = istHandy(vw);
    var sitz = sitzHoehe(vw);
    var B = this.blickD, F = this.flugD, A = this.abflugD;
    var fuss = F ? F.fuss : this.fussMerk || [1490, 900];
    var k = sitz / B.sitz;
    var m = this.m = { vw: vw, vh: vh, k: k, kx: vw / B.buehne[0], ky: vh / B.buehne[1], sitz: sitz, handy: handy, fu: fuss[0], fv: fuss[1] };
    // dicht in die Ecke: je näher am Rand, desto weniger Inhalt liegt unter ihr
    var randX = Math.min((B.buehne[0] - fuss[0]) * k, sitz * 0.5 + (handy ? 6 : 12));
    m.lx = Math.round(vw - randX);
    m.ly = vh;
    this.wurzel.classList.toggle('handy', handy);
    // Zeichenfläche: so gross wie der grösste Ausschnitt um die Körpermitte
    var weit = 0, i, e, quellen = [];
    function dazu(D) { for (var j = 0; j < D.b.length; j++) { quellen.push([D.b[j], D.bahn[j]]); quellen.push([D.g[j], D.bahn[j]]); } }
    if (this.zustand !== 'wach' && F) dazu(F);
    if (A) dazu(A);
    for (i = 0; i < B.bilder.length; i++) { quellen.push([B.bilder[i].b, [B.bilder[i].u, B.bilder[i].v]]); quellen.push([B.bilder[i].g, [B.bilder[i].u, B.bilder[i].v]]); }
    for (i = 0; i < quellen.length; i++) {
      e = quellen[i][0]; if (!e) continue;
      var c = quellen[i][1];
      weit = Math.max(weit, c[0] - e[5], e[5] + e[7] - c[0], c[1] - e[6], e[6] + e[8] - c[1]);
    }
    var seite = Math.ceil(weit * k * 2 * 1.06) + 6;
    var dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    if (this.seite !== seite || this.dpr !== dpr) {
      this.seite = seite; this.dpr = dpr;
      this.cv.width = this.cv.height = Math.round(seite * dpr);
      this.cv.style.width = this.cv.style.height = seite + 'px';
      this.zeichen = '';              // neue Grösse löscht die Zeichenfläche: beim nächsten Bild sicher neu zeichnen
    }
    // Ruhelage der Körpermitte (aus dem Blick-Raster: Bild «geradeaus»)
    // Massgebend ist die sichtbare Unterkante der Füsse, nicht der gedachte Fusspunkt: die Eule steht genau auf der Kante.
    var b0 = this.blickBild(0, 0);
    m.rx = m.lx + (b0.u - B.fuss[0]) * k;
    m.ry = m.ly - (b0.b[6] + b0.b[8] - b0.v) * k;
    m.df = 0;
    if (F) { var le = F.b[F.marken.ende]; m.df = le[6] + le[8] - F.fuss[1]; }
    m.dfA = 0;
    if (A) { var a0 = A.b[0]; m.dfA = a0[6] + a0[8] - A.fuss[1]; }
    // Luft im Seitenfuss: nur nötig, wenn sie über der Seite sitzt (nicht im freien Rand daneben)
    var p = document.querySelector('.page');
    var ueber = !p || m.lx - sitz * 0.5 < p.getBoundingClientRect().right - 26;
    document.documentElement.style.setProperty('--kl-eule-luft', ueber ? (sitz + 14) + 'px' : '0px');
    this.bedienung();
  };

  // Bühne -> Fenster. Fern vom Landeplatz folgt die Bahn dem Seitenverhältnis des Fensters, nah am Landeplatz dem Massstab
  // der Eule: so sitzt sie am Ende genau auf der Kante, egal wie breit oder hoch das Fenster ist.
  P.ort = function (u, v, df) {
    var m = this.m, du = u - m.fu, dv = v - m.fv;
    var f = weich(150, 620, Math.sqrt(du * du + dv * dv));
    return [m.lx + du * misch(m.k, m.kx, f), m.ly + (dv - df) * misch(m.k, m.ky, f)];
  };

  P.blickBild = function (gi, ni) {   // Bild aus dem Raster nach Index (0 = Mitte)
    var B = this.blickD, ng = B.gier.length, nn = B.nick.length;
    return B.bilder[klemme(ni + (nn >> 1), 0, nn - 1) * ng + klemme(gi + (ng >> 1), 0, ng - 1)];
  };

  // ---------------------------------------------------------------- Zeichnen
  P.lage = function (d, e, cu, cv, r, alpha, modus) {
    // e: [Seite, x, y, b, h in der Tafel; x, y, b, h auf der Bühne]; (cu, cv): Körpermitte dieses Bildes auf der Bühne
    if (!e || alpha <= 0.003) return;
    var c = this.cx, k = this.m.k * r, h = this.seite / 2;
    c.globalCompositeOperation = modus;
    c.globalAlpha = Math.min(alpha, 1);
    c.drawImage(modus === 'screen' ? d.tafel.g[e[0]] : d.tafel.b[e[0]], e[1], e[2], e[3], e[4],
      h + (e[5] - cu) * k, h + (e[6] - cv) * k, e[7] * k, e[8] * k);
    if (alpha > 1) this.lage(d, e, cu, cv, r, alpha - 1, modus);   // Blitz: heller als voll
  };

  // Ein Bild aus einer Bildfolge (Anflug oder Abflug) an der Stelle x (Bildnummer, mit Bruchteil) zeichnen.
  // Rückgabe: Körpermitte im Fenster, Grösse s und «hoch» (wie weit vor der Seite) für Schatten und Schein.
  P.folge = function (F, x, df, deck, glut, fern) {
    var ende = F.bahn.length - 1;
    x = klemme(x, 0, ende);
    var i = Math.min(Math.round(x), ende), i0 = Math.min(Math.floor(x), ende - 1), t = x - i0, bn = F.bahn;
    var a = bn[Math.max(i0 - 1, 0)], b = bn[i0], d = bn[i0 + 1], e = bn[Math.min(i0 + 2, ende)];
    var u = catmull(a[0], b[0], d[0], e[0], t), v = catmull(a[1], b[1], d[1], e[1], t);
    var s = Math.exp(catmull(Math.log(a[2]), Math.log(b[2]), Math.log(d[2]), Math.log(e[2]), t));
    var o = this.ort(u, v, df), r = s / bn[i][2];
    deck *= weich(0.03, 0.11, s);                             // taucht aus der Tiefe auf / verschwindet in ihr
    this.lage(F, F.b[i], bn[i][0], bn[i][1], r, deck, 'source-over');
    this.lage(F, F.g[i], bn[i][0], bn[i][1], r, glut * deck * (1 + 1.6 * fern(s)), 'screen');
    return { x: o[0], y: o[1], s: s, hoch: misch(b[3], d[3], t), deck: deck };
  };

  P.zeichnen = function (immer) {
    if (!this.m || this.zustand === 'laden' || this.zustand === 'weg' || this.zustand === 'fort') return;
    var m = this.m, F = this.flugD, B = this.blickD, A = this.abflugD;
    var glut = this.glut * this.blinzeln() * this.blitzen();
    var ruht = this.zustand === 'wach';
    if (ruht && !immer) {             // sitzt still: nur neu zeichnen, wenn sich etwas sichtbar ändert
      var zeichen = [Math.round(this.gier * 8), Math.round(this.nick * 8), Math.round(glut * 160), Math.round(this.sink), Math.round(this.einblenden * 60)].join();
      if (zeichen === this.zeichen) return;
      this.zeichen = zeichen;
    }
    var c = this.cx;
    c.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    c.globalCompositeOperation = 'source-over'; c.globalAlpha = 1;
    c.clearRect(0, 0, this.seite, this.seite);
    var ox, oy, s = 1, hoch = 0, deck = this.einblenden, weit = 0;
    var fern = function (s) { return 1 - weich(0.08, 0.5, s); };

    if (this.zustand === 'flug') {
      var fps = F.fps, mk = F.marken, tRuhe = mk.ruhe / fps;
      var film = this.T <= tRuhe ? this.T : this.T <= tRuhe + HALT ? tRuhe : this.T - HALT;
      var x = klemme(film * fps, 0, mk.ende);
      var r = this.folge(F, x, m.df, deck, glut, fern);
      ox = r.x; oy = r.y; s = r.s; hoch = r.hoch; weit = fern(s);
      // Übergang ins Blick-Raster am Ende der Drehung
      var rest = (mk.ende - x) / fps;
      if (rest < 0.12) {
        var f = 1 - rest / 0.12, b0 = this.blickBild(0, 0);
        this.lage(B, b0.b, b0.u, b0.v, 1 / b0.s, f, 'source-over');
        this.lage(B, b0.g, b0.u, b0.v, 1 / b0.s, glut * f, 'screen');
        ox = misch(ox, m.rx, f); oy = misch(oy, m.ry, f);
      }
    } else if (this.zustand === 'abflug') {
      var xa = this.tA * A.fps;
      // die ersten Hundertstel: vom Blick-Raster (Blick dorthin, wo sie gerade hinschaut) ins erste Bild des Abflugs
      var ueber = 1 - weich(0, 0.07, this.tA);
      if (ueber > 0) this.rasterZeichnen(ueber * deck, glut * ueber);
      var ra = this.folge(A, xa, m.dfA, deck * (1 - ueber), glut * (1 - ueber), fern);
      ox = misch(ra.x, m.rx, ueber); oy = misch(ra.y, m.ry, ueber); s = ra.s; hoch = ra.hoch; deck = ra.deck;
      oy += this.sink;
    } else {                                                    // wach: Blick aus dem Raster
      this.rasterZeichnen(deck, glut);
      ox = m.rx; oy = m.ry + this.sink;
    }

    var px = ruht ? Math.round(ox - this.seite / 2) : ox - this.seite / 2, py = ruht ? Math.round(oy - this.seite / 2) : oy - this.seite / 2;
    this.cv.style.transform = 'translate3d(' + px + 'px,' + py + 'px,0)';
    this.cv.style.opacity = this.einblenden.toFixed(3);

    // Schatten auf der Seite: je weiter die Eule vor der Seite schwebt, desto weiter versetzt, grösser und blasser
    var vorn = Math.max(hoch, 0), gr = m.sitz * s;
    var sb = gr * (1.05 + 1.5 * vorn), sh = sb * (ruht || hoch === 0 ? 0.9 : 0.8);
    var sx = ox + gr * (0.10 + 0.9 * vorn) - sb / 2, sy = oy + gr * (0.10 + 1.25 * vorn) - sh / 2;
    this.schatten.style.width = sb.toFixed(1) + 'px'; this.schatten.style.height = sh.toFixed(1) + 'px';
    this.schatten.style.transform = 'translate3d(' + sx.toFixed(1) + 'px,' + sy.toFixed(1) + 'px,0)';
    this.schatten.style.opacity = (deck * weich(-2.2, -0.25, hoch) * 0.9 / (1 + 2.2 * vorn)).toFixed(3);
    // türkiser Widerschein der Augen auf der Seite
    var wb = Math.max(gr * 3.1, 34 * weit);
    this.schein.style.width = this.schein.style.height = wb.toFixed(1) + 'px';
    this.schein.style.transform = 'translate3d(' + (ox - wb / 2).toFixed(1) + 'px,' + (oy - gr * 0.16 - wb / 2).toFixed(1) + 'px,0)';
    this.schein.style.opacity = (Math.min(glut * (1 + 2.2 * weit), 2.4) * 0.5 * this.einblenden * (this.zustand === 'abflug' ? deck : 1)).toFixed(3);
  };

  P.rasterZeichnen = function (deck, glut) {   // sitzende Eule: zwischen vier Blickrichtungen gemischt
    var B = this.blickD;
    var gs = B.gier[1] - B.gier[0], ns = B.nick[1] - B.nick[0];
    var gx = klemme(this.gier / gs, -(B.gier.length >> 1), B.gier.length >> 1), nx = klemme(this.nick / ns, -(B.nick.length >> 1), B.nick.length >> 1);
    var g0 = Math.floor(gx), n0 = Math.floor(nx), fx = gx - g0, fy = nx - n0;
    var a3 = fx * fy, a2 = (1 - fx) * fy / Math.max(1 - a3, 1e-6), a1 = fx * (1 - fy) / Math.max((1 - a2) * (1 - a3), 1e-6);
    var vier = [[g0, n0, 1, (1 - fx) * (1 - fy)], [g0 + 1, n0, a1, fx * (1 - fy)], [g0, n0 + 1, a2, (1 - fx) * fy], [g0 + 1, n0 + 1, a3, fx * fy]];
    var j, q;
    for (j = 0; j < 4; j++) { q = this.blickBild(vier[j][0], vier[j][1]); this.lage(B, q.b, q.u, q.v, 1 / q.s, vier[j][2] * deck, 'source-over'); }
    for (j = 0; j < 4; j++) { q = this.blickBild(vier[j][0], vier[j][1]); this.lage(B, q.g, q.u, q.v, 1 / q.s, glut * vier[j][3] * deck, 'screen'); }
  };

  P.blinzeln = function () {          // Faktor 0…1: die LED hinter den Augen setzt kurz aus
    var d = this.T - this.blinzelStart;
    if (d < 0 || d > 0.26) return 1;
    return kurve([[0, 1], [0.06, 0.07], [0.12, 0.07], [0.26, 1]], d);
  };

  P.blitzen = function () {           // Faktor > 1 kurz nach dem Klick
    var d = this.T - this.blitz;
    if (d < 0 || d > 0.9) return 1;
    return 1 + kurve([[0, 0], [0.035, 2.1], [0.11, 0.5], [0.17, 1.5], [0.42, 0.35], [0.9, 0]], d);
  };

  // ---------------------------------------------------------------- Ausweichen
  // Nie über Bedienelementen: liegt ein Link, Knopf oder Feld unter ihr (samt X), duckt sie sich hinter den unteren
  // Fensterrand, bis sein unterer Rand frei ist. Bleibt dann weniger als etwa die Hälfte sichtbar (die Augen wären
  // weg), taucht sie ganz ab. Hat sie selbst den Fokus (Tastatur), bleibt sie stehen.
  P.hindernisse = function () {       // Bedienelemente unter der Eule (samt X): [Element, Unterkante + Abstand]
    var m = this.m, aus = [];
    var b = m.sitz * 0.92, h = m.sitz, x0 = m.lx - b / 2 - 22, x1 = m.lx + b / 2 + 4, y0 = m.ly - h - 18;
    for (var i = 0; i < this.bedien.length; i++) {
      var r = this.bedien[i].getBoundingClientRect();
      if (!r.width || !r.height) continue;
      if (r.right > x0 && r.left < x1 && r.bottom + 8 > y0 && r.top < m.vh) aus.push([this.bedien[i], r.bottom + 8]);
    }
    return { y0: y0, liste: aus };
  };

  P.ausweichen = function () {
    var m = this.m;
    if (!m || this.zustand !== 'wach') return;
    var h = m.sitz, hi = this.hindernisse(), y0 = hi.y0, tiefste = -1;
    for (var i = 0; i < hi.liste.length; i++) tiefste = Math.max(tiefste, hi.liste[i][1]);
    var ziel = 0;
    if (tiefste >= 0) {
      ziel = klemme(tiefste - y0, 0, h);
      if (h - ziel < h * 0.5) ziel = h * 1.18;                  // nur noch Ohren? Dann lieber ganz weg (samt Schein)
    }
    if (this.wurzel.contains(document.activeElement) && document.activeElement !== document.body) ziel = 0;
    if (Math.abs(ziel - this.sinkZiel) > 3) this.sinkZiel = ziel;
    if (ziel > 0 && this.offen) this.tafelZeigen(false);
  };

  P.sinkSchritt = function (dt) {     // gedämpfte Feder, bei «weniger Bewegung» ohne Gleiten
    if (this.ruhig) { this.sink = this.sinkZiel; return; }
    var om = 15, d = this.sinkZiel - this.sink;
    this.sinkV += (om * om * d - 2 * om * this.sinkV) * dt;
    this.sink += this.sinkV * dt;
    if (Math.abs(d) < 0.3 && Math.abs(this.sinkV) < 2) { this.sink = this.sinkZiel; this.sinkV = 0; }
  };

  // ---------------------------------------------------------------- Ablauf
  P.schritt = function (dt) {
    if (this.zustand === 'laden' || this.zustand === 'weg' || this.zustand === 'fort') return;
    this.T += dt;
    var T = this.T;
    if (this.einblendDauer) this.einblenden = klemme(T / this.einblendDauer, 0, 1);
    if (this.zustand === 'flug') {
      var F = this.flugD, fps = F.fps, tR = F.marken.ruhe / fps;
      // Augen: glimmen schon im Anflug, nach dem Nachfedern glühen sie voll auf
      var grund = F.glut_flug ? F.glut_flug * weich(0.0, 0.5, T) * (0.86 + 0.14 * Math.sin(T * 9.0) * Math.sin(T * 2.3)) : 0;
      if (T < tR + 0.05) this.glut = grund;
      else this.glut = Math.max(grund * (1 - weich(0, 0.2, T - tR)), kurve([[0, 0], [0.26, 0.14], [0.40, 0.07], [0.60, 1.16], [0.76, 1]], T - tR - 0.05));
      if (T >= tR + HALT + (F.marken.ende - F.marken.ruhe) / fps) this.aufwachen();
    } else if (this.zustand === 'abflug') {
      this.tA += dt;
      if (this.tA >= (this.abflugD.bahn.length - 1) / this.abflugD.fps + 0.05) { this.zustand = 'fort'; this.wurzel.style.visibility = 'hidden'; }
    } else if (this.zustand === 'wach') {
      if (!this.ruhig) {
        // Blick: dem Mauszeiger nach; ohne Zeiger ab und zu ein Blick zur Seite
        var m = this.m;
        if (this.zeiger && T - this.zeigerZeit < 4.5) {
          this.zielGier = klemme((this.zeiger[0] - m.rx) / (m.vw * 0.42), -1, 1) * GIER_MAX;
          this.zielNick = klemme((this.zeiger[1] - (m.ry - m.sitz * 0.2)) / (m.vh * 0.5), -1, 1) * NICK_MAX;
        } else if (T > this.naechsterBlick) {
          var weg = this.zielGier === 0 && this.zielNick === 0;
          this.zielGier = weg ? (this.wuerfeln() * 2 - 1) * GIER_MAX * 0.8 * -1 * (this.wuerfeln() < 0.75 ? 1 : -1) : 0;
          this.zielNick = weg ? (this.wuerfeln() * 2 - 1) * NICK_MAX * 0.6 : 0;
          this.naechsterBlick = T + (weg ? 1.2 + this.wuerfeln() * 1.4 : 4 + this.wuerfeln() * 5);
        } else if (this.zeiger && T - this.zeigerZeit >= 4.5 && T - this.zeigerZeit < 4.6) { this.zielGier = 0; this.zielNick = 0; }
        var nach = 1 - Math.exp(-dt / 0.16);
        this.gier += (this.zielGier - this.gier) * nach;
        this.nick += (this.zielNick - this.nick) * nach;
        // Blinzeln
        if (T > this.naechstesBlinzeln) {
          this.blinzelStart = T;
          if (!this.blinzelDoppelt && this.wuerfeln() < 0.22) { this.blinzelDoppelt = true; this.naechstesBlinzeln = T + 0.34; }
          else { this.blinzelDoppelt = false; this.naechstesBlinzeln = T + 2.8 + this.wuerfeln() * 4.2; }
        }
      }
      var soll = (this.ruhig ? 0.94 : 0.94 + 0.05 * Math.sin(T * 1.25)) + (this.nah ? 0.12 : 0);
      this.glut += (soll - this.glut) * (1 - Math.exp(-dt / 0.2));
      if (!this.nah && this.zeitNah !== undefined && T - this.zeitNah > 1.2 && !this.offen) { this.wurzel.classList.remove('nah'); this.zeitNah = undefined; }
      // Ausweichen: höchstens zehnmal je Sekunde prüfen, und nur wenn gescrollt oder die Grösse geändert wurde
      if (this.pruefen && T - this.geprueft > 0.1) { this.pruefen = false; this.geprueft = T; this.ausweichen(); }
      var vorher = this.sink;
      this.sinkSchritt(dt);
      if (vorher !== this.sink) this.bedienung();
      this.wurzel.classList.toggle('versteckt', this.sink > this.m.sitz * 0.98);
    }
    this.zeichnen();
  };

  P.aufwachen = function () {
    this.zustand = 'wach';
    this.wurzel.classList.add('wach');
    this.naechstesBlinzeln = this.T + 1.6;
    this.naechsterBlick = this.T + 3.5;
    this.mass();
    this.pruefen = true;
    this.abflugLaden();
  };

  P.abflugLaden = function () {       // Abflug-Bilder erst holen, wenn sie sitzt und der Browser Leerlauf hat
    var ich = this;
    if (this.ruhig || !K.abflug || this.abflugD || this.abflugLaeuft) return;
    this.abflugLaeuft = true;
    var los = function () {
      satz(K.abflug, ich.stufe, true).then(function (d) { ich.abflugD = d; ich.mass(); ich.zeichnen(true); })
        .catch(function (e) { if (window.console) console.warn('[eule]', e.message); });
    };
    if ('requestIdleCallback' in window) requestIdleCallback(los, { timeout: 4000 }); else setTimeout(los, 1200);
  };

  P.bedienung = function () {         // Klickfläche, X und Hinweistafel an die Eule setzen
    var m = this.m, b = m.sitz * 0.92, h = Math.max(m.sitz - this.sink, 0);
    var x = m.lx - b / 2, y = m.ly - h;
    this.knopf.style.width = b + 'px'; this.knopf.style.height = h + 'px';
    this.knopf.style.transform = 'translate(' + x + 'px,' + y + 'px)';
    this.zu.style.transform = 'translate(' + klemme(x - 20, 4, m.vw - 34) + 'px,' + Math.max(y - 16, 4) + 'px)';
    // Tafel: neben der Eule zur Seitenmitte hin, auf dem Handy darüber
    var t = this.tafel, tb = t.offsetWidth, th = t.offsetHeight, tx, ty;
    if (m.handy) {
      tx = klemme(x + b - tb, 12, m.vw - tb - 12); ty = y - th - 14;
      t.style.setProperty('--ux', '80%'); t.style.setProperty('--uy', '100%');
    } else {
      tx = x - tb - 16; ty = y + h * 0.16;
      t.style.setProperty('--ux', '100%'); t.style.setProperty('--uy', '40%');
    }
    t.style.left = Math.round(tx) + 'px'; t.style.top = Math.round(Math.max(ty, 8)) + 'px';
  };

  P.klick = function () {
    this.blitz = this.T;
    this.tafelZeigen(!this.offen);
  };

  P.tafelZeigen = function (an) {
    this.offen = an;
    this.wurzel.classList.toggle('offen', an);
    this.knopf.setAttribute('aria-expanded', an ? 'true' : 'false');
    this.tafel.tabIndex = an ? 0 : -1;
    if (an) this.bedienung();
  };

  P.ausblenden = function () {
    this.zustand = 'weg';
    this.wurzel.style.transition = 'opacity .25s';
    this.wurzel.style.opacity = '0';
    var w = this.wurzel;
    setTimeout(function () { w.style.display = 'none'; }, 260);
    if (K.merken) speicher('kl_eule_zu', '1');
  };

  // Abflug beim Verlassen der Startseite über einen Link. Ohne Flug (weniger Bewegung, noch im Anflug, abgetaucht,
  // Bilder noch nicht da) läuft die Seite normal weiter, und der Übergang blendet die Eule nur sanft aus.
  P.abfliegen = function (ziel, e) {
    if (this.zustand === 'laden' || this.zustand === 'weg' || this.zustand === 'fort' || this.zustand === 'abflug') return;
    window.klUebergang = true;                                 // Übergang zwischen den Seiten erlauben (BaseLayout)
    this.cv.style.viewTransitionName = 'kl-eule';
    var fliegen = !this.ruhig && this.abflugD && this.zustand === 'wach' && this.sink < this.m.sitz * 0.3 &&
      document.visibilityState === 'visible';
    if (!fliegen) return;
    e.preventDefault();
    try {                                                       // Seite schon holen, während sie abhebt
      var l = document.createElement('link');
      l.rel = 'prefetch'; l.href = ziel;
      document.head.appendChild(l);
    } catch (f) { /* egal */ }
    this.tafelZeigen(false);
    this.wurzel.classList.remove('wach', 'nah');
    this.zustand = 'abflug'; this.tA = 0;
    var ich = this;
    setTimeout(function () { location.assign(ziel); }, ABFLUG_HALTEN * 1000);
    // Kam die neue Seite nicht (abgebrochen, offline): nach einer Weile sitzt sie wieder da
    this.notfall = setTimeout(function () { if (ich.zustand === 'abflug' || ich.zustand === 'fort') ich.zurueck(); }, 6000);
  };

  P.zurueck = function () {           // nach dem Zurück-Knopf oder wenn der Seitenwechsel ausblieb
    clearTimeout(this.notfall);
    window.klUebergang = false;
    this.cv.style.viewTransitionName = '';
    this.wurzel.style.visibility = '';
    this.los('sitzt');
  };

  // modus: 'flug' oder 'sitzt' oder 'ruhig'
  P.los = function (modus) {
    this.ruhig = modus === 'ruhig';
    this.T = 0; this.blitz = -9; this.gier = this.nick = this.zielGier = this.zielNick = 0;
    this.sink = this.sinkZiel = this.sinkV = 0;
    this.tafelZeigen(false);
    this.wurzel.classList.remove('wach', 'nah', 'versteckt');
    this.wurzel.style.cssText = '';
    this.zeichen = '';
    if (modus === 'flug' && this.flugD) {
      this.zustand = 'flug'; this.glut = 0; this.einblenden = 1; this.einblendDauer = 0;
      this.mass();
    } else {
      this.zustand = 'wach'; this.glut = this.ruhig ? 0.94 : 0;
      this.einblendDauer = this.ruhig ? 0 : 0.5; this.einblenden = this.ruhig ? 1 : 0;
      this.aufwachen();
      this.ausweichen(); this.sink = this.sinkZiel;   // gleich an der richtigen Stelle erscheinen, nicht hinrutschen
      this.bedienung();
    }
    this.zeichnen(true);
  };

  // ---------------------------------------------------------------- Start
  var eule = new Eule();
  function lauf() {
    var zuletzt = performance.now();
    (function runde(jetzt) {
      var dt = Math.min((jetzt - zuletzt) / 1000, 0.05);        // nach einer Pause (Tab im Hintergrund) nicht springen
      zuletzt = jetzt;
      if (!K.hand && dt > 0) eule.schritt(dt);
      if (eule.zustand !== 'weg') requestAnimationFrame(runde);
    })(zuletzt);
  }

  function start() {
    if (K.merken && speicher('kl_eule_zu') === '1') return;
    var weniger = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
    var modus = K.modus || (weniger ? 'ruhig' : speicher('kl_eule_flug') === '1' ? 'sitzt' : 'flug');
    var vw = document.documentElement.clientWidth;
    var sparen = navigator.connection && navigator.connection.saveData;
    var sitzPixel = sitzHoehe(vw) * (window.devicePixelRatio || 1);
    var stufe = eule.stufe = sparen || sitzPixel <= 215 ? 1 : 2;   // kleine Tafeln für kleine Bildschirme und Datensparmodus
    if (sparen && modus === 'flug') modus = 'sitzt';
    var laden = [satz(K.blick, stufe), modus === 'flug' ? satz(K.medien, stufe) : fetch(K.medien + 'daten-' + stufe + 'x.json').then(function (r) { return r.json(); })];
    Promise.all(laden).then(function (d) {
      eule.blickD = d[0];
      eule.flugD = modus === 'flug' ? d[1] : null;
      eule.fussMerk = d[1].fuss;
      eule.bauen();
      var los = function () {
        if (K.merken && modus === 'flug') speicher('kl_eule_flug', '1');
        eule.los(modus);
        lauf();
        document.dispatchEvent(new CustomEvent('kl-eule-bereit'));
      };
      if (document.visibilityState === 'hidden') document.addEventListener('visibilitychange', function einmal() { document.removeEventListener('visibilitychange', einmal); los(); });
      else los();
    }).catch(function (e) { if (window.console) console.warn('[eule]', e.message); });
  }

  // für Vorschau und Aufnahmen: neu starten, Uhr von Hand stellen
  window.KLEule = {
    neu: function (modus) {
      if (modus === 'flug' && !eule.flugD) { location.search = '?modus=flug'; return; }
      eule.los(modus);
    },
    vor: function (sekunden) { var n = Math.ceil(sekunden * 120); for (var i = 0; i < n; i++) eule.schritt(sekunden / n); },
    klick: function () { eule.klick(); },
    zeiger: function (x, y) { eule.zeiger = [x, y]; eule.zeigerZeit = eule.T; },
    abflug: function () { if (!eule.abflugD) return false; eule.zustand = 'abflug'; eule.tA = 0; eule.tafelZeigen(false); eule.wurzel.classList.remove('wach'); return true; },
    hindernisse: function () {
      return eule.hindernisse().liste.map(function (h) {
        var r = h[0].getBoundingClientRect();
        return h[0].tagName.toLowerCase() + (h[0].className ? '.' + String(h[0].className).split(' ').join('.') : '') + ' «' + (h[0].textContent || '').trim().slice(0, 30) + '» ' + [r.left, r.top, r.right, r.bottom].map(Math.round).join(',');
      });
    },
    stand: function () { return { zustand: eule.zustand, T: eule.T, glut: eule.glut, gier: eule.gier, sink: eule.sink, sinkZiel: eule.sinkZiel, abflug: !!eule.abflugD, m: eule.m }; }
  };

  // Erst wenn die Seite steht: frühestens 1,6 s nach dem Laden und im Leerlauf. So konkurriert die Eule nie mit dem
  // Aufbau der Seite (Text, Hero-Bild, Schriften) und kommt als Überraschung, wenn man schon liest.
  // (Wird das Skript selbst erst nach dem Laden nachgeladen wie auf kohlilab.ch, ist ein Teil der Wartezeit schon um.)
  var bereit = function () {
    if (K.hand) { start(); return; }
    var nav = performance.getEntriesByType && performance.getEntriesByType('navigation')[0];
    var geladen = nav && nav.loadEventEnd > 0 ? nav.loadEventEnd : performance.now();
    setTimeout(function () {
      if ('requestIdleCallback' in window) requestIdleCallback(start, { timeout: 2500 });
      else setTimeout(start, 350);
    }, Math.max(0, geladen + 1600 - performance.now()));
  };
  if (document.readyState === 'complete') bereit();
  else window.addEventListener('load', bereit, { once: true });
})();
