// Mobil-Modus fuer die KohliLab-Konfiguratoren — das Konzept des
// Schubladen-Organizers (organizer-app, Stufe A, Manolo 10.08.2026), als
// gemeinsames Modul fuer Lochwand, QR-Schilder und Golf-Tees:
//
//   * unter 900 px: 3D-Ansicht als Vollbild, Bedienfeld (#panel) versteckt
//   * feste Leiste unten: Modus-Schalter «Drehen / Bearbeiten» (nur wenn die
//     App in der 3D-Ansicht etwas zu bearbeiten hat), Live-Preis, 🔗 Link an
//     sich selbst senden, ⚙️ Menue
//   * ⚙️ Menue oeffnet das komplette Bedienfeld als Bottom-Sheet ueber der
//     Leiste — ALLES geht, auch «In den Warenkorb»; Tipp ins 3D schliesst es
//   * Start-Meldung, gross: «Am Rechner geht's leichter» + Kurzanleitung +
//     «Link an mich senden» (Stand wandert per #k=/#c=-Link mit)
//
// Der Finger-Konflikt (1 Finger = Kamera ODER Bearbeiten) wird wie beim
// Organizer per Modus geloest: «Drehen» = OrbitControls rotiert, «Bearbeiten»
// = die App bekommt den Finger (controls.enableRotate=false); 2 Finger zoomen
// in beiden Modi.
//
// Die Apps rufen mobilModus() VOR ihrem ersten resize() auf — sonst startet
// die Leinwand mit der Groesse des Desktop-Layouts (schwarzes Bild).
// Erwartet im Dokument: #view (3D) und #panel (Bedienfeld).

export const MOBIL = matchMedia('(max-width: 899px)').matches;

const CSS = `
.mobil #view{ position:fixed; inset:0 0 var(--mb-h,112px) 0; width:100%; height:auto; }
.mobil #hint{ display:none; }
.mobil #panel{ display:none; }
/* Bedienfeld als Bottom-Sheet ueber der Leiste — kompletter Funktionsumfang
   inkl. «In den Warenkorb»; schliesst per ⚙️ oder Tipp ins 3D. */
.mobil.panel-offen #panel{ display:block; position:fixed; left:0; right:0;
  bottom:var(--mb-h,112px); top:auto; width:auto; min-width:0; max-height:64vh; overflow-y:auto;
  z-index:28; border-top:2px solid var(--acc,#ff6b1a); border-right:0;
  box-shadow:0 -12px 30px rgba(0,0,0,.5); background:var(--bg2,var(--panel,#1c1e21)); }
#mobilbar{ position:fixed; left:0; right:0; bottom:0; background:#1b1d20;
  border-top:1px solid #33363b; padding:7px 10px calc(7px + env(safe-area-inset-bottom));
  display:flex; flex-direction:column; gap:6px; z-index:30;
  font-family:"Segoe UI",system-ui,sans-serif; color:var(--ink,#e8e6e1); }
#mobilbar .mb-hinweis{ font-size:11px; color:var(--mut,#9a9a93); line-height:1.4;
  white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
#mobilbar .mb-unten{ display:flex; align-items:center; justify-content:space-between; gap:8px; }
#mobilbar .mb-modus{ display:flex; border:1px solid #3a3e44; border-radius:8px; overflow:hidden; flex:none; }
#mobilbar .mb-modus button{ background:#26282c; color:var(--mut,#9a9a93); border:0;
  padding:8px 10px; font-size:12.5px; white-space:nowrap; cursor:pointer; }
#mobilbar .mb-modus button.aktiv{ background:var(--acc,#ff6b1a); color:#141517; font-weight:700; }
#mobilbar .mb-statisch{ font-size:12px; color:var(--mut,#9a9a93); white-space:nowrap; }
#mobilbar .mb-rechts{ display:flex; align-items:center; gap:8px; min-width:0; }
#mobilbar .mb-preis{ font-family:Consolas,"JetBrains Mono",monospace; color:var(--acc2,#ffb347);
  font-weight:700; font-size:13.5px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
#mobilbar .mb-knopf{ background:#26282c; color:var(--ink,#e8e6e1); border:1px solid #3a3e44;
  border-radius:8px; padding:8px 10px; font-size:13px; white-space:nowrap; cursor:pointer; flex:none; }
#mobilbar .mb-knopf.aktiv{ background:var(--acc,#ff6b1a); color:#141517; border-color:var(--acc,#ff6b1a); font-weight:700; }
/* Start-Meldung */
#km-bg{ position:fixed; inset:0; background:rgba(8,9,10,.78); display:none; align-items:center;
  justify-content:center; z-index:50; padding:20px; font-family:"Segoe UI",system-ui,sans-serif; }
#km-bg.on{ display:flex; }
#km-modal{ background:var(--bg2,#1c1e21); border:1px solid var(--line2,#4a4f56); border-radius:12px;
  max-width:520px; width:100%; padding:22px 20px; box-shadow:0 20px 60px rgba(0,0,0,.6);
  max-height:90vh; overflow-y:auto; color:var(--ink,#e8e6e1); }
#km-modal h3{ font-size:19px; text-transform:uppercase; letter-spacing:.5px; margin:0 0 4px; }
#km-modal .msub{ color:var(--mut,#9a9a93); font-size:12.5px; margin-bottom:12px; }
#km-modal p{ font-size:13.5px; color:var(--mut,#9a9a93); margin:12px 0 0; line-height:1.6; }
#km-modal p b, #km-modal li b{ color:var(--ink,#e8e6e1); }
#km-modal .so{ font-size:12.5px; color:var(--ink,#e8e6e1); font-weight:700; margin:14px 0 6px; }
#km-modal ul{ font-size:12.5px; color:var(--mut,#9a9a93); line-height:1.55; margin:0; padding-left:18px; }
#km-modal li{ margin:3px 0; }
#km-btns{ display:flex; gap:10px; margin-top:18px; }
#km-btns button{ flex:1; border:none; border-radius:7px; padding:12px; font-size:13px; font-weight:700;
  font-family:Consolas,"JetBrains Mono",monospace; letter-spacing:.5px; cursor:pointer; text-transform:uppercase; }
#km-btns .m-primary{ background:var(--acc,#ff6b1a); color:#141517; }
#km-btns .m-ghost{ background:transparent; border:1px solid var(--line2,#4a4f56); color:var(--ink,#e8e6e1); }
`;

/**
 * Schaltet die App in den Mobil-Modus (kein Effekt ab 900 px — gibt dann null).
 *
 * opt.view        3D-Container (Tipp darauf schliesst das Sheet)
 * opt.controls    OrbitControls — «Bearbeiten» setzt enableRotate=false
 * opt.titel       Produkt fuer die Start-Meldung, z. B. «Lochwand»
 * opt.linkTeilen  async () => … — Link an sich selbst senden
 * opt.bearbeiten  null (kein Bearbeiten im 3D) ODER
 *                 { tippDreh, tippEdit, onWechsel(edit) } — Texte fuer die
 *                 Leiste, Rueckruf bei Moduswechsel
 * opt.tipps       [html, …] — Kurzanleitung in der Start-Meldung
 * opt.statisch    Text links in der Leiste, wenn es kein Bearbeiten gibt
 *
 * Rueckgabe: { bearbeiten(), setPreis(text), sheetAuf(), sheetZu(), zeigeTipp(text) }
 */
export function mobilModus(opt) {
  if (!MOBIL) return null;
  const style = document.createElement('style'); style.textContent = CSS; document.head.appendChild(style);
  document.body.classList.add('mobil');

  let edit = false;
  const bar = document.createElement('div'); bar.id = 'mobilbar';
  const hinweis = document.createElement('div'); hinweis.className = 'mb-hinweis';
  const HINWEIS = '💡 Hier geht alles — am Rechner ist es einfach übersichtlicher. Dein Stand wandert per 🔗-Link mit.';
  hinweis.textContent = HINWEIS;
  bar.appendChild(hinweis);
  const unten = document.createElement('div'); unten.className = 'mb-unten';

  let bDreh = null, bEdit = null;
  const setzeModus = (e) => {
    edit = e;
    if (opt.controls) opt.controls.enableRotate = !e;      // 1 Finger: Kamera ODER Bearbeiten
    if (bDreh) { bDreh.classList.toggle('aktiv', !e); bEdit.classList.toggle('aktiv', e); }
    const b = opt.bearbeiten;
    hinweis.textContent = e ? (b && b.tippEdit) || '✏️ Bearbeiten · 2 Finger = zoomen'
                            : (b && b.tippDreh) || '🔄 1 Finger drehen · 2 Finger zoomen';
    if (b && b.onWechsel) b.onWechsel(e);
  };
  if (opt.bearbeiten) {
    const modus = document.createElement('div'); modus.className = 'mb-modus';
    bDreh = document.createElement('button'); bDreh.type = 'button'; bDreh.textContent = '🔄 Drehen'; bDreh.classList.add('aktiv');
    bEdit = document.createElement('button'); bEdit.type = 'button'; bEdit.textContent = '✏️ Bearbeiten';
    bDreh.addEventListener('click', () => setzeModus(false));
    bEdit.addEventListener('click', () => setzeModus(true));
    modus.append(bDreh, bEdit);
    unten.appendChild(modus);
  } else {
    const s = document.createElement('span'); s.className = 'mb-statisch';
    s.textContent = opt.statisch || '🔄 1 Finger drehen · 2 Finger zoomen';
    unten.appendChild(s);
  }

  const rechts = document.createElement('div'); rechts.className = 'mb-rechts';
  const preis = document.createElement('span'); preis.id = 'mbPreis'; preis.className = 'mb-preis';
  const teilen = document.createElement('button'); teilen.type = 'button'; teilen.className = 'mb-knopf';
  teilen.textContent = '🔗'; teilen.title = 'Konfiguration an mich senden';
  teilen.addEventListener('click', () => opt.linkTeilen && opt.linkTeilen());
  const einst = document.createElement('button'); einst.type = 'button'; einst.className = 'mb-knopf mb-einst';
  einst.textContent = '⚙️ Menü';
  const sheetZu = () => { document.body.classList.remove('panel-offen'); einst.classList.remove('aktiv'); };
  const sheetAuf = (ziel) => {
    document.body.classList.add('panel-offen'); einst.classList.add('aktiv');
    // Ziel-Abschnitt im Sheet nach oben holen (bewusst nicht scrollIntoView —
    // das scrollte auch die Seite rund um das iframe mit)
    if (ziel) { const el = typeof ziel === 'string' ? document.getElementById(ziel) : ziel, panel = document.getElementById('panel');
                if (el && panel) requestAnimationFrame(() => { panel.scrollTop += el.getBoundingClientRect().top - panel.getBoundingClientRect().top - 6; }); }
  };
  einst.addEventListener('click', () => { document.body.classList.contains('panel-offen') ? sheetZu() : sheetAuf(); });
  rechts.append(preis, teilen, einst);
  unten.appendChild(rechts);
  bar.appendChild(unten);
  document.body.appendChild(bar);
  // Hoehe der Leiste als CSS-Variable: 3D-Ansicht und Sheet enden genau darueber
  const messen = () => document.documentElement.style.setProperty('--mb-h', bar.offsetHeight + 'px');
  messen(); addEventListener('resize', messen);
  // Sheet schliesst, wenn man ins 3D tippt
  if (opt.view) opt.view.addEventListener('pointerdown', sheetZu);

  // Deutliche Start-Meldung (Manolo 10.08.): am Handy geht zwar alles, aber
  // es ist Gefummel — der Rechner-Tipp soll GROSS kommen, nicht nur als
  // Kleingedrucktes in der Leiste.
  const bg = document.createElement('div'); bg.id = 'km-bg';
  const modal = document.createElement('div'); modal.id = 'km-modal';
  const tipps = (opt.tipps || []).map((t) => `<li>${t}</li>`).join('');
  modal.innerHTML = `<h3>🖥️ Tipp: Am Rechner geht's leichter</h3>
    <div class="msub">Hier funktioniert zwar alles — auch bestellen</div>
    <p>Auf dem kleinen Bildschirm ist das Konfigurieren aber ein ziemliches Gefummel. <b>Am Rechner hast du mehr Übersicht und Präzision.</b> Dein Stand wandert per Link einfach mit — jetzt senden, später am Rechner weitermachen.</p>
    <div class="so">So funktioniert's</div>
    <ul>${tipps}
      <li><b>🔗</b> — Konfiguration an dich selbst senden und am Rechner weitermachen.</li>
    </ul>
    <div id="km-btns"></div>`;
  const btns = modal.querySelector('#km-btns');
  const schliesse = () => bg.classList.remove('on');
  const send = document.createElement('button'); send.type = 'button'; send.className = 'm-primary';
  send.textContent = '🔗 Link an mich senden';
  send.onclick = () => { schliesse(); opt.linkTeilen && opt.linkTeilen(); };
  const weiter = document.createElement('button'); weiter.type = 'button'; weiter.className = 'm-ghost';
  weiter.textContent = 'Hier weitermachen';
  weiter.onclick = schliesse;
  btns.append(send, weiter);
  bg.appendChild(modal);
  bg.addEventListener('click', (e) => { if (e.target === bg) schliesse(); });
  document.body.appendChild(bg);
  bg.classList.add('on');

  return {
    bearbeiten: () => edit,
    setPreis: (t) => { preis.textContent = t || ''; },
    sheetAuf, sheetZu,
    zeigeTipp: (t) => { hinweis.textContent = t; },
  };
}
