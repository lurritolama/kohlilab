/**
 * POST /api/wunsch-freigabe   { orderNumber, secret }
 *
 * Zweiter Schritt des Wunsch-Sujet-Ablaufs: Die Bestellbestätigung ging
 * bewusst OHNE Zahlungsangaben raus (erst Machbarkeit prüfen — Versprechen
 * «stornieren wir kostenlos»). Nach Manolos Freigabe schickt dieser Endpoint
 * dem Kunden die Rechnung: gleiche Zahlungsmaschinerie wie die normale
 * Bestätigung (QR-PDF, IBAN, TWINT), eigener Mailtext «Sujet ist machbar».
 *
 * Geschützt über WUNSCH_FREIGABE_SECRET (Umgebung) — wird vom
 * wunsch-sujet-pruefen-Ablauf aufgerufen, nicht von der Website.
 */
export const prerender = false;

import type { APIRoute } from 'astro';
import { SHOP_ID, versandLabel, type VersandartId } from '../../lib/config';
import { supabaseAdmin } from '../../lib/server/supabase-admin';
import { sendeMail } from '../../lib/server/mail';
import { mailWunschFreigabe, type MailBestellung, type ZahlungAngaben } from '../../lib/server/mail-templates';
import { baueQrRechnungPdf } from '../../lib/server/qr-rechnung';

function json(daten: unknown, status = 200): Response {
  return new Response(JSON.stringify(daten), { status, headers: { 'Content-Type': 'application/json; charset=utf-8' } });
}

export const POST: APIRoute = async ({ request }) => {
  let roh: any;
  try { roh = await request.json(); } catch { return json({ ok: false, fehler: 'Anfrage unlesbar.' }, 400); }

  const env: Record<string, string | undefined> = { ...(import.meta.env as any), ...(typeof process !== 'undefined' ? process.env : {}) };
  const secret = env.WUNSCH_FREIGABE_SECRET;
  if (!secret || roh?.secret !== secret) return json({ ok: false, fehler: 'Nicht erlaubt.' }, 403);

  const orderNumber = typeof roh?.orderNumber === 'string' ? roh.orderNumber.trim() : '';
  if (!orderNumber) return json({ ok: false, fehler: 'orderNumber fehlt.' }, 400);

  // Optionales Produktbild (Blender-Render der Kappe) — landet inline in der
  // Mail («So sieht deine Kappe aus»). Base64, grosszuegig auf 3 MB gekappt.
  let bild: Buffer | null = null;
  if (typeof roh?.bildBase64 === 'string' && roh.bildBase64.length > 100) {
    try {
      const b = Buffer.from(roh.bildBase64, 'base64');
      if (b.length > 0 && b.length <= 3 * 1024 * 1024) bild = b;
      else return json({ ok: false, fehler: 'Produktbild groesser als 3 MB.' }, 400);
    } catch { return json({ ok: false, fehler: 'bildBase64 unlesbar.' }, 400); }
  }

  let db: ReturnType<typeof supabaseAdmin>;
  try { db = supabaseAdmin(); } catch (e) { console.error('[wunsch-freigabe]', e); return json({ ok: false, fehler: 'DB nicht erreichbar.' }, 503); }

  const { data: order, error } = await db.from('orders')
    .select('id, order_number, email, shipping_name, shipping_street, shipping_zip, shipping_city, shipping_country, shipping_method, shipping_cost_rappen, subtotal_rappen, total_rappen, note, status, konfiguration')
    .eq('shop', SHOP_ID).eq('order_number', orderNumber).maybeSingle();
  if (error) { console.error('[wunsch-freigabe]', error.message); return json({ ok: false, fehler: 'DB-Fehler.' }, 500); }
  if (!order) return json({ ok: false, fehler: `Bestellung ${orderNumber} nicht gefunden.` }, 404);

  const positionen: any[] = order.konfiguration?.positionen ?? [];
  const hatWunsch = positionen.some((p) => p?.typ === 'ventilkappe' && p?.konfig?.sujet === 'wunsch');
  if (!hatWunsch) return json({ ok: false, fehler: `${orderNumber} enthält kein Wunsch-Sujet.` }, 400);
  if (order.status === 'cancelled') return json({ ok: false, fehler: `${orderNumber} ist storniert.` }, 400);

  const iban = env.ZAHLUNG_IBAN?.trim();
  if (!iban) return json({ ok: false, fehler: 'Keine IBAN hinterlegt.' }, 500);
  const twintTel = env.ZAHLUNG_TWINT_TEL?.trim();

  const b: MailBestellung = {
    orderNumber: order.order_number, email: order.email, name: order.shipping_name,
    strasse: order.shipping_street, plz: order.shipping_zip, ort: order.shipping_city, land: order.shipping_country,
    versandart: order.shipping_method as VersandartId, versandRappen: order.shipping_cost_rappen,
    subtotalRappen: order.subtotal_rappen, totalRappen: order.total_rappen,
    positionen: positionen.map((p) => ({ titel: p.titel, qty: p.menge ?? 1, preisRappen: p.preisRappen })),
  };

  const datum = new Date().toLocaleDateString('de-CH', { day: '2-digit', month: '2-digit', year: 'numeric' });
  const pdf = await baueQrRechnungPdf(
    {
      orderNumber: b.orderNumber, datum, totalRappen: b.totalRappen, subtotalRappen: b.subtotalRappen,
      versandRappen: b.versandRappen, versandLabel: versandLabel(b.versandart), positionen: b.positionen,
      debtorName: b.name, debtorStrasse: b.strasse, debtorPlz: b.plz, debtorOrt: b.ort, debtorLand: b.land,
      ...(twintTel ? { twintTel } : {}),
    },
    iban,
  );
  const zahlung: ZahlungAngaben = { iban, ...(twintTel ? { twintTel } : {}), mitQrPdf: pdf !== null };

  const mail = mailWunschFreigabe(b, zahlung, bild !== null);
  mail.anhaenge = [];
  if (bild) mail.anhaenge.push({ filename: 'produktbild.png', inhaltBase64: bild.toString('base64'), contentId: 'produktbild' });
  if (pdf) mail.anhaenge.push({ filename: `QR-Rechnung-${b.orderNumber}.pdf`, inhaltBase64: pdf.toString('base64') });
  try { await sendeMail(mail); }
  catch (e) { console.error('[wunsch-freigabe] Mail:', e); return json({ ok: false, fehler: 'Mailversand fehlgeschlagen.' }, 500); }

  return json({ ok: true, an: order.email, orderNumber: order.order_number });
};
