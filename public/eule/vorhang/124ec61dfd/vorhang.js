/* Vorhang-Übergang Startseite -> Smart Home auf kohlilab.ch (Manolo 17.11.2026)
 *
 * Klick auf «Entdecken» in der Tafel der Eule: Sie fliegt kurz hoch, greift eine Vorhangschnur und zieht. Ein Theatervorhang
 * aus dunklem Samt schliesst sich über der Startseite; dahinter wechselt der Browser die Seite, und über Smart Home geht er
 * langsam nach links und rechts wieder auf.
 *
 * Dieses eine Skript läuft auf beiden Seiten:
 *   Abfahrt (Startseite)  eule.js holt es, sobald man die Eule berührt. Es lädt die Bildfolge «Eule greift die Schnur», Kordel
 *                         und Quaste und den Film «zu», meldet sich bei eule.js als window.KLVorhang und spielt beim Klick.
 *                         Ist der Vorhang zu, setzt es ein Merkzeichen (sessionStorage «kl_vorhang») und wechselt die Seite.
 *   Ankunft (Zielseite)   Das kleine Skript im Kopf von BaseLayout findet das Merkzeichen, legt eine dunkle Decke über die
 *                         Seite und holt dieses Skript. Es zeigt den geschlossenen Vorhang (Film «auf», erstes Bild) und
 *                         zieht ihn auf. Danach ist nichts mehr davon im Dokument.
 *
 * Technik: Der Vorhang ist in Blender simuliert und gerendert (Cycles) und kommt als gewöhnliches H.264-Video, das überall
 * läuft: in jedem Bild liegt neben der Farbe die Deckkraft als Graubild. Ein kleines WebGL-Programm setzt beides zu einem
 * durchsichtigen Bild zusammen (Safari kann kein VP9 mit Alpha). Zwei Formate: quer (1440 x 896) und hoch (640 x 1280),
 * je nach Fenster; das Bild füllt das Fenster immer ganz, Falten werden nie verzerrt.
 * Zwischen den Seiten: Browser mit Übergängen zwischen Dokumenten (Chrome, Edge, Safari ab 18.2) halten das Bild der alten
 * Seite (Vorhang zu) fest, bis hier der Vorhang steht, dann geht es nahtlos weiter. Die anderen (Firefox) blenden den
 * geschlossenen Vorhang kurz ins Dunkle und hier wieder auf: beide Seiten zeigen dazwischen dieselbe dunkle Fläche.
 * Geht etwas nicht (kein WebGL, Video gesperrt, Datei fehlt), wechselt die Seite ohne Vorhang bzw. blendet sanft ein.
 * «Weniger Bewegung»: eule.js holt dieses Skript gar nicht, es bleibt beim sanften Überblenden.
 * CSP: nur 'self' (Skript, Video, Bilder, JSON von der eigenen Domain; keine blob:-Adressen, kein eval).
 *
 * Quelle: RaspiCam, zaehler/e450/gemeinsam/webseite/eule_vorhang/final/vorhang.js; eingebaut mit
 * eule_flug/werkzeuge/einbau_kohlilab.py nach public/eule/vorhang/<fassung>/. Dort ändern und neu einbauen.
 */
(function () {
  'use strict';
  var skript = document.currentScript;
  var BASIS = skript && skript.src ? skript.src.replace(/vorhang\.js(\?.*)?$/, '') : '';
  var FASSUNG = BASIS.replace(/\/$/, '').split('/').pop();
  // Felder im Video (vorhang_kodieren.py): Farbe [x, y, b, h], Deckkraft [x, y, b, h], ganze Bildgrösse. deckt: ab dieser
  // Stelle im Film «zu» ist der Vorhang überall zu (s).
  var FELD = {
    quer: { f: [0, 0, 1440, 896], a: [0, 912, 720, 448], t: [1440, 1360], deckt: 0.43 },
    hoch: { f: [0, 0, 640, 1280], a: [656, 0, 320, 640], t: [976, 1280], deckt: 0.40 }
  };
  var GRUND = '#0c1a1d';              // mittlere Farbe des geschlossenen Vorhangs (dunkle Decke; gleich in BaseLayout)
  var T_FILM = 0.20;                  // s nach dem Klick beginnt der Film «zu» (der Stoff kommt gut 0,2 s später ins Bild): die
                                      // Eule greift bei 0,33 s und zieht bis 0,47 s, dann rauschen die Hälften herein
  var frage = new URLSearchParams(location.search);
  // Übergang zwischen Dokumenten vorhanden? (?vt=aus: zum Prüfen so tun, als fehlte er, wie in Firefox)
  var VTX = typeof window.CSSViewTransitionRule === 'function' && 'onpagereveal' in window && frage.get('vt') !== 'aus';

  function format() {
    var vw = document.documentElement.clientWidth || window.innerWidth, vh = window.innerHeight || 1;
    return vw / vh < 0.9 ? 'hoch' : 'quer';
  }
  function weich(a, b, x) { x = Math.min(Math.max((x - a) / (b - a), 0), 1); return x * x * (3 - 2 * x); }

  // ---------------------------------------------------------------- Film: Video -> WebGL -> durchsichtiges Bild
  var VS = 'attribute vec2 p;varying vec2 q;void main(){q=vec2(p.x*.5+.5,.5-p.y*.5);gl_Position=vec4(p,0.,1.);}';
  var FS = '#ifdef GL_FRAGMENT_PRECISION_HIGH\nprecision highp float;\n#else\nprecision mediump float;\n#endif\nvarying vec2 q;uniform sampler2D t;uniform vec4 uF,uA,uS;uniform vec4 uG;uniform float uD,uZ;' +
    'void main(){vec2 s=uS.zw+q*uS.xy;' +                                   // Stelle im Feld (Zuschnitt aufs Fenster)
    'vec3 c=texture2D(t,clamp(uF.xy+s*uF.zw,uG.xy,uG.zw)).rgb;' +           // Farbe, schon mit der Deckkraft multipliziert
    'float a=texture2D(t,uA.xy+clamp(s,.004,.996)*uA.zw).g;' +
    'a=clamp((a-.035)/.925,0.,1.);' +                                       // Video-Schwarz/Weiss sicher auf 0 und 1
    'float n=fract(sin(dot(gl_FragCoord.xy+uZ,vec2(12.9898,78.233)))*43758.5453)-.5;' +
    'c=clamp(c+n*.011*a,0.,1.);' +                                          // feines Korn: keine Stufen in dunklen Verläufen
    'gl_FragColor=vec4(min(c,vec3(a))*uD,a*uD);}';

  // vorhanden: ein Video, das schon lädt (auf der Zielseite legt es das Skript im Kopf von BaseLayout an)
  function Film(fmt, teil, vorhanden) {
    var ich = this, datei = teil + '-' + fmt + '.mp4';
    var v = this.v = vorhanden && String(vorhanden.src).indexOf(datei) >= 0 ? vorhanden : document.createElement('video');
    this.F = FELD[fmt]; this.fmt = fmt; this.deck = 1; this.aus = false; this.laeuft = false;
    v.muted = true; v.defaultMuted = true; v.playsInline = true; v.preload = 'auto'; v.tabIndex = -1;
    v.setAttribute('muted', ''); v.setAttribute('playsinline', ''); v.setAttribute('aria-hidden', 'true');
    v.disablePictureInPicture = true; v.disableRemotePlayback = true;
    // im Dokument, aber unsichtbar klein: manche Browser dekodieren ein Video ausserhalb des Dokuments nicht
    v.style.cssText = 'position:fixed;left:0;top:0;width:2px;height:2px;opacity:.01;pointer-events:none;z-index:-1';
    this.erstes = new Promise(function (ok, fehler) {             // erstes Bild da
      if (v.error) fehler(new Error('Video fehlt: ' + datei));
      if (v.readyState >= 2) ok();
      v.addEventListener('loadeddata', function () { ok(); }, { once: true });
      v.addEventListener('error', function () { fehler(new Error('Video fehlt: ' + teil + '-' + fmt)); }, { once: true });
    });
    this.ganz = new Promise(function (ok, fehler) {               // spielt ohne Nachladen durch
      if (v.readyState >= 4) ok();
      v.addEventListener('canplaythrough', function () { ok(); }, { once: true });
      v.addEventListener('error', function () { fehler(new Error('Video fehlt: ' + teil + '-' + fmt)); }, { once: true });
    });
    if (v !== vorhanden) { v.src = BASIS + datei; v.load(); }
    document.documentElement.appendChild(v);
  }
  var FP = Film.prototype;

  // Zeichenfläche und WebGL. Wirft, wenn es kein WebGL gibt.
  FP.aufbauen = function () {
    if (this.cv) return;
    var cv = this.cv = document.createElement('canvas');
    cv.setAttribute('aria-hidden', 'true');
    cv.style.cssText = 'position:fixed;left:0;top:0;width:100%;height:100%;z-index:2147483647;pointer-events:none;visibility:hidden';
    // preserveDrawingBuffer: das letzte Bild bleibt im Speicher stehen. So ist es sicher auch im Standbild, das der Browser
    // beim Seitenwechsel von der alten Seite macht.
    var wahl = { alpha: true, premultipliedAlpha: true, antialias: false, depth: false, stencil: false, preserveDrawingBuffer: true };
    var gl = this.gl = cv.getContext('webgl', wahl) || cv.getContext('experimental-webgl', wahl);
    if (!gl) throw new Error('kein WebGL');
    function teil(art, quelle) {
      var s = gl.createShader(art);
      gl.shaderSource(s, quelle); gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error('Shader: ' + gl.getShaderInfoLog(s));
      return s;
    }
    var pr = gl.createProgram();
    gl.attachShader(pr, teil(gl.VERTEX_SHADER, VS)); gl.attachShader(pr, teil(gl.FRAGMENT_SHADER, FS));
    gl.linkProgram(pr);
    if (!gl.getProgramParameter(pr, gl.LINK_STATUS)) throw new Error('Shader: ' + gl.getProgramInfoLog(pr));
    gl.useProgram(pr);
    var b = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, b);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    var ort = gl.getAttribLocation(pr, 'p');
    gl.enableVertexAttribArray(ort);
    gl.vertexAttribPointer(ort, 2, gl.FLOAT, false, 0, 0);
    gl.bindTexture(gl.TEXTURE_2D, gl.createTexture());
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    var F = this.F, tb = F.t[0], th = F.t[1];
    gl.uniform4f(gl.getUniformLocation(pr, 'uF'), F.f[0] / tb, F.f[1] / th, F.f[2] / tb, F.f[3] / th);
    gl.uniform4f(gl.getUniformLocation(pr, 'uA'), F.a[0] / tb, F.a[1] / th, F.a[2] / tb, F.a[3] / th);
    gl.uniform4f(gl.getUniformLocation(pr, 'uG'), (F.f[0] + 0.5) / tb, (F.f[1] + 0.5) / th, (F.f[0] + F.f[2] - 0.5) / tb, (F.f[1] + F.f[3] - 0.5) / th);
    this.uS = gl.getUniformLocation(pr, 'uS'); this.uD = gl.getUniformLocation(pr, 'uD'); this.uZ = gl.getUniformLocation(pr, 'uZ');
    gl.clearColor(0, 0, 0, 0);
    document.documentElement.appendChild(cv);
    var ich = this;
    this.beiGroesse = function () { ich.mass(); ich.zeichne(); };
    window.addEventListener('resize', this.beiGroesse, { passive: true });
    this.mass();
  };

  // Grösse der Zeichenfläche und Zuschnitt: das Farbfeld füllt das Fenster ganz (wie object-fit: cover), mittig
  FP.mass = function () {
    var cv = this.cv, gl = this.gl, F = this.F;
    var b = cv.clientWidth || window.innerWidth, h = cv.clientHeight || window.innerHeight;
    // nicht feiner als nötig rechnen: höchstens das 1,3-Fache der Filmbreite, höchstens doppelte Pixeldichte
    var d = Math.min(window.devicePixelRatio || 1, 2, Math.max(1, F.f[2] * 1.3 / b));
    cv.width = Math.max(2, Math.round(b * d)); cv.height = Math.max(2, Math.round(h * d));
    gl.viewport(0, 0, cv.width, cv.height);
    var fenster = b / h, feld = F.f[2] / F.f[3], sx = 1, sy = 1;
    if (fenster > feld) sy = feld / fenster; else sx = fenster / feld;
    gl.uniform4f(this.uS, sx, sy, (1 - sx) / 2, (1 - sy) / 2);
  };

  FP.zeichne = function () {
    var gl = this.gl, v = this.v;
    if (!gl || this.aus || v.readyState < 2) return false;
    try {
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, v);
    } catch (e) { return false; }
    gl.uniform1f(this.uD, this.deck);
    gl.uniform1f(this.uZ, (performance.now() * 0.37) % 289);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    return true;
  };

  FP.zeigen = function (an) { if (this.cv) this.cv.style.visibility = an === false ? 'hidden' : 'visible'; };

  // Einmal kurz anspielen und zurück auf Anfang: der Dekoder ist dann wach und das erste Bild liegt bereit, der Film
  // startet später ohne Verzug. Rückgabe: Versprechen (auch erfüllt, wenn der Browser das Anspielen ablehnt).
  FP.wecken = function () {
    var v = this.v, ich = this;
    return new Promise(function (ok) {
      var fertig = function () { try { v.pause(); if (v.currentTime !== 0) v.currentTime = 0; } catch (e) { /* egal */ } ich.zeichne(); ok(); };
      var p;
      try { p = v.play(); } catch (e) { fertig(); return; }
      if (p && p.then) p.then(fertig, function () { ich.gesperrt = true; ok(); }); else fertig();
      setTimeout(ok, 900);
    });
  };

  // Abspielen. beiEnde() nach dem letzten Bild (oder wenn der Film nicht läuft: gesperrt === true), beiZeit(t) je Bild.
  // frueh: so viele Sekunden vor dem Ende gilt der Film als fertig (das letzte Bild steht dann schon, es ist am Ende des
  // Films einmal wiederholt). beiErstem(): sobald das erste Bild wirklich gezeichnet ist; der Film darf also schon
  // gestartet werden, bevor das Video geladen ist.
  FP.spielen = function (beiEnde, beiZeit, frueh, beiErstem) {
    var v = this.v, ich = this, fertig = false, zuletzt = 0, gezeichnet = false;
    this.laeuft = true;
    function ende() {
      if (fertig) return;
      fertig = true; ich.laeuft = false;
      clearTimeout(ich.wache);
      if (!ich.aus) ich.zeichne();
      if (beiEnde) beiEnde();
    }
    // Jede Bildschirmrunde das gerade gültige Videobild holen. (Auf den Bildtakt des Videos zu warten, genügt nicht: das
    // Video selbst ist unsichtbar, und Chrome liefert einem unsichtbaren Video nur etwa jedes zweite Bild, solange niemand
    // danach fragt. Gemessen am 17.11.2026: 14 statt 30 Bilder je Sekunde.) Auf schnellen Bildschirmen höchstens 70-mal je Sekunde.
    (function runde(jetzt) {
      if (fertig || ich.aus) return;
      requestAnimationFrame(runde);
      if (jetzt - zuletzt < 14) return;
      zuletzt = jetzt;
      if (ich.zeichne() && !gezeichnet) { gezeichnet = true; if (beiErstem) beiErstem(); }
      if (beiZeit) beiZeit(v.currentTime);
      if (v.ended || (v.duration && v.currentTime >= v.duration - 0.005 - (frueh || 0))) ende();
    })(performance.now() + 20);
    v.addEventListener('ended', ende, { once: true });
    this.wache = setTimeout(ende, ((v.duration || 1.5) - (v.currentTime || 0)) * 1000 + 900);   // hängt der Film, geht es trotzdem weiter
    var p;
    try { p = v.play(); } catch (e) { ich.gesperrt = true; ende(); return; }
    if (p && p.catch) p.catch(function () { ich.gesperrt = true; ende(); });
  };

  FP.weg = function () {
    this.aus = true; this.laeuft = false;
    clearTimeout(this.wache);
    if (this.beiGroesse) window.removeEventListener('resize', this.beiGroesse);
    var v = this.v;
    try { v.pause(); v.removeAttribute('src'); v.load(); } catch (e) { /* egal */ }
    if (v.parentNode) v.parentNode.removeChild(v);
    if (this.cv && this.cv.parentNode) this.cv.parentNode.removeChild(this.cv);
    if (this.gl) { var x = this.gl.getExtension('WEBGL_lose_context'); if (x) x.loseContext(); }
    this.gl = this.cv = null;
  };

  // ---------------------------------------------------------------- Ankunft: Vorhang über der neuen Seite aufziehen
  function ankunft(m) {
    var wurzel = document.documentElement, film, erledigt = false, blendet = false, steht = false;
    // Messpunkte für vorhang_test.mjs (nur im Prüfmodus der Startseite, ?modus=…): Millisekunden seit dem Seitenwechsel
    var mess = { dokument: Math.round(performance.timeOrigin - m.t) };
    var jetzt = function (name) { mess[name] = Math.round(performance.timeOrigin + performance.now() - m.t); };
    if (m.mess) window.klVorhangMess = mess;
    jetzt('skript');
    function fertig() {                                           // alles weg, die Seite gehört wieder ganz dem Besucher
      if (erledigt) return;
      erledigt = true;
      clearTimeout(wache);
      wurzel.classList.remove('kl-vh');
      if (m.vt) { try { m.vt.skipTransition(); } catch (e) { /* schon vorbei */ } }
      if (film) film.weg();
      window.klVorhang = null;
      window.removeEventListener('pagehide', fertig);
      jetzt('fertig');
    }
    function sanft() {                                            // ohne Film: der stehende Vorhang bzw. die dunkle Decke blendet aus
      if (erledigt || blendet) return;
      blendet = true;
      clearTimeout(wache);
      if (m.vt) { try { m.vt.skipTransition(); } catch (e) { /* schon vorbei */ } }
      var d = film && film.cv && steht ? film.cv : null, eigen = !d;
      if (eigen) {
        d = document.createElement('div');
        d.setAttribute('aria-hidden', 'true');
        d.style.cssText = 'position:fixed;inset:0;z-index:2147483647;pointer-events:none;background:' + GRUND;
        wurzel.appendChild(d);
        if (film && film.cv) film.zeigen(false);
      }
      d.style.transition = 'opacity .38s ease';
      wurzel.classList.remove('kl-vh');
      requestAnimationFrame(function () { requestAnimationFrame(function () { d.style.opacity = '0'; }); });
      setTimeout(function () { if (eigen && d.parentNode) d.parentNode.removeChild(d); fertig(); }, 470);
    }
    m.da = true;                                                  // ab hier räumt dieses Skript auf (sonst BaseLayout nach 2,5 s)
    var wache = setTimeout(sanft, 1600);                          // der Film kommt nicht: nicht länger im Dunkeln warten
    window.addEventListener('pagehide', fertig);
    try {
      film = new Film(m.q === 'hoch' ? 'hoch' : 'quer', 'auf', m.f);
      film.aufbauen();
    } catch (e) { sanft(); return; }
    var ende = function () { if (film.gesperrt) sanft(); else fertig(); };
    var zeit = function (z) { if (z > 0 && !mess.film_laeuft) jetzt('film_laeuft'); };
    var frei = function () {                                      // Decke weg und das Bild der alten Seite loslassen
      if (erledigt || blendet) return;
      wurzel.classList.remove('kl-vh');
      if (m.vt) { try { m.vt.skipTransition(); } catch (e) { /* schon vorbei */ } }
      jetzt('frei_gegeben');
    };
    if (!m.ohne) {
      // Mit Übergang zwischen den Seiten hält der Browser das Bild der alten Seite (Vorhang zu) fest. Der Film startet
      // sofort; sobald sein erstes Bild gezeichnet ist (dasselbe Bild, die Bewegung setzt erst sacht ein), kommt der Vorhang
      // auf den Schirm und im nächsten Bild fällt das alte weg.
      jetzt('film_start');
      film.spielen(ende, zeit, 0, function () {
        if (erledigt || blendet) return;
        clearTimeout(wache);
        steht = true;
        jetzt('erstes_bild'); mess.uebergang = !!m.vt;
        film.zeigen();
        requestAnimationFrame(frei);
      });
      return;
    }
    // Ohne Übergang zwischen den Seiten (Firefox) steht hier die dunkle Decke, in der die alte Seite geendet hat: der
    // geschlossene Vorhang blendet darüber ein, dann läuft der Film.
    film.erstes.then(function () {
      if (erledigt || blendet) return;
      jetzt('erstes_bild'); mess.uebergang = false;
      film.cv.style.opacity = '0';
      void film.cv.offsetWidth;                                   // erst unsichtbar festschreiben, dann den Übergang einschalten
      film.cv.style.transition = 'opacity .14s linear';
      if (!film.zeichne()) { sanft(); return; }
      film.zeigen();
      requestAnimationFrame(function () { requestAnimationFrame(function () { if (film.cv) film.cv.style.opacity = '1'; }); });
      setTimeout(function () {
        if (erledigt || blendet) return;
        clearTimeout(wache);
        steht = true;
        jetzt('film_start');
        film.spielen(ende, zeit);
        requestAnimationFrame(frei);
      }, 190);
    }).catch(sanft);
  }

  // ---------------------------------------------------------------- Abfahrt: die Eule greift die Schnur, der Vorhang schliesst
  function abfahrt(E) {
    var eule = E.eule, fmt = format(), film = null, vor = null, folge = null, zustand = 'laden', notfall = 0, dunkel = null;
    var seil = null, quast = null, S = null;                      // Kordel, Quaste, Rechenwerte dazu
    var api = window.KLVorhang = {
      kaputt: false,
      bereit: function () { return zustand === 'bereit' && format() === fmt; },
      start: start, zurueck: zurueck,
      stand: function () { return { zustand: zustand, format: fmt, fassung: FASSUNG, uebergang: VTX, gesperrt: !!(film && film.gesperrt) }; }
    };
    function bild(url) {
      return new Promise(function (ok, fehler) {
        var b = new Image();
        b.onload = function () { (b.decode ? b.decode().catch(function () {}) : Promise.resolve()).then(function () { ok(b); }); };
        b.onerror = function () { fehler(new Error('Bild fehlt: ' + url)); };
        b.src = url;
      });
    }
    function laden() {
      zustand = 'laden';
      Promise.all([folge || E.satz(BASIS + 'schnur/', eule.stufe, true), bild(BASIS + 'schnur/kordel.webp'), bild(BASIS + 'schnur/quaste.webp')])
        .then(function (d) {
          folge = d[0];
          film = new Film(fmt, 'zu');
          film.aufbauen();
          return film.ganz;
        })
        .then(function () { return film.wecken(); })
        .then(function () {
          if (film.gesperrt) throw new Error('Video gesperrt');
          zustand = 'bereit';
          // Film «auf» für die Zielseite schon in den Zwischenspeicher des Browsers holen
          vor = document.createElement('video');
          vor.muted = true; vor.preload = 'auto'; vor.setAttribute('aria-hidden', 'true');
          vor.style.cssText = 'position:fixed;left:0;top:0;width:2px;height:2px;opacity:0;pointer-events:none;z-index:-1';
          vor.src = BASIS + 'auf-' + fmt + '.mp4';
          document.documentElement.appendChild(vor);
        })
        .catch(function (e) {
          api.kaputt = true; zustand = 'kaputt';
          if (film) film.weg();
          if (window.console) console.warn('[vorhang]', e && e.message);
        });
    }

    // Kordel und Quaste: zwei gerenderte Bilder, hier zusammengesetzt (die Schnur reicht bis über den Fensterrand, und jedes
    // Fenster ist anders hoch). Sie hängen hinter der Eule; die Quaste pendelt an einem Punkt mit Trägheit.
    function seilBauen() {
      var R = folge.requisiten, k = eule.m.k, G = folge.greifen || [0, 76];
      var gi = folge.marken.griff, bn = folge.bahn[gi];
      var o = eule.ort(bn[0], bn[1], eule.m.dfS);                 // Körpermitte beim Griff, im Fenster
      S = {
        k: k, tG: gi / folge.fps, gx: G[0] * k, gy: G[1] * k,
        ex: o[0] + G[0] * k, ey: o[1] + G[1] * k + eule.sink,     // hier hängt das Schnurende, bevor sie zugreift
        sb: R.kordel.b * k, sh: window.innerHeight + 240,
        qb: R.quaste.b * k, qh: R.quaste.h * k, qx: R.quaste.achse * k, qy: R.quaste.oben * k,
        pl: Math.max(R.quaste.h - R.quaste.oben, 20) * 0.62 * k,  // Pendellänge der Quaste
        mx: 0, my: 0, vx: 0, vy: 0, t: 0, neu: true
      };
      seil = document.createElement('div');
      seil.setAttribute('aria-hidden', 'true');
      seil.style.cssText = 'position:absolute;left:0;top:0;width:' + S.sb.toFixed(2) + 'px;height:' + S.sh + 'px;background:url("' + BASIS +
        'schnur/kordel.webp") center bottom/' + S.sb.toFixed(2) + 'px auto repeat-y;transform-origin:50% 100%;will-change:transform;visibility:hidden';
      quast = document.createElement('img');
      quast.alt = ''; quast.setAttribute('aria-hidden', 'true'); quast.decoding = 'sync';
      quast.src = BASIS + 'schnur/quaste.webp';
      quast.style.cssText = 'position:absolute;left:0;top:0;width:' + S.qb.toFixed(2) + 'px;height:' + S.qh.toFixed(2) + 'px;transform-origin:' +
        S.qx.toFixed(2) + 'px ' + S.qy.toFixed(2) + 'px;will-change:transform;visibility:hidden';
      eule.wurzel.insertBefore(seil, eule.cv);
      eule.wurzel.insertBefore(quast, eule.cv);
    }
    function seilSetzen(t, x, y, s) {
      if (!seil) return;
      // Schnurende: fällt von oben herein und federt kurz; ab dem Griff sitzt es in den Füssen der Eule
      var u = t / (S.tG * 0.86);
      var fall = Math.exp(-5.0 * u) * (Math.cos(7.2 * u) + 0.69 * Math.sin(7.2 * u));    // 1 -> 0 mit kleinem Nachfedern
      var fx = S.ex + 5 * S.k * Math.sin(10 * t) * Math.exp(-4 * t), fy = S.ey - (S.ey + S.qh + 40) * fall;
      var g = weich(S.tG - 0.035, S.tG + 0.015, t);
      var ex = fx + (x + S.gx * s - fx) * g, ey = fy + (y + S.gy * s - fy) * g;
      var ax = S.ex, ay = -80;                                    // Aufhängung über dem Fenster
      var w = Math.atan2(ax - ex, ey - ay);
      seil.style.transform = 'translate3d(' + (ex - S.sb / 2).toFixed(2) + 'px,' + (ey - S.sh).toFixed(2) + 'px,0) rotate(' + w.toFixed(4) + 'rad)';
      // Quaste: bis zum Griff hängt sie am fallenden Ende und wiegt sich leicht; danach Pendel am Schnurende (mit Dämpfung)
      var dt = Math.min(Math.max(t - S.t, 0), 0.05);
      S.t = t;
      if (S.neu || t < S.tG - 0.03) {
        S.neu = false;
        var wiegen = 0.16 * Math.sin(13 * t) * Math.exp(-3 * t);
        S.mx = ex + S.pl * Math.sin(wiegen); S.my = ey + S.pl * Math.cos(wiegen); S.vx = 0; S.vy = 0;
      } else if (dt > 0) {
        S.vy += 7800 * S.k * dt;                                  // «Schwerkraft» im Massstab der Eule
        S.vx *= Math.exp(-3.2 * dt); S.vy *= Math.exp(-3.2 * dt);
        var nx = S.mx + S.vx * dt, ny = S.my + S.vy * dt;
        var dx = nx - ex, dy = ny - ey, l = Math.sqrt(dx * dx + dy * dy) || 1;
        nx = ex + dx / l * S.pl; ny = ey + dy / l * S.pl;         // Länge halten
        S.vx = (nx - S.mx) / dt; S.vy = (ny - S.my) / dt;
        S.mx = nx; S.my = ny;
      }
      var q = Math.atan2(-(S.mx - ex), S.my - ey);
      q = Math.max(-0.9, Math.min(0.9, q));                       // reisst die Eule schneller, als die Quaste fällt: nicht überschlagen
      quast.style.transform = 'translate3d(' + (ex - S.qx).toFixed(2) + 'px,' + (ey - S.qy).toFixed(2) + 'px,0) rotate(' + q.toFixed(4) + 'rad)';
      if (seil.style.visibility) { seil.style.visibility = ''; quast.style.visibility = ''; }
    }
    function seilWeg() {
      if (seil && seil.parentNode) seil.parentNode.removeChild(seil);
      if (quast && quast.parentNode) quast.parentNode.removeChild(quast);
      seil = quast = null;
    }

    function start(ziel) {
      if (zustand !== 'bereit') return false;
      zustand = 'laeuft';
      var filmAn = false, verdeckt = false;
      eule.sonderflug(folge, function (t, x, y, s) {
        if (verdeckt) return;                                     // der Vorhang ist vor ihr zu: nichts mehr zu rechnen
        seilSetzen(t, x, y, s);
        if (!filmAn && t >= T_FILM) {
          filmAn = true;
          eule.blitz = eule.T;                                    // die Augen blitzen, wenn sie zieht
          film.zeigen();
          film.spielen(function () { wechseln(ziel); }, function (zeit) { if (zeit >= film.F.deckt) verdeckt = true; }, 0.034);
        }
      });
      seilBauen();                                                // nach sonderflug: jetzt kennt die Eule die Masse der Folge
      // Kam die neue Seite nicht (abgebrochen, offline): nach einer Weile ist alles wieder wie vorher
      notfall = setTimeout(function () { if (zustand === 'laeuft') { zurueck(); eule.zurueck(); } }, 6000);
      return true;
    }

    function wechseln(ziel) {
      if (zustand !== 'laeuft') return;
      if (!film.gesperrt) eule.verdeckt();                        // hinter dem Vorhang muss sie nicht weiterzeichnen
      if (film.gesperrt) {                                        // der Film lief nicht: ohne Vorhang wechseln (mit Überblenden)
        window.klUebergang = true;
        location.assign(ziel);
        return;
      }
      try {
        sessionStorage.setItem('kl_vorhang', JSON.stringify({ t: Date.now(), z: new URL(ziel, location.href).pathname, v: FASSUNG, q: fmt, ohne: VTX ? 0 : 1, mess: frage.has('modus') ? 1 : 0 }));
      } catch (e) { /* privates Fenster: die neue Seite kommt dann ohne Vorhang */ }
      if (VTX) {
        window.klUebergang = true;                                // Übergang zwischen den Seiten erlauben (BaseLayout): hält dieses Bild fest
        location.assign(ziel);
        return;
      }
      // ohne Übergang zwischen Dokumenten: der Vorhang versinkt kurz im Dunkeln, die neue Seite beginnt mit derselben Fläche
      dunkel = document.createElement('div');
      dunkel.setAttribute('aria-hidden', 'true');
      dunkel.style.cssText = 'position:fixed;inset:0;z-index:2147483647;pointer-events:none;opacity:0;background:' + GRUND + ';transition:opacity .15s linear';
      document.documentElement.appendChild(dunkel);
      requestAnimationFrame(function () { requestAnimationFrame(function () { if (dunkel) dunkel.style.opacity = '1'; }); });
      setTimeout(function () { if (zustand === 'laeuft') location.assign(ziel); }, 200);
    }

    // Alles vom Vorhang aus der Seite nehmen (Schnur, Zeichenfläche, Videos)
    function raeumen() {
      clearTimeout(notfall);
      seilWeg();
      if (dunkel && dunkel.parentNode) dunkel.parentNode.removeChild(dunkel);
      dunkel = null;
      if (vor) { try { vor.removeAttribute('src'); vor.load(); } catch (e) { /* egal */ } if (vor.parentNode) vor.parentNode.removeChild(vor); vor = null; }
      if (film) { film.weg(); film = null; }
    }

    // Zurück-Knopf (Seite kommt aus dem Zwischenspeicher) oder der Seitenwechsel blieb aus: kein Vorhang-Rest, neu bereit machen
    function zurueck() {
      raeumen();
      try { sessionStorage.removeItem('kl_vorhang'); } catch (e) { /* egal */ }
      if (zustand === 'kaputt') return;
      fmt = format();
      laden();
    }

    // Die Seite geht beim Wechsel in den Zwischenspeicher des Browsers: schon jetzt aufräumen und die Eule hinsetzen. Sonst
    // zeigt der Browser beim Zurückkommen ein, zwei Bilder lang noch den geschlossenen Vorhang (gemessen 17.11.2026), bevor
    // «pageshow» ihn wegnimmt. Sichtbar wird das Aufräumen hier nicht mehr: das Bild der alten Seite ist schon genommen.
    // Das Merkzeichen bleibt stehen, die Zielseite braucht es.
    window.addEventListener('pagehide', function (e) {
      if (!e.persisted || zustand !== 'laeuft') return;
      raeumen();
      zustand = 'pause';
      eule.zurueck();
    });

    laden();
  }

  // ---------------------------------------------------------------- Start
  if (window.klVorhang && !window.klVorhang.da) ankunft(window.klVorhang);
  else if (window.KLEule && window.KLEule.intern && !window.KLVorhang) abfahrt(window.KLEule.intern);
})();
