/* 3D-Druck-Übergang auf kohlilab.ch: «Schicht für Schicht» (Idee Manolo, 18.11.2026)
 *
 * Der Standard-Übergang zwischen den Seiten von kohlilab.ch, das Gegenstück zum Vorhang bei Smart Home. Ein Klick auf einen
 * Link zu einer anderen Seite dieser Website macht die alte Seite zur leeren Druckplatte: Am Klickpunkt glüht eine Düse auf
 * und fährt an den Start unten links. Dahinter wechselt der Browser die Seite. Dann druckt die Düse die neue Seite Bahn um
 * Bahn von unten nach oben, in schnellen Fahrten hin und her, mit einem Glutschweif hinter der Spitze. Feine Schichtlinien
 * liegen zuerst über der Seite und glätten sich am Schluss, die Düse hebt nach oben ab. Rund 2,4 s vom Klick bis fertig.
 *
 * Welche Links den Übergang bekommen, entscheidet das kleine Skript am Ende von BaseLayout: alle Links zu einer anderen
 * Seite dieser Website, ausser in den Bereich Smart Home (der behält den Vorhang der Eule). Es holt diese Datei erst, wenn
 * man sich einem solchen Link zuwendet oder die Seite zwei Sekunden ruhig steht, und ruft beim Klick KLDruck.start() auf.
 *
 * Dieses eine Skript läuft auf beiden Seiten:
 *   Abfahrt   Beim Klick spielt es den ersten Teil und endet in einem ruhigen Bild (dunkle Platte, Düse am Start). Dann
 *             setzt es ein Merkzeichen (sessionStorage «kl_druck») und wechselt die Seite.
 *   Ankunft   Das Skript im Kopf von BaseLayout findet das Merkzeichen, hält das ruhige Bild fest und holt dieses Skript
 *             (liegt schon im Zwischenspeicher). Es baut dasselbe Bild über der neuen Seite auf und druckt sie. Danach ist
 *             nichts mehr davon im Dokument.
 *
 * Technik: keine Zeichenfläche, kein WebGL, kein Video. Alles sind gewöhnliche Ebenen im Dokument, bewegt über die Web
 * Animations API und nur mit transform und opacity. Solche Bewegungen rechnet der Browser auf der Grafikkarte, neben dem
 * Hauptfaden: sie laufen auch dann gleichmässig, wenn die neue Seite noch lädt und rechnet.
 * Zwischen den Seiten: Browser mit Übergängen zwischen Dokumenten (Chrome, Edge, Safari ab 18.2) halten das ruhige Bild
 * fest, bis hier dasselbe Bild steht. Die anderen zeigen dazwischen dieselbe dunkle Fläche.
 * «Weniger Bewegung» und Datensparmodus: BaseLayout holt diese Datei gar nicht, die Seite blendet nur über.
 * CSP: nur 'self'; eingefügte Stilregeln deckt 'unsafe-inline', das für die Konfiguratoren schon gesetzt ist.
 *
 * Quelle: RaspiCam, zaehler/e450/gemeinsam/webseite/druck_uebergang/final/druck.js; eingebaut mit werkzeuge/einbau_druck.py
 * nach public/druck/<fassung>/. Dort ändern und neu einbauen.
 */
(function () {
  'use strict';
  if (window.KLDruck) return;
  var d = document, wurzel = d.documentElement, skript = d.currentScript;
  var BASIS = skript && skript.src ? skript.src.replace(/druck\.js(\?.*)?$/, '') : '';
  var FASSUNG = BASIS.replace(/\/$/, '').split('/').pop();
  // Übergang zwischen Dokumenten vorhanden? (?vt=aus: zum Prüfen so tun, als fehlte er, wie in Firefox)
  var VTX = typeof window.CSSViewTransitionRule === 'function' && 'onpagereveal' in window && !/[?&]vt=aus(&|$)/.test(location.search);
  var MERK = 'kl_druck';
  var PLATTE = '#0b0c0e';             // leere Druckplatte (gleich im Skript im Kopf von BaseLayout)
  var LINIEN = 'repeating-linear-gradient(180deg,rgba(0,0,0,0) 0 3px,rgba(0,0,0,.18) 3px 4px,rgba(255,255,255,.03) 4px 5px)';
  // Düse: '' = gezeichnet. Sonst ein gerendertes Bild neben diesem Skript, [Datei, Breite, Höhe, Spitze x, Spitze y] in
  // Pixeln der Darstellung (einbau_druck.py --duese setzt die Zeile).
  var DUESE = ['duese.webp', 44, 92, 22, 89];
  var laufend = [], ebenen = [], uhren = [], zustand = 'bereit', notfall = 0, bild = null, bildDa = null;
  function nix() {}

  // ---------------------------------------------------------------- Werkzeug
  function neu(css, eltern, vor) {
    var e = d.createElement('div');
    e.setAttribute('aria-hidden', 'true');
    e.style.cssText = css;
    if (eltern) eltern.insertBefore(e, vor || null);
    return e;
  }
  // Bewegung über die Web Animations API. Hier stehen nur transform und opacity: das rechnet die Grafikkarte.
  function bewege(e, bilder, wahl) { var a = e.animate(bilder, wahl); laufend.push(a); return a; }
  function nach(ms, f) { var u = setTimeout(f, ms); uhren.push(u); return u; }
  // Ebene über der ganzen Seite. Sie fängt Klicks ab: während des Übergangs soll niemand ins Unsichtbare tippen, und ein
  // zweiter, schneller Klick landet hier statt auf einem anderen Link.
  function ebene() {
    var o = neu('position:fixed;left:0;top:0;width:100%;height:100%;z-index:2147483647;overflow:hidden;contain:strict;pointer-events:auto', wurzel);
    o.setAttribute('data-kl-dr', '');                             // Kennzeichen für die Prüfwerkzeuge
    ebenen.push(o);
    return o;
  }
  function raeumen() {
    uhren.forEach(clearTimeout); uhren = [];
    laufend.forEach(function (a) { try { a.cancel(); } catch (e) { /* schon vorbei */ } }); laufend = [];
    ebenen.forEach(function (o) { if (o.parentNode) o.parentNode.removeChild(o); }); ebenen = [];
  }
  if (DUESE) {                        // gerendertes Bild der Düse: mit diesem Skript holen (also erst beim Zuwenden)
    bild = new Image();
    bild.decoding = 'async';
    bild.src = BASIS + DUESE[0];
    bildDa = new Promise(function (ok) {
      var gut = function () { (bild.decode ? bild.decode() : Promise.resolve()).then(ok, ok); };
      if (bild.complete) gut(); else { bild.onload = gut; bild.onerror = function () { bild = null; ok(); }; }
    });
  }

  // Düse von vorn: Hals, Heizblock, Messingspitze, Glut. Der Ursprung (0, 0) der äusseren Ebene ist die Spitze.
  function duese(eltern, k) {
    var aussen = neu('position:absolute;left:0;top:0;width:0;height:0;will-change:transform', eltern);
    var innen = neu('position:absolute;left:0;top:0;width:0;height:0;transform:scale(' + k + ');will-change:transform,opacity', aussen);
    neu('position:absolute;left:-84px;top:-84px;width:168px;height:168px;border-radius:50%;background:radial-gradient(closest-side,rgba(255,172,72,.5),rgba(255,107,26,.2) 42%,rgba(255,107,26,0))', innen);
    if (bild && bild.naturalWidth) {
      neu('position:absolute;left:' + (-DUESE[3]) + 'px;top:' + (-DUESE[4]) + 'px;width:' + DUESE[1] + 'px;height:' + DUESE[2] + 'px;background:url("' + bild.src + '") 0 0/100% 100% no-repeat', innen);
    } else {
      neu('position:absolute;left:-3px;top:-60px;width:6px;height:28px;background:linear-gradient(90deg,#17181a,#50545b 50%,#17181a)', innen);
      neu('position:absolute;left:-17px;top:-37px;width:34px;height:22px;border-radius:4px;background:linear-gradient(180deg,#454950,#23262b 60%,#17181b);box-shadow:inset 0 1px 0 rgba(255,255,255,.16),inset 0 -7px 10px rgba(255,107,26,.3),0 2px 8px rgba(0,0,0,.55)', innen);
      neu('position:absolute;left:-9px;top:-16px;width:18px;height:14px;background:linear-gradient(90deg,#7a4a12,#f2bb62 46%,#8a5a1c);clip-path:polygon(0 0,100% 0,64% 100%,36% 100%)', innen);
    }
    neu('position:absolute;left:-8px;top:-9px;width:16px;height:16px;border-radius:50%;background:radial-gradient(closest-side,#fff6dc,#ffc46a 48%,rgba(255,107,26,0))', innen);
    return { aussen: aussen, innen: innen, k: k };
  }
  // Glutspur hinter der Düse: oben die frische, helle Raupe, darunter die Wärme der Bahn als weicher Schweif, der nach hinten
  // und nach unten auskühlt (keine harte Kante). rechts = die Düse fährt nach rechts, das heisse Ende liegt rechts.
  function spur(rechts) {
    return 'linear-gradient(' + (rechts ? '90deg' : '270deg') + ',rgba(255,226,176,0),rgba(255,226,176,.9)) 0 0/100% 3px no-repeat,' +
      'radial-gradient(ellipse 100% 118% at ' + (rechts ? '100%' : '0') + ' 0,rgba(255,164,64,.5),rgba(255,107,26,.2) 46%,rgba(255,107,26,0))';
  }
  // Aufbau im Zustand «alles zu»: Bahnen der Platte (unten ist Bahn 0), darunter je Bahn die Glut an ihrem Ende, darüber die
  // Schichtlinien, zuoberst die Düse mit ihren zwei Glutspuren (eine je Fahrtrichtung).
  function bau(o) {
    var B = o.clientWidth, H = o.clientHeight;
    var N = Math.max(8, Math.min(14, Math.round(H / 72))), k = [], i, re;
    for (i = 0; i <= N; i++) k.push(Math.round(H - i * H / N));          // k[i] Unterkante der Bahn i, k[i + 1] ihre Oberkante
    var L = Math.round(Math.min(Math.max(B * 0.28, 150), 400)), hoch = Math.ceil(H / N) + 1;
    var gruppe = neu('position:absolute;left:0;top:0;width:100%;height:100%;will-change:opacity', o), glut = [], decke = [];
    for (i = 0; i < N; i++) {
      re = i % 2 === 0;
      glut.push(neu('position:absolute;' + (re ? 'right' : 'left') + ':0;width:' + L + 'px;top:' + k[i + 1] + 'px;height:' + (k[i] - k[i + 1]) +
        'px;opacity:0;will-change:opacity;background:' + spur(re), gruppe));
    }
    // jede Bahn reicht 1 px über die untere: sonst scheint bei krummer Pixeldichte (1,25) eine Haarlinie durch
    for (i = 0; i < N; i++) {
      decke.push(neu('position:absolute;left:0;width:100%;top:' + k[i + 1] + 'px;height:' + (k[i] - k[i + 1] + (i ? 1 : 0)) +
        'px;will-change:transform;background:' + PLATTE, gruppe));
    }
    var linien = neu('position:absolute;left:0;top:0;width:100%;height:100%;will-change:opacity;background:' + LINIEN, gruppe);
    var ds = duese(o, B < 600 ? 0.9 : B < 1000 ? 1.2 : 1.5);
    var sl = neu('position:absolute;left:' + (-L) + 'px;top:0;width:' + L + 'px;height:' + hoch + 'px;opacity:0;will-change:opacity;background:' + spur(true), ds.aussen, ds.innen);
    var sr = neu('position:absolute;left:0;top:0;width:' + L + 'px;height:' + hoch + 'px;opacity:0;will-change:opacity;background:' + spur(false), ds.aussen, ds.innen);
    return { B: B, H: H, N: N, k: k, gruppe: gruppe, glut: glut, decke: decke, linien: linien, ds: ds, sl: sl, sr: sr };
  }

  // ---------------------------------------------------------------- Abfahrt
  // Die Seite dunkelt zur Platte ab, die Düse glüht am Klickpunkt auf und fährt an den Start unten links
  function ab(ziel, p) {
    var S = bau(ebene()), k = S.ds.k, von = 'translate(' + p.x + 'px,' + p.y + 'px)';
    bewege(S.gruppe, [{ opacity: 0 }, { opacity: 1 }], { duration: 300, easing: 'cubic-bezier(.4,0,.6,1)', fill: 'both' });
    bewege(S.ds.innen, [{ opacity: 0, transform: 'scale(' + k * 0.4 + ')' }, { opacity: 1, transform: 'scale(' + k + ')' }], { duration: 120, easing: 'ease-out', fill: 'both' });
    bewege(S.ds.aussen, [
      { transform: von, easing: 'linear' },
      { transform: von, offset: 0.26, easing: 'cubic-bezier(.5,0,.2,1)' },
      { transform: 'translate(0px,' + S.k[1] + 'px)' }
    ], { duration: 340, fill: 'both' }).finished.then(function () { wechseln(ziel); }, nix);
  }
  function wechseln(ziel, sanft) {
    try {
      sessionStorage.setItem(MERK, JSON.stringify({ t: Date.now(), z: new URL(ziel, location.href).pathname, v: FASSUNG, s: sanft ? 1 : 0 }));
    } catch (e) { /* privates Fenster: die neue Seite kommt dann ohne Druck */ }
    if (VTX) window.klUebergang = true;                           // Übergang zwischen den Seiten erlauben (BaseLayout): hält dieses Bild fest
    location.assign(ziel);
  }
  // Erste Bilder der Zielseite vorholen, wenn der Link sie nennt (data-vorlade): so stehen sie da, wenn gedruckt wird
  function vorladen(a) {
    if (a.klVor || (navigator.connection && navigator.connection.saveData)) return;
    a.klVor = 1;
    (a.getAttribute('data-vorlade') || '').split(/\s+/).slice(0, wurzel.clientWidth < 700 ? 2 : 9).forEach(function (s) {
      if (s) { var b = new Image(); b.decoding = 'async'; b.src = s; }
    });
  }
  // Aufruf aus BaseLayout beim Klick auf einen Link (u = Adresse, a = Link, e = Klick). Rückgabe true: der Übergang läuft
  // und wechselt die Seite selbst. false: nichts getan, die Seite wechselt normal.
  function start(u, a, e) {
    if (zustand !== 'bereit' || typeof wurzel.animate !== 'function' || d.visibilityState !== 'visible') return false;
    e.preventDefault();
    zustand = 'laeuft';
    // Klickpunkt; bei der Tastatur die Mitte des Links
    var r = a.getBoundingClientRect(), p = { x: e.clientX, y: e.clientY };
    if (!e.detail || (!p.x && !p.y)) p = { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    vorladen(a);
    // Kam die neue Seite nicht (abgebrochen, offline): nach einer Weile ist alles wieder wie vorher
    notfall = setTimeout(function () { if (zustand === 'laeuft') { raeumen(); zustand = 'bereit'; } }, 6000);
    try { ab(u.href, p); } catch (x) { raeumen(); wechseln(u.href, true); }
    return true;
  }

  // ---------------------------------------------------------------- Ankunft
  // Dasselbe ruhige Bild wie am Ende der Abfahrt, dann druckt die Düse Bahn um Bahn
  function an() {
    var S = bau(ebene());
    S.ds.aussen.style.transform = 'translate(0px,' + S.k[1] + 'px)';
    return function (fertig) {
      // TP = Dauer des Drucks. Manolo 18.11.2026: eine halbe Sekunde länger als in der Vorschau (dort 1050 ms)
      var N = S.N, B = S.B, k = S.k, T0 = 40, TP = 1550, TD = TP + 170, g = [], summe = 0, e = [0], i, t = 0;
      // unten gemächlicher, oben schneller
      for (i = 0; i < N; i++) { g.push(1.25 - 0.5 * i / (N - 1)); summe += g[i]; }
      for (i = 0; i < N; i++) { t += g[i] / summe * TP; e.push(i === N - 1 ? TP : t); }
      var weg = [], spL = [], spR = [];
      for (i = 0; i < N; i++) {
        var re = i % 2 === 0, y = k[i + 1], a = e[i] / TD, b = e[i + 1] / TD;
        weg.push({ offset: a, transform: 'translate(' + (re ? 0 : B) + 'px,' + y + 'px)', easing: 'linear' },
          { offset: b, transform: 'translate(' + (re ? B : 0) + 'px,' + y + 'px)', easing: 'linear' });
        spL.push({ offset: a, opacity: re ? 1 : 0, easing: 'linear' }, { offset: b, opacity: re ? 1 : 0, easing: 'linear' });
        spR.push({ offset: a, opacity: re ? 0 : 1, easing: 'linear' }, { offset: b, opacity: re ? 0 : 1, easing: 'linear' });
        // die Bahn der Platte weicht vor der Düse zur Seite, ihre Kante sitzt genau unter der Spitze
        bewege(S.decke[i], [{ transform: 'translateX(0px)' }, { transform: 'translateX(' + (re ? B : -B) + 'px)' }],
          { delay: T0 + e[i], duration: e[i + 1] - e[i], easing: 'linear', fill: 'both' });
        // am Ende der Bahn übernimmt die Glut der Bahn von der Spur der Düse und kühlt aus
        bewege(S.glut[i], [{ opacity: 1 }, { opacity: 0 }], { delay: T0 + e[i + 1], duration: 280, easing: 'cubic-bezier(.3,.5,.4,1)', fill: 'forwards' });
      }
      weg.push({ offset: 1, transform: 'translate(' + ((N - 1) % 2 === 0 ? B : 0) + 'px,' + (k[N] - 110) + 'px)' });   // die Düse hebt ab
      spL.push({ offset: 1, opacity: 0 }); spR.push({ offset: 1, opacity: 0 });
      bewege(S.ds.aussen, weg, { delay: T0, duration: TD, fill: 'both' });
      bewege(S.sl, spL, { delay: T0, duration: TD, fill: 'both' });
      bewege(S.sr, spR, { delay: T0, duration: TD, fill: 'both' });
      bewege(S.ds.innen, [{ opacity: 1 }, { opacity: 0 }], { delay: T0 + TP, duration: 170, fill: 'forwards' });
      // Schichtlinien glätten sich
      bewege(S.linien, [{ opacity: 1 }, { opacity: 0 }], { delay: T0 + TP - 140, duration: 440, easing: 'cubic-bezier(.4,0,.2,1)', fill: 'forwards' });
      nach(T0 + TP + 330, fertig);
    };
  }
  // Ohne Druck (die Abfahrt ging schief): die dunkle Platte blendet nur aus
  function anSanft() {
    var g = neu('position:absolute;left:0;top:0;width:100%;height:100%;background:' + PLATTE, ebene());
    return function (fertig) {
      bewege(g, [{ opacity: 1 }, { opacity: 0 }], { duration: 380, easing: 'ease', fill: 'forwards' });
      nach(400, fertig);
    };
  }
  // Erst drucken, wenn die neue Seite so dasteht, wie sie bleibt: Dokument gelesen, Sprungziel angefahren, Schriften da und
  // die Bilder im Fenster dekodiert. Gewartet wird höchstens 0,32 s, das ruhige Bild steht so lange.
  function bereit(tun) {
    var t0 = performance.now();
    function weiter() {
      try {
        var h = decodeURIComponent(location.hash.slice(1)), z = h && d.getElementById(h);
        if (z) z.scrollIntoView({ behavior: 'instant', block: 'start' });
      } catch (e) { /* kein gültiges Sprungziel */ }
      var warten = [], B = wurzel.clientWidth, H = window.innerHeight;
      if (d.fonts && d.fonts.ready) warten.push(d.fonts.ready);
      if (bildDa) warten.push(bildDa);
      Array.prototype.forEach.call(d.images, function (b) {
        var r = b.getBoundingClientRect();
        if (!r.width || r.bottom < 0 || r.top > H || r.right < 0 || r.left > B) return;
        warten.push(new Promise(function (ok) {
          var dek = function () { (b.decode ? b.decode() : Promise.resolve()).then(ok, ok); };
          if (b.complete) dek(); else { b.addEventListener('load', dek, { once: true }); b.addEventListener('error', ok, { once: true }); }
        }));
      });
      var frist = Math.max(40, 320 - (performance.now() - t0));
      Promise.race([Promise.all(warten), new Promise(function (ok) { setTimeout(ok, frist); })]).then(tun, tun);
    }
    if (d.readyState === 'loading') d.addEventListener('DOMContentLoaded', weiter, { once: true }); else weiter();
  }
  function ankunft(m) {
    var erledigt = false, wache = 0;
    zustand = 'ankunft';
    function frei() {                                             // Decke weg und das Bild der alten Seite loslassen
      wurzel.classList.remove('kl-dr');
      if (m.vt) { try { m.vt.skipTransition(); } catch (e) { /* schon vorbei */ } }
    }
    function fertig() {                                           // alles weg, die Seite gehört wieder ganz dem Besucher
      if (erledigt) return;
      erledigt = true;
      clearTimeout(wache);
      frei();
      raeumen();
      wurzel.style.scrollBehavior = '';
      window.klDruck = null;
      window.removeEventListener('pagehide', fertig);
      zustand = 'bereit';
    }
    m.da = true;                                                  // ab hier räumt dieses Skript auf (sonst BaseLayout nach 2,5 s)
    wache = setTimeout(fertig, 6000);
    window.addEventListener('pagehide', fertig);
    wurzel.style.scrollBehavior = 'auto';                         // global.css rollt weich: das Sprungziel soll sofort stehen
    bereit(function () {
      if (erledigt) return;
      if (d.hidden) { fertig(); return; }                         // Tab im Hintergrund: niemand sieht zu, die Seite steht einfach da
      var los;
      try { los = (m.s ? anSanft : an)(); } catch (e) { raeumen(); los = anSanft(); }
      // Das ruhige Bild steht jetzt doppelt da: das festgehaltene der alten Seite und dasselbe hier. Die Bewegungen werden
      // noch dahinter angelegt (viele Ebenen auf einmal: dieses eine teure Bild soll niemand als Ruckeln sehen), erst im
      // nächsten Bild fällt das alte weg; die Bewegungen selbst beginnen kurz danach.
      requestAnimationFrame(function () {
        if (erledigt) return;
        try { los(fertig); } catch (e) { fertig(); return; }
        requestAnimationFrame(function () { if (!erledigt) frei(); });
      });
    });
  }

  // ---------------------------------------------------------------- Start
  window.KLDruck = { start: start, stand: function () { return { zustand: zustand, fassung: FASSUNG, uebergang: VTX, duese: bild ? 'bild' : 'gezeichnet' }; } };
  // Die Seite geht beim Wechsel in den Zwischenspeicher des Browsers: schon jetzt aufräumen, sonst zeigt der Zurück-Knopf
  // kurz noch die dunkle Platte. Sichtbar wird das hier nicht mehr, das Bild der alten Seite ist schon genommen.
  window.addEventListener('pagehide', function (e) {
    if (!e.persisted || zustand !== 'laeuft') return;
    clearTimeout(notfall);
    raeumen();
    zustand = 'pause';
  });
  window.addEventListener('pageshow', function (e) {
    if (!e.persisted) return;
    clearTimeout(notfall);
    raeumen();
    zustand = 'bereit';
    window.klUebergang = false;
    try { sessionStorage.removeItem(MERK); } catch (x) { /* egal */ }
  });
  // Links mit data-vorlade: ihre Bilder schon holen, wenn man sich ihnen zuwendet
  ['pointerover', 'touchstart', 'focusin'].forEach(function (n) {
    d.addEventListener(n, function (e) { var a = e.target && e.target.closest ? e.target.closest('a[data-vorlade]') : null; if (a) vorladen(a); }, { passive: true, capture: true });
  });
  if (window.klDruck && !window.klDruck.da) ankunft(window.klDruck);
})();
