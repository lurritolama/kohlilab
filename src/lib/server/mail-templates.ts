/**
 * E-Mail-Templates für KohliLab: Bestellbestätigung an die Kundschaft und
 * Benachrichtigung an den Betrieb. Schlicht, eine Tabelle fürs Layout (Mail-
 * Clients können nichts anderes zuverlässig), dezentes KohliLab-Branding
 * (Werkstatt-Look: dunkel + Orange).
 */
import { SHOP, versandLabel, VAT_HINWEIS, ZAHLUNG_EMPFAENGER, type VersandartId } from '../config';
import { formatPreis } from '../format';
import type { MailInhalt } from './mail';

export interface ZahlungAngaben {
  iban: string;
  twintTel?: string;
  mitQrPdf?: boolean;
}

function formatIban(iban: string): string {
  return iban.replace(/\s/g, '').replace(/(.{4})/g, '$1 ').trim();
}

const EMPFAENGER_ZEILE = `${ZAHLUNG_EMPFAENGER.name}, ${ZAHLUNG_EMPFAENGER.strasse} ${ZAHLUNG_EMPFAENGER.hausnummer}, ${ZAHLUNG_EMPFAENGER.plz} ${ZAHLUNG_EMPFAENGER.ort}`;

export interface MailBestellung {
  orderNumber: string;
  email: string;
  name: string;
  strasse: string;
  plz: string;
  ort: string;
  land: string;
  versandart: VersandartId;
  versandRappen: number;
  subtotalRappen: number;
  totalRappen: number;
  bemerkung?: string;
  positionen: { titel: string; qty: number; preisRappen: number }[];
  /**
   * Bestellung enthält ein Wunsch-Sujet: die Bestätigung geht OHNE
   * Zahlungsangaben raus (erst Machbarkeit prüfen, dann Rechnung) —
   * das Website-Versprechen «stornieren wir kostenlos» wäre sonst
   * gebrochen, sobald jemand die QR-Rechnung sofort bezahlt.
   */
  wunschPruefung?: boolean;
}

function esc(text: string): string {
  return text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
}

function positionenHtml(b: MailBestellung): string {
  const zeilen = b.positionen
    .map((p) => `
      <tr>
        <td style="padding:6px 0;color:#1c1c1c;">${p.qty} × ${esc(p.titel)}</td>
        <td style="padding:6px 0;color:#1c1c1c;text-align:right;white-space:nowrap;">${formatPreis(p.preisRappen * p.qty)}</td>
      </tr>`)
    .join('');
  return `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid #ddd;border-bottom:1px solid #ddd;margin:16px 0;">
      ${zeilen}
      <tr>
        <td style="padding:6px 0;color:#666;">Versand (${versandLabel(b.versandart)})</td>
        <td style="padding:6px 0;color:#666;text-align:right;">${formatPreis(b.versandRappen)}</td>
      </tr>
      <tr>
        <td style="padding:10px 0;color:#141517;font-weight:bold;border-top:1px solid #ddd;">Total</td>
        <td style="padding:10px 0;color:#141517;font-weight:bold;text-align:right;border-top:1px solid #ddd;">${formatPreis(b.totalRappen)}</td>
      </tr>
    </table>`;
}

function positionenText(b: MailBestellung): string {
  const zeilen = b.positionen.map((p) => `  ${p.qty} x ${p.titel} – ${formatPreis(p.preisRappen * p.qty)}`).join('\n');
  return `${zeilen}\n  Versand (${versandLabel(b.versandart)}) – ${formatPreis(b.versandRappen)}\n  Total: ${formatPreis(b.totalRappen)}`;
}

function rahmen(inhalt: string): string {
  return `
  <div style="background-color:#f2f2f0;padding:24px 12px;font-family:Arial,Helvetica,sans-serif;">
    <div style="max-width:560px;margin:0 auto;background-color:#ffffff;border:1px solid #ddd;border-radius:6px;overflow:hidden;">
      <div style="background-color:#141517;padding:18px 28px;">
        <span style="color:#e8e6e1;font-size:20px;font-weight:bold;letter-spacing:0.06em;">KOHLI<span style="color:#ff6b1a;">LAB</span></span>
      </div>
      <div style="padding:28px;">
        ${inhalt}
        <p style="margin:24px 0 0;font-size:12px;color:#666;">${VAT_HINWEIS}<br>${SHOP.name}, ${SHOP.ort}</p>
      </div>
    </div>
  </div>`;
}

function zahlungBlockHtml(b: MailBestellung, zahlung: ZahlungAngaben): string {
  const betrag = formatPreis(b.totalRappen);
  const einleitung = zahlung.mitQrPdf
    ? 'am einfachsten mit der beigelegten QR-Rechnung (PDF): in deiner Banking-App scannen, Betrag und Referenz sind schon drin.'
    : 'per Banküberweisung mit den folgenden Angaben:';
  return `
      <p style="color:#1c1c1c;"><strong>So kannst du bezahlen</strong> – ${einleitung}</p>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f5f5f3;border:1px solid #ddd;border-radius:4px;margin:8px 0 16px;">
        <tr><td style="padding:14px 16px;color:#1c1c1c;font-size:14px;line-height:1.7;">
          <strong>Empfänger:</strong> ${esc(EMPFAENGER_ZEILE)}<br>
          <strong>IBAN:</strong> ${esc(formatIban(zahlung.iban))}<br>
          <strong>Betrag:</strong> ${betrag}<br>
          <strong>Mitteilung:</strong> Bestellung ${esc(b.orderNumber)}
          ${zahlung.twintTel ? `<br><br><strong>Oder TWINT:</strong> an ${esc(zahlung.twintTel)} senden – Betrag ${betrag}, Mitteilung «Bestellung ${esc(b.orderNumber)}».` : ''}
        </td></tr>
      </table>
      <p style="color:#1c1c1c;">Sobald deine Zahlung bei uns ist, drucken wir deine Teile und machen das Paket bereit.</p>`;
}

function zahlungBlockText(b: MailBestellung, zahlung: ZahlungAngaben): string {
  const betrag = formatPreis(b.totalRappen);
  return `So kannst du bezahlen – ${zahlung.mitQrPdf ? 'am einfachsten mit der beigelegten QR-Rechnung (PDF) in deiner Banking-App scannen. Oder von Hand:' : 'per Banküberweisung mit den folgenden Angaben:'}
  Empfänger: ${EMPFAENGER_ZEILE}
  IBAN: ${formatIban(zahlung.iban)}
  Betrag: ${betrag}
  Mitteilung: Bestellung ${b.orderNumber}${zahlung.twintTel ? `\n  Oder TWINT an ${zahlung.twintTel} – Betrag ${betrag}, Mitteilung «Bestellung ${b.orderNumber}».` : ''}

Sobald deine Zahlung bei uns ist, drucken wir deine Teile und machen das Paket bereit.`;
}

const WUNSCH_PRUEF_HTML = `<p style="color:#1c1c1c;"><strong>Zuerst prüfen wir dein Wunsch-Sujet.</strong> In der Regel hörst du innert 1–2 Tagen von uns, ob dein Motiv umsetzbar ist. Erst nach der Freigabe schicken wir dir die Rechnung mit den Zahlungsangaben — ist das Motiv nicht umsetzbar, stornieren wir kostenlos.</p>`;
const WUNSCH_PRUEF_TEXT = `Zuerst prüfen wir dein Wunsch-Sujet. In der Regel hörst du innert 1–2 Tagen von uns, ob dein Motiv umsetzbar ist. Erst nach der Freigabe schicken wir dir die Rechnung mit den Zahlungsangaben — ist das Motiv nicht umsetzbar, stornieren wir kostenlos.`;

export function mailAnfrageKunde(b: MailBestellung, zahlung?: ZahlungAngaben): MailInhalt {
  const abholung = b.versandart === 'abholung';

  const zahlungHtml = zahlung
    ? zahlungBlockHtml(b, zahlung)
    : b.wunschPruefung
      ? WUNSCH_PRUEF_HTML
      : `<p style="color:#1c1c1c;"><strong>Wir melden uns in den nächsten Tagen persönlich bei dir</strong>, um die Zahlung zu besprechen.</p>`;

  const zahlungText = zahlung
    ? zahlungBlockText(b, zahlung)
    : b.wunschPruefung
      ? WUNSCH_PRUEF_TEXT
      : `Wir melden uns in den nächsten Tagen persönlich bei dir, um die Zahlung zu besprechen.`;

  return {
    an: b.email,
    betreff: `Deine Bestellung ${b.orderNumber} – ${SHOP.name}`,
    html: rahmen(`
      <p style="color:#1c1c1c;">Hallo ${esc(b.name)}</p>
      <p style="color:#1c1c1c;">Danke für deine Bestellung bei KohliLab. Sie ist bei uns angekommen.</p>
      ${zahlungHtml}
      ${positionenHtml(b)}
      <p style="color:#666;font-size:14px;">Bestellnummer: ${esc(b.orderNumber)}<br>
      ${abholung ? `Abholung in ${SHOP.ort} nach Absprache.` : `Lieferadresse: ${esc(b.strasse)}, ${esc(b.plz)} ${esc(b.ort)} (${esc(b.land)})`}</p>
    `),
    text: `Hallo ${b.name}

Danke für deine Bestellung (${b.orderNumber}). Sie ist bei uns angekommen.

${zahlungText}

${positionenText(b)}

${abholung ? `Abholung in ${SHOP.ort} nach Absprache.` : `Lieferadresse: ${b.strasse}, ${b.plz} ${b.ort} (${b.land})`}

${VAT_HINWEIS}
${SHOP.name}, ${SHOP.ort}`,
  };
}

/**
 * Zweite Mail nach der Machbarkeits-Prüfung eines Wunsch-Sujets: das Motiv
 * ist umsetzbar, jetzt kommt die Rechnung (QR-PDF im Anhang, wie bei der
 * normalen Bestätigung).
 */
export function mailWunschFreigabe(b: MailBestellung, zahlung: ZahlungAngaben, mitBild = false): MailInhalt {
  const abholung = b.versandart === 'abholung';
  // Produktbild als Inline-Anhang (cid) — der Aufrufer haengt die Bilddatei
  // mit contentId 'produktbild' an. Nicht als Daten-URI: Gmail blockt die.
  const bildHtml = mitBild
    ? `
      <p style="color:#1c1c1c;"><strong>So sieht deine Kappe aus:</strong></p>
      <img src="cid:produktbild" alt="Produktbild deiner Wunsch-Ventilkappe"
           width="504" style="width:100%;max-width:504px;border-radius:6px;display:block;margin:4px 0 16px;" />`
    : '';
  return {
    an: b.email,
    betreff: `Dein Wunsch-Sujet ist machbar – Rechnung zu Bestellung ${b.orderNumber}`,
    html: rahmen(`
      <p style="color:#1c1c1c;">Hallo ${esc(b.name)}</p>
      <p style="color:#1c1c1c;"><strong>Gute Nachricht:</strong> Wir haben dein Wunsch-Sujet geprüft — es ist umsetzbar und geht nach Zahlungseingang in den Druck.</p>
      ${bildHtml}
      ${zahlungBlockHtml(b, zahlung)}
      ${positionenHtml(b)}
      <p style="color:#666;font-size:14px;">Bestellnummer: ${esc(b.orderNumber)}<br>
      ${abholung ? `Abholung in ${SHOP.ort} nach Absprache.` : `Lieferadresse: ${esc(b.strasse)}, ${esc(b.plz)} ${esc(b.ort)} (${esc(b.land)})`}</p>
    `),
    text: `Hallo ${b.name}

Gute Nachricht: Wir haben dein Wunsch-Sujet geprüft — es ist umsetzbar und geht nach Zahlungseingang in den Druck.

${zahlungBlockText(b, zahlung)}

${positionenText(b)}

${abholung ? `Abholung in ${SHOP.ort} nach Absprache.` : `Lieferadresse: ${b.strasse}, ${b.plz} ${b.ort} (${b.land})`}

${VAT_HINWEIS}
${SHOP.name}, ${SHOP.ort}`,
  };
}

export function mailBenachrichtigungBetreiberin(
  b: MailBestellung,
  shopEmail: string,
  modus: 'anfrage' | 'bezahlt',
): MailInhalt {
  const titel = modus === 'anfrage' ? 'Neue Bestellung (Zahlung offen)' : 'Neue bezahlte Bestellung';
  return {
    an: shopEmail,
    antwortAn: b.email,
    betreff: `${titel} ${b.orderNumber} – ${formatPreis(b.totalRappen)}`,
    html: rahmen(`
      <p style="color:#1c1c1c;"><strong>${titel}</strong> von ${esc(b.name)} (${esc(b.email)})</p>
      ${modus === 'anfrage' ? '<p style="color:#1c1c1c;">Zahlung ist noch offen. Antworten auf diese Mail geht direkt an die Kundschaft.</p>' : ''}
      ${positionenHtml(b)}
      <p style="color:#666;font-size:14px;">
        ${esc(b.name)}<br>${esc(b.strasse)}<br>${esc(b.plz)} ${esc(b.ort)} (${esc(b.land)})<br>
        Versand: ${versandLabel(b.versandart)}
        ${b.bemerkung ? `<br><br>Bemerkung: ${esc(b.bemerkung)}` : ''}
      </p>
    `),
    text: `${titel} ${b.orderNumber} von ${b.name} (${b.email})

${positionenText(b)}

${b.name}
${b.strasse}
${b.plz} ${b.ort} (${b.land})
Versand: ${versandLabel(b.versandart)}
${b.bemerkung ? `\nBemerkung: ${b.bemerkung}` : ''}`,
  };
}
