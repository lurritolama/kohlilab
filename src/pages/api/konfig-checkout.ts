/**
 * POST /api/konfig-checkout
 *
 * Warenkorb-Bestellung mit KohliLab-Konfigurator-Positionen (QR-Schild +
 * Schubladen-Organizer):
 *   1. Adresse + jede Position validieren,
 *   2. Preise SERVERSEITIG aus dem gemessenen 3MF-Gewicht (nie dem Client
 *      trauen) — fälschungssicher,
 *   3. EINE Bestellung (create_order, shop='kohlilab', Präfix KL),
 *   4. Alle Druckdateien in den Storage, Konfigurationen an der Bestellung,
 *   5. Bestätigungs-Mail + QR-Rechnung über alles.
 */
export const prerender = false;

import type { APIRoute } from 'astro';
import { SHOP_ID, VERSANDARTEN, VERSANDART_IDS, LIEFERLAENDER, type VersandartId, type Lieferland } from '../../lib/config';
import { organizerPreisRappen, schildGesamtRappen, lochwandPreisRappen, teeStueckRappen, teeFarben, teeMengeGueltig } from '../../lib/preis';
import { grammAus, farbAnzahl } from '../../lib/server/dreimf';
import { getPaymentProvider } from '../../lib/payments';
import { supabaseAdmin } from '../../lib/server/supabase-admin';
import type { MailBestellung } from '../../lib/server/mail-templates';

const ANKER: Record<string, string> = {
  schild: 'c0111ab0-0000-4000-8000-000000000001',
  organizer: 'c0111ab0-0000-4000-8000-000000000002',
  ventilkappe: 'c0111ab0-0000-4000-8000-000000000003',
  lochwand: 'c0111ab0-0000-4000-8000-000000000005',      // Ankerprodukt (SQL: lochwand-anker.sql)
  tee: 'c0111ab0-0000-4000-8000-000000000006',           // Golf-Tee (SQL: 20260819_golf-tees.sql)
};
const TEE_KOPF: Record<string, string> = { cup: 'Cup', flat: 'Flat', eye: 'Auge' };
const LOCHWAND_FAMILIEN: Record<string, string> = { haken: 'Haken', wanne: 'Wanne', halter: 'Halter', klemme: 'Klemme' };
const VENTILKAPPE_SET_RAPPEN = 1200;                 // CHF 12.— pro 4er-Set (fix)
const WUNSCH_AUFPREIS_RAPPEN = 800;                  // Wunsch-Sujet: +CHF 8.— -> 20.— je Set (Machbarkeit wird geprüft)
const GEWINDE_LABEL: Record<string, string> = { schrader: 'Schrader', presta: 'Presta' };
const BUCKET = 'konfigurator';
const MAX_POSITIONEN = 12;
const MAX_DATEI_BYTES = 8 * 1024 * 1024;
const EMAIL_MUSTER = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function json(daten: unknown, status = 200): Response {
  return new Response(JSON.stringify(daten), { status, headers: { 'Content-Type': 'application/json; charset=utf-8' } });
}

function buf(b64: unknown, name: string): Buffer {
  if (typeof b64 !== 'string' || b64.length < 32) throw new Error(`Druckdatei ${name} fehlt.`);
  const b = Buffer.from(b64, 'base64');
  if (b.length === 0 || b.length > MAX_DATEI_BYTES) throw new Error(`Druckdatei ${name} ist ungültig.`);
  return b;
}

export const POST: APIRoute = async ({ request }) => {
  let roh: any;
  try { roh = await request.json(); } catch { return json({ ok: false, fehler: ['Die Anfrage war unlesbar – bitte Seite neu laden.'] }, 400); }

  const fehler: string[] = [];
  const text = (w: unknown) => (typeof w === 'string' ? w.trim() : '');

  const email = text(roh.email);
  if (!email) fehler.push('Die E-Mail-Adresse fehlt noch.');
  else if (!EMAIL_MUSTER.test(email)) fehler.push('Die E-Mail-Adresse sieht nicht vollständig aus – bitte prüfen.');
  const name = text(roh.name); if (!name) fehler.push('Der Name fehlt noch.');
  const strasse = text(roh.strasse); if (!strasse) fehler.push('Strasse und Hausnummer fehlen noch.');
  const plz = text(roh.plz);
  if (!plz) fehler.push('Die Postleitzahl fehlt noch.');
  else if (!/^\d{4}$/.test(plz)) fehler.push('Die Postleitzahl besteht aus vier Ziffern, z. B. 9055.');
  const ort = text(roh.ort); if (!ort) fehler.push('Der Ort fehlt noch.');
  const land = text(roh.land) as Lieferland;
  if (!LIEFERLAENDER.includes(land)) fehler.push('Wir liefern in die Schweiz und nach Liechtenstein.');
  const versandart = text(roh.versandart) as VersandartId;
  if (!VERSANDART_IDS.includes(versandart)) fehler.push('Bitte eine Versandart wählen.');

  const posRoh = Array.isArray(roh.positionen) ? roh.positionen : [];
  if (posRoh.length === 0) fehler.push('Der Warenkorb ist leer.');
  if (posRoh.length > MAX_POSITIONEN) fehler.push(`Maximal ${MAX_POSITIONEN} Positionen pro Bestellung.`);

  // ---- Positionen validieren + Preise serverseitig aus dem 3MF -----------
  type Pos = { typ: 'schild' | 'organizer' | 'ventilkappe' | 'lochwand' | 'tee'; konfig: any; menge: number; preis: number; titel: string; dateien: { name: string; buf: Buffer }[] };
  const positionen: Pos[] = [];
  posRoh.forEach((p: any, i: number) => {
    const nr = i + 1;
    const typ = p?.typ;
    const konfig = p?.konfig ?? {};
    try {
      if (typ === 'ventilkappe') {
        // Katalog-Produkt: fester 4er-Set-Preis, keine Kundendatei. Kunde
        // wählt Sujet + Gewinde (Schrader/Presta); wir drucken aus unserem
        // freigegebenen Sujet-Bestand.
        const menge = Math.round(Number(p?.menge));
        if (!Number.isInteger(menge) || menge < 1 || menge > 50) { fehler.push(`Position ${nr}: Menge muss 1–50 sein.`); return; }
        const sujet = typeof konfig.sujet === 'string' ? konfig.sujet.trim().slice(0, 40) : '';
        if (!sujet) { fehler.push(`Position ${nr}: Sujet fehlt.`); return; }
        const gewinde = konfig.gewinde === 'presta' ? 'presta' : 'schrader';
        if (sujet === 'wunsch') {
          // Wunsch-Sujet: Kunde beschreibt das Motiv, WIR pruefen die
          // Machbarkeit nach der Bestellung. Aufpreis serverseitig fix.
          const wunsch = typeof konfig.wunsch === 'string' ? konfig.wunsch.trim().slice(0, 300) : '';
          if (wunsch.length < 5) { fehler.push(`Position ${nr}: Beschreibung des Wunsch-Sujets fehlt.`); return; }
          const preis = (VENTILKAPPE_SET_RAPPEN + WUNSCH_AUFPREIS_RAPPEN) * menge;
          const kurz = wunsch.length > 40 ? wunsch.slice(0, 40) + '…' : wunsch;
          const titel = `Ventilkappe · Wunsch-Sujet «${kurz}» · ${GEWINDE_LABEL[gewinde]} · 4er-Set · ${menge}× (Machbarkeit wird geprüft)`;
          positionen.push({ typ, konfig: { sujet: 'wunsch', wunsch, gewinde, sets: menge }, menge, preis, titel, dateien: [] });
          return;
        }
        const preis = VENTILKAPPE_SET_RAPPEN * menge;
        const titel = `Ventilkappe · ${sujet} · ${GEWINDE_LABEL[gewinde]} · 4er-Set · ${menge}×`;
        positionen.push({ typ, konfig: { sujet, gewinde, sets: menge }, menge, preis, titel, dateien: [] });
      } else if (typ === 'schild') {
        const menge = Math.round(Number(p?.menge));
        if (!Number.isInteger(menge) || menge < 1 || menge > 50) { fehler.push(`Position ${nr}: Schild-Menge muss 1–50 sein.`); return; }
        const b = buf(p?.dateien?.datei, `${nr}/schild`);
        const gramm = grammAus([b]);
        const zusatzFarben = Math.max(0, farbAnzahl(b) - 2);
        const preis = schildGesamtRappen({ gramm, zusatzFarben, menge });
        const jeton = konfig.aufbau === 'jeton';
        const aufbau = jeton ? 'Wägeli-Jeton' : konfig.aufbau === 'aufsteller' ? 'L-Aufsteller' : 'Flach';
        const titel = jeton
          ? `Wägeli-Jeton · ⌀${Number(konfig.jetonD ?? 27.4).toFixed(1)} mm · QR beidseitig · ${menge}×`
          : `QR-Schild · ${aufbau}${zusatzFarben > 0 ? ` · Logo (${zusatzFarben} Extra-Farbe${zusatzFarben > 1 ? 'n' : ''})` : ''} · ${menge}×`;
        positionen.push({ typ, konfig: { ...konfig, gramm: Math.round(gramm), zusatzFarben }, menge, preis, titel, dateien: [{ name: `pos${nr}_schild.3mf`, buf: b }] });
      } else if (typ === 'organizer') {
        const dateienObj = p?.dateien ?? {};
        const bufs = Object.entries(dateienObj).map(([k, v]) => ({ name: `pos${nr}_${k}.3mf`, buf: buf(v, `${nr}/${k}`) }));
        if (bufs.length === 0) { fehler.push(`Position ${nr}: keine Druckdatei.`); return; }
        const module = Math.max(1, bufs.filter((d) => d.name.includes('modul')).length || 1);
        const hatText = !!konfig.hatText;
        const gramm = grammAus(bufs.map((d) => d.buf));
        const zapfen = Number(konfig.zapfen) || 0;
        const spezialFaecher = Number(konfig.spezialFaecher) || 0;
        const textFaecher = Number(konfig.textFaecher) || 0;
        const textMmUeber4 = Number(konfig.textMmUeber4) || 0;
        const preis = organizerPreisRappen({ gramm, module, hatText, zapfen, spezialFaecher, textFaecher, textMmUeber4 });
        const masse = konfig.masse ? `${konfig.masse}` : '';
        const titel = `Schubladen-Organizer${masse ? ` · ${masse} mm` : ''} · ${module} Teil${module > 1 ? 'e' : ''}`;
        positionen.push({ typ, konfig: { ...konfig, gramm: Math.round(gramm), module, hatText, zapfen, spezialFaecher, textFaecher, textMmUeber4 }, menge: 1, preis, titel, dateien: bufs });
      } else if (typ === 'tee') {
        // Golf-Tee (aus TeeLab): zwei Druckdateien (unten/oben), Stueckpreis aus
        // Kopfform/Farben, Menge ab 10 in 10er-Schritten. `preis` ist der
        // GESAMTpreis der Position (Stueck x Menge) — wie bei den anderen Typen.
        const menge = Math.round(Number(p?.menge));
        if (!teeMengeGueltig(menge) || menge > 500) { fehler.push(`Position ${nr}: Tee-Menge muss mindestens 10 sein, in 10er-Schritten (höchstens 500).`); return; }
        const unten = buf(p?.dateien?.unten, `${nr}/unten`), oben = buf(p?.dateien?.oben, `${nr}/oben`);
        const farben = teeFarben(konfig);
        const stueck = teeStueckRappen(konfig);
        const laenge = Number(konfig.length) || 0;
        const titel = `Golf-Tee · ${TEE_KOPF[konfig.headType] ?? String(konfig.headType ?? '?')} · ${laenge} mm · ${farben} Farbe${farben > 1 ? 'n' : ''} · ${menge}×`;
        const link = typeof konfig.link === 'string' ? konfig.link.slice(0, 2000) : (typeof p?.konfigLink === 'string' ? p.konfigLink.slice(0, 2000) : '');
        positionen.push({ typ, konfig: { headType: konfig.headType, numColors: farben, length: laenge, params: konfig.params ?? null, link, stueckRappen: stueck }, menge, preis: stueck * menge, titel,
          dateien: [{ name: `pos${nr}_tee_1-unten.3mf`, buf: unten }, { name: `pos${nr}_tee_2-oben.3mf`, buf: oben }] });
      } else if (typ === 'lochwand') {
        // Lochwand-Planer: ein Set (ganze Wand) oder ein einzelnes Modul —
        // in beiden Fällen EINE Position mit einer Druckdatei je Modul
        // (modul_1.3mf …), damit in der Produktion alles zusammen sichtbar
        // ist (Brief §9). Preis aus dem gemessenen Gewicht + Modulzahl.
        // Die Modulliste (Familie, Parameter, Farbe, Loch) kommt aus dem
        // Browser und dient Manolo zur Kontrolle gegen die Druckdateien —
        // preisrelevant ist nur, was gemessen wird.
        const dateienObj = p?.dateien ?? {};
        const modulBufs = Object.entries(dateienObj)
          .filter(([k]) => /^modul_\d{1,3}$/.test(k))
          .map(([k, v]) => ({ name: `pos${nr}_${k}.3mf`, buf: buf(v, `${nr}/${k}`) }));
        // Schilder (aufgesetzte Textplatten): eigene Dateien schild_n.3mf,
        // gezaehlt und gewogen — je Modul hoechstens eines.
        const schildBufs = Object.entries(dateienObj)
          .filter(([k]) => /^schild_\d{1,3}$/.test(k))
          .map(([k, v]) => ({ name: `pos${nr}_${k}.3mf`, buf: buf(v, `${nr}/${k}`) }));
        if (modulBufs.length === 0) { fehler.push(`Position ${nr}: keine Druckdatei.`); return; }
        if (modulBufs.length > 60) { fehler.push(`Position ${nr}: mehr als 60 Module — bitte in zwei Bestellungen aufteilen.`); return; }
        const schilder = Math.min(modulBufs.length, schildBufs.length);
        const bufs = [...modulBufs, ...schildBufs.slice(0, schilder)];
        const gramm = grammAus(bufs.map((d) => d.buf));
        const textModule = Number(konfig.textModule) || 0;
        const textMmUeber4 = Number(konfig.textMmUeber4) || 0;
        const preis = lochwandPreisRappen({ gramm, module: modulBufs.length, textModule, textMmUeber4, schilder });
        const platte = typeof konfig.platte === 'string' ? konfig.platte.slice(0, 20) : '';
        const moduleRoh = Array.isArray(konfig.module) ? konfig.module.slice(0, 60) : [];
        const module = moduleRoh.map((m: any) => ({
          familie: LOCHWAND_FAMILIEN[m?.familie] ? m.familie : 'unbekannt',
          params: (m?.params && typeof m.params === 'object') ? m.params : {},
          farbe: typeof m?.farbe === 'string' ? m.farbe.slice(0, 7) : '',
          loch: typeof m?.loch === 'string' ? m.loch.slice(0, 30) : '',
          text: typeof m?.text === 'string' ? m.text.slice(0, 20) : '',
          textArt: m?.textArt === 'ebene' || m?.textArt === 'schild' ? m.textArt : '',
          textGroesse: Number(m?.textGroesse) || 0,
          textFarbe: typeof m?.textFarbe === 'string' ? m.textFarbe.slice(0, 7) : '',
        }));
        const zaehl: Record<string, number> = {};
        for (const m of module) zaehl[m.familie] = (zaehl[m.familie] || 0) + 1;
        const zusammensetzung = Object.entries(zaehl).map(([f, n]) => `${n}× ${LOCHWAND_FAMILIEN[f] ?? f}`).join(', ');
        // Testphase (bis Manolo den Planer freigibt): der Browser meldet
        // test=true, der Titel traegt "TEST" — so ist die Bestellung im Admin,
        // in der Mail und auf dem Pi als Testbestellung erkennbar.
        const test = konfig.test === true;
        const titel = (test ? 'TEST · ' : '') + (modulBufs.length === 1
          ? `Lochwand-Modul · ${zusammensetzung || '1 Modul'} · für IKEA Skådis`
          : `Lochwand-Set · ${modulBufs.length} Module (${zusammensetzung}) · für IKEA Skådis${platte ? ` ${platte}` : ''}`) + (schilder ? ` · ${schilder} Schild${schilder > 1 ? 'er' : ''}` : '');
        positionen.push({ typ, konfig: { test, platte, module, anzahl: modulBufs.length, schilder, gramm: Math.round(gramm), textModule: Math.min(modulBufs.length, Math.max(0, Math.round(textModule))), textMmUeber4: Math.min(2000, Math.max(0, textMmUeber4)) }, menge: 1, preis, titel, dateien: bufs });
      } else {
        fehler.push(`Position ${nr}: unbekannter Typ.`);
      }
    } catch (e) {
      fehler.push(`Position ${nr}: ${(e as Error).message} Bitte im Konfigurator neu in den Warenkorb legen.`);
    }
  });

  if (fehler.length > 0) return json({ ok: false, fehler }, 400);

  const subtotalRappen = positionen.reduce((s, p) => s + p.preis, 0);
  const versandRappen = VERSANDARTEN[versandart].kostenRappen;
  const totalRappen = subtotalRappen + versandRappen;

  let db: ReturnType<typeof supabaseAdmin>;
  try { db = supabaseAdmin(); } catch (e) { console.error('[konfig-checkout]', e); return json({ ok: false, fehler: ['Bestellungen sind gerade nicht möglich. Bitte später nochmals.'] }, 503); }

  // ---- EINE Bestellung mit allen Positionen ------------------------------
  const { data: ergebnis, error: orderFehler } = await db.rpc('create_order', {
    p_bestellung: {
      shop: SHOP_ID, email, shipping_name: name, shipping_street: strasse, shipping_zip: plz, shipping_city: ort,
      shipping_country: land, phone: text(roh.telefon) || null, shipping_method: versandart,
      shipping_cost_rappen: versandRappen, subtotal_rappen: subtotalRappen, total_rappen: totalRappen, note: text(roh.bemerkung) || null,
    },
    p_positionen: positionen.map((p) => ({ product_id: ANKER[p.typ], qty: 1, title_snapshot: p.titel, price_rappen_snapshot: p.preis })),
  });
  if (orderFehler) { console.error('[konfig-checkout] create_order:', orderFehler.message); return json({ ok: false, fehler: ['Da ging etwas schief. Bitte versuch es gleich nochmals.'] }, 500); }

  const { order_id: orderId, order_number: orderNumber } = ergebnis as { order_id: string; order_number: string };

  // ---- Dateien hochladen + Konfigurationen speichern ---------------------
  const upErr: string[] = [];
  const alleDateien: { teil: string; pfad: string }[] = [];
  for (const p of positionen) {
    for (const d of p.dateien) {
      const pfad = `${orderNumber}/${d.name}`;
      const { error } = await db.storage.from(BUCKET).upload(pfad, d.buf, { contentType: 'model/3mf', upsert: true });
      if (error) upErr.push(error.message); else alleDateien.push({ teil: d.name, pfad });
    }
  }
  if (upErr.length) console.error('[konfig-checkout] Upload:', upErr.join('; '));

  // Empfehlungs-Kuerzel (Werber): vereinheitlicht auf Grossbuchstaben, damit
  // "egli", " Egli " und "EGLI" als EIN Werber zaehlen. Bewusst KEINE
  // Pruefung gegen die Werber-Liste — ein Tippfehler darf nie eine
  // Bestellung verhindern; unbekannte Kuerzel tauchen in der Admin-
  // Uebersicht gesondert auf, dort sieht Manolo sie.
  const werber = text(roh.werber).toUpperCase().replace(/[^A-Z0-9-]/g, '').slice(0, 20) || null;

  const { error: updErr } = await db.from('orders').update({
    werber,
    konfiguration: {
      typ: 'konfigurator-bestellung',
      positionen: positionen.map((p) => ({ typ: p.typ, titel: p.titel, menge: p.menge, preisRappen: p.preis, konfig: p.konfig })),
      dateien: alleDateien,
    },
  }).eq('id', orderId);
  if (updErr) console.error('[konfig-checkout] konfiguration speichern:', updErr.message);

  // ---- Mail + QR über alle Positionen ------------------------------------
  // Wunsch-Sujet dabei? Dann erst prüfen, dann Rechnung — die Bestätigung
  // geht ohne Zahlungsangaben raus (gilt für die GANZE Bestellung, auch bei
  // gemischtem Warenkorb: einfacher als splitten, die Prüfung ist schnell).
  const wunschPos = positionen.find((p) => p.typ === 'ventilkappe' && p.konfig?.sujet === 'wunsch');
  const wunschMotiv = typeof wunschPos?.konfig?.wunsch === 'string' ? wunschPos.konfig.wunsch.slice(0, 60) : undefined;
  const mailBestellung: MailBestellung = {
    orderNumber, email, name, strasse, plz, ort, land, versandart, versandRappen, subtotalRappen, totalRappen,
    bemerkung: text(roh.bemerkung) || undefined,
    positionen: positionen.map((p) => ({ titel: p.titel, qty: 1, preisRappen: p.preis })),
    ...(wunschPos ? { wunschPruefung: true, ...(wunschMotiv ? { wunschMotiv } : {}) } : {}),
  };
  try { await getPaymentProvider().createCheckout({ orderId, bestellung: mailBestellung }); }
  catch (e) { console.error('[konfig-checkout] Mailversand:', e); }

  return json({ ok: true, weiter: `/bestellung/danke?nr=${encodeURIComponent(orderNumber)}` });
};
