/**
 * POST /api/offerte-antwort – die Kundschaft entscheidet über eine Offerte.
 *
 *   { token, antwort: 'ja' }   -> Bestellung entsteht, Rechnung geht raus
 *   { token, antwort: 'nein' } -> kostenlos abgesagt
 *
 * Der Token aus der Mail ist der einzige Ausweis. Er ist 32 Hexzeichen lang
 * und wird nie irgendwo aufgelistet; wer ihn hat, hat die Mail bekommen.
 *
 * Der Entscheid wird ZUERST beansprucht und erst danach ausgeführt: Ein
 * Doppelklick oder ein zweiter Browser darf nicht zwei Bestellungen aus einer
 * Offerte machen. `entschieden_am` dient dabei als Riegel — es lässt sich nur
 * setzen, solange es leer ist, und das prüft die Datenbank, nicht diese Datei.
 */
export const prerender = false;

import type { APIRoute } from 'astro';
import { supabaseAdmin } from '../../lib/server/supabase-admin';
import { sendeMail } from '../../lib/server/mail';
import { mailOfferteAbgesagt, mailOfferteAbsageBetreiber, type MailBestellung } from '../../lib/server/mail-templates';
import { getPaymentProvider } from '../../lib/payments';
import type { VersandartId } from '../../lib/config';

/** Ankerprodukt für Spezialanfertigungen (siehe Migration 20260814130000). */
const ANKER_SPEZIAL = 'c0111ab0-0000-4000-8000-000000000004';
const SHOP_ID = 'kohlilab';

function json(daten: unknown, status = 200): Response {
  return new Response(JSON.stringify(daten), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
}

/** Heute als ISO-Datum in Schweizer Zeit — für den Ablaufvergleich. */
function heute(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Zurich' }).format(new Date());
}

export const POST: APIRoute = async ({ request }) => {
  const db = supabaseAdmin();

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return json({ ok: false, fehler: 'Unlesbare Anfrage.' }, 400);
  }

  const token = String(body.token ?? '').trim();
  const antwort = String(body.antwort ?? '');
  if (!/^[a-f0-9]{32}$/.test(token)) return json({ ok: false, fehler: 'Der Link stimmt nicht.' }, 400);
  if (antwort !== 'ja' && antwort !== 'nein') {
    return json({ ok: false, fehler: 'Unbekannte Antwort.' }, 400);
  }

  const { data: offerte, error: ladeFehler } = await db
    .from('offers')
    .select('*')
    .eq('token', token)
    .maybeSingle();
  if (ladeFehler) {
    console.error('[offerte-antwort] Laden:', ladeFehler.message);
    return json({ ok: false, fehler: 'Das hat gerade nicht geklappt.' }, 500);
  }
  if (!offerte) return json({ ok: false, fehler: 'Diese Offerte gibt es nicht.' }, 404);

  if (offerte.status === 'angenommen' || offerte.status === 'abgelehnt') {
    // Kein Fehler: die Seite lädt gleich neu und zeigt den Stand an.
    return json({ ok: true, schon: offerte.status });
  }
  if (offerte.status !== 'versendet') {
    return json({ ok: false, fehler: 'Diese Offerte ist noch nicht freigegeben.' }, 409);
  }
  if (heute() > offerte.gueltig_bis) {
    return json(
      { ok: false, fehler: 'Diese Offerte ist abgelaufen. Melde dich kurz, wir rechnen sie gerne neu.' },
      409,
    );
  }

  // --- Entscheid beanspruchen -------------------------------------------
  // Die Bedingung `entschieden_am is null` macht daraus einen Riegel: Von
  // zwei gleichzeitigen Klicks kommt genau einer durch, der andere zählt
  // null geänderte Zeilen.
  const { count: beansprucht, error: riegelFehler } = await db
    .from('offers')
    .update({ entschieden_am: new Date().toISOString() }, { count: 'exact' })
    .eq('id', offerte.id)
    .eq('status', 'versendet')
    .is('entschieden_am', null);
  if (riegelFehler) {
    console.error('[offerte-antwort] Riegel:', riegelFehler.message);
    return json({ ok: false, fehler: 'Das hat gerade nicht geklappt.' }, 500);
  }
  if (!beansprucht) return json({ ok: true, schon: 'entschieden' });

  /** Riegel zurücknehmen, damit ein neuer Versuch möglich bleibt. */
  async function riegelLoesen(): Promise<void> {
    await db.from('offers').update({ entschieden_am: null }).eq('id', offerte!.id);
  }

  // --- Absage ------------------------------------------------------------
  if (antwort === 'nein') {
    const { error } = await db.from('offers').update({ status: 'abgelehnt' }).eq('id', offerte.id);
    if (error) {
      console.error('[offerte-antwort] Absage:', error.message);
      await riegelLoesen();
      return json({ ok: false, fehler: 'Das hat gerade nicht geklappt.' }, 500);
    }

    const env: Record<string, string | undefined> = {
      ...(import.meta.env as Record<string, string | undefined>),
      ...(typeof process !== 'undefined' ? process.env : {}),
    };
    const kern = {
      offerNumber: offerte.offer_number,
      email: offerte.email,
      kundeName: offerte.kunde_name,
      titel: offerte.titel,
    };
    // Mailfehler kippen die Absage nicht mehr — sie steht bereits fest.
    await sendeMail(mailOfferteAbgesagt(kern));
    if (env.SHOP_EMAIL) {
      await sendeMail(mailOfferteAbsageBetreiber({ ...kern, totalRappen: offerte.total_rappen }, env.SHOP_EMAIL));
    }
    return json({ ok: true, status: 'abgelehnt' });
  }

  // --- Zusage: daraus wird eine Bestellung -------------------------------
  // EINE Position mit dem Auftragstitel. Die Aufschlüsselung war die Offerte;
  // auf der Rechnung steht der vereinbarte Preis.
  const titelMitMenge = offerte.stueckzahl > 1
    ? `${offerte.titel} (${offerte.stueckzahl} Stück)`
    : offerte.titel;

  const { data: ergebnis, error: orderFehler } = await db.rpc('create_order', {
    p_bestellung: {
      shop: SHOP_ID,
      email: offerte.email,
      shipping_name: offerte.kunde_name,
      shipping_street: offerte.strasse,
      shipping_zip: offerte.plz,
      shipping_city: offerte.ort,
      shipping_country: offerte.land,
      phone: offerte.telefon,
      shipping_method: offerte.versand_art,
      shipping_cost_rappen: offerte.versand_rappen,
      subtotal_rappen: offerte.subtotal_rappen,
      total_rappen: offerte.total_rappen,
      note: `Aus Offerte ${offerte.offer_number}`,
    },
    p_positionen: [
      {
        product_id: ANKER_SPEZIAL,
        qty: 1,
        title_snapshot: titelMitMenge,
        price_rappen_snapshot: offerte.subtotal_rappen,
      },
    ],
  });

  if (orderFehler || !ergebnis) {
    console.error('[offerte-antwort] create_order:', orderFehler?.message);
    await riegelLoesen();
    return json(
      { ok: false, fehler: 'Die Bestellung liess sich nicht anlegen. Bitte versuch es nochmals oder ruf uns an.' },
      500,
    );
  }

  const { order_id: orderId, order_number: orderNumber } = ergebnis as {
    order_id: string;
    order_number: string;
  };

  const { error: abschlussFehler } = await db
    .from('offers')
    .update({ status: 'angenommen', order_id: orderId, order_number: orderNumber })
    .eq('id', offerte.id);
  if (abschlussFehler) {
    // Die Bestellung steht, die Offerte hängt. Nicht stornieren: lieber ein
    // sichtbarer Widerspruch im Admin als eine verschwundene Bestellung, für
    // die die Kundschaft schon zugesagt hat.
    console.error(
      `[offerte-antwort] Offerte ${offerte.offer_number} bleibt offen, obwohl Bestellung `
      + `${orderNumber} angelegt wurde: ${abschlussFehler.message}`,
    );
  }

  // Herkunft festhalten — im Admin ist damit sichtbar, dass diese Bestellung
  // aus einer Offerte stammt und nicht aus einem Konfigurator.
  await db
    .from('orders')
    .update({ konfiguration: { typ: 'offerte', offerNumber: offerte.offer_number, offerId: offerte.id } })
    .eq('id', orderId);

  // Bestätigung mit QR-Rechnung + Meldung an den Betrieb. Derselbe Weg wie
  // bei jeder Konfigurator-Bestellung, damit es nur EINE Rechnungslogik gibt.
  const mailBestellung: MailBestellung = {
    orderNumber,
    email: offerte.email,
    name: offerte.kunde_name,
    strasse: offerte.strasse,
    plz: offerte.plz,
    ort: offerte.ort,
    land: offerte.land,
    versandart: offerte.versand_art as VersandartId,
    versandRappen: offerte.versand_rappen,
    subtotalRappen: offerte.subtotal_rappen,
    totalRappen: offerte.total_rappen,
    positionen: [{ titel: titelMitMenge, qty: 1, preisRappen: offerte.subtotal_rappen }],
    ausOfferte: offerte.offer_number,
  };
  try {
    await getPaymentProvider().createCheckout({ orderId, bestellung: mailBestellung });
  } catch (fehler) {
    // Die Bestellung ist angelegt und die Zusage gilt — sie darf an einem
    // Mailproblem nicht scheitern. Manolo sieht sie im Admin.
    console.error('[offerte-antwort] Mailversand:', fehler);
  }

  return json({ ok: true, status: 'angenommen', orderNumber });
};
