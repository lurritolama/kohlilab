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
  /** Kundentext des Wunsch-Motivs («Trikot FC Barcelona») für die Anrede im Mailtext. */
  wunschMotiv?: string;
  /**
   * Bestellnummer der Offerte, aus der diese Bestellung entstanden ist
   * (Spezialanfertigung, z. B. «OF-2026-0001»). Ändert nur die Anrede — der
   * Rest der Bestätigung ist bewusst identisch mit jeder anderen Bestellung:
   * gleiche Zahlungsangaben, gleiche QR-Rechnung, gleicher Ablauf.
   */
  ausOfferte?: string;
}

/** «Hoi Benjamin» statt «Hallo Benjamin Huber» — Vorname reicht unter Werkstatt-Leuten. */
function vorname(name: string): string {
  return (name || '').trim().split(/\s+/)[0] || name;
}

const GRUSS_HTML = `<p style="color:#1c1c1c;margin-top:20px;">Sportliche Grüsse aus der Werkstatt in Bühler<br><strong>Manu · KohliLab</strong></p>`;
const GRUSS_TEXT = `Sportliche Grüsse aus der Werkstatt in Bühler\nManu · KohliLab`;

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

function zahlungBlockHtml(b: MailBestellung, zahlung: ZahlungAngaben, mitAbschluss = true): string {
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
      ${mitAbschluss ? `<p style="color:#1c1c1c;">Sobald deine Zahlung bei uns ist, drucken wir deine Teile und machen das Paket bereit.</p>` : ''}`;
}

function zahlungBlockText(b: MailBestellung, zahlung: ZahlungAngaben, mitAbschluss = true): string {
  const betrag = formatPreis(b.totalRappen);
  return `So kannst du bezahlen – ${zahlung.mitQrPdf ? 'am einfachsten mit der beigelegten QR-Rechnung (PDF) in deiner Banking-App scannen. Oder von Hand:' : 'per Banküberweisung mit den folgenden Angaben:'}
  Empfänger: ${EMPFAENGER_ZEILE}
  IBAN: ${formatIban(zahlung.iban)}
  Betrag: ${betrag}
  Mitteilung: Bestellung ${b.orderNumber}${zahlung.twintTel ? `\n  Oder TWINT an ${zahlung.twintTel} – Betrag ${betrag}, Mitteilung «Bestellung ${b.orderNumber}».` : ''}${mitAbschluss ? `

Sobald deine Zahlung bei uns ist, drucken wir deine Teile und machen das Paket bereit.` : ''}`;
}

const wunschPruefHtml = (motiv?: string) =>
  `<p style="color:#1c1c1c;">So geht's weiter: Ich schaue mir dein Motiv persönlich an und prüfe, ob es sich als Ventilkappe sauber drucken lässt. In der Regel hörst du <strong>innert 1–2 Tagen</strong> von mir. Erst wenn es klappt, bekommst du die Rechnung — und falls es nicht umsetzbar ist, stornieren wir kostenlos und du hörst von mir, woran es lag.</p>`;
const wunschPruefText = (motiv?: string) =>
  `So geht's weiter: Ich schaue mir dein Motiv persönlich an und prüfe, ob es sich als Ventilkappe sauber drucken lässt. In der Regel hörst du innert 1–2 Tagen von mir. Erst wenn es klappt, bekommst du die Rechnung — und falls es nicht umsetzbar ist, stornieren wir kostenlos und du hörst von mir, woran es lag.`;
const wunschDankHtml = (motiv?: string) =>
  `<p style="color:#1c1c1c;">Merci für deine Bestellung — und für dein Wunsch-Motiv${motiv ? `: <strong>«${esc(motiv)}»</strong>` : ''}. Genau für solche Ideen haben wir die Wunsch-Option gebaut.</p>`;
const wunschDankText = (motiv?: string) =>
  `Merci für deine Bestellung — und für dein Wunsch-Motiv${motiv ? `: «${motiv}»` : ''}. Genau für solche Ideen haben wir die Wunsch-Option gebaut.`;

export function mailAnfrageKunde(b: MailBestellung, zahlung?: ZahlungAngaben): MailInhalt {
  const abholung = b.versandart === 'abholung';

  const zahlungHtml = zahlung
    ? zahlungBlockHtml(b, zahlung)
    : b.wunschPruefung
      ? wunschPruefHtml(b.wunschMotiv)
      : `<p style="color:#1c1c1c;"><strong>Wir melden uns in den nächsten Tagen persönlich bei dir</strong>, um die Zahlung zu besprechen.</p>`;

  const zahlungText = zahlung
    ? zahlungBlockText(b, zahlung)
    : b.wunschPruefung
      ? wunschPruefText(b.wunschMotiv)
      : `Wir melden uns in den nächsten Tagen persönlich bei dir, um die Zahlung zu besprechen.`;

  const dankHtml = b.wunschPruefung
    ? wunschDankHtml(b.wunschMotiv)
    : b.ausOfferte
      ? `<p style="color:#1c1c1c;">Danke für deine Zusage zur Offerte <strong>${esc(b.ausOfferte)}</strong> — der Auftrag ist erteilt und trägt ab jetzt die Bestellnummer ${esc(b.orderNumber)}.</p>`
      : `<p style="color:#1c1c1c;">Danke für deine Bestellung bei KohliLab. Sie ist bei uns angekommen.</p>`;
  const dankText = b.wunschPruefung
    ? wunschDankText(b.wunschMotiv)
    : b.ausOfferte
      ? `Danke für deine Zusage zur Offerte ${b.ausOfferte} — der Auftrag ist erteilt und trägt ab jetzt die Bestellnummer ${b.orderNumber}.`
      : `Danke für deine Bestellung (${b.orderNumber}). Sie ist bei uns angekommen.`;

  return {
    an: b.email,
    betreff: `Deine Bestellung ${b.orderNumber} – ${SHOP.name}`,
    html: rahmen(`
      <p style="color:#1c1c1c;">Hoi ${esc(vorname(b.name))}</p>
      ${dankHtml}
      ${zahlungHtml}
      ${positionenHtml(b)}
      <p style="color:#666;font-size:14px;">Bestellnummer: ${esc(b.orderNumber)}<br>
      ${abholung ? `Abholung in ${SHOP.ort} nach Absprache.` : `Lieferadresse: ${esc(b.strasse)}, ${esc(b.plz)} ${esc(b.ort)} (${esc(b.land)})`}</p>
      ${b.wunschPruefung ? GRUSS_HTML : ''}
    `),
    text: `Hoi ${vorname(b.name)}

${dankText}

${zahlungText}

${positionenText(b)}

${abholung ? `Abholung in ${SHOP.ort} nach Absprache.` : `Lieferadresse: ${b.strasse}, ${b.plz} ${b.ort} (${b.land})`}
${b.wunschPruefung ? `\n${GRUSS_TEXT}\n` : ''}
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
  const motiv = b.wunschMotiv ? `dein «${b.wunschMotiv}»` : 'dein Wunsch-Motiv';
  // Produktbild als Inline-Anhang (cid) — der Aufrufer haengt die Bilddatei
  // mit contentId 'produktbild' an. Nicht als Daten-URI: Gmail blockt die.
  const bildHtml = mitBild
    ? `
      <p style="color:#1c1c1c;">So sieht deine Kappe aus:</p>
      <img src="cid:produktbild" alt="Produktbild deiner Wunsch-Ventilkappe"
           width="504" style="width:100%;max-width:504px;border-radius:6px;display:block;margin:4px 0 16px;" />`
    : '';
  const weiter = abholung
    ? 'Sobald deine Zahlung da ist, lege ich den Druck auf die Maschine. Bei Abholung melde ich mich, sobald dein Set bereit ist.'
    : 'Sobald deine Zahlung da ist, lege ich den Druck auf die Maschine — danach geht dein Set per Post zu dir.';
  return {
    an: b.email,
    betreff: `Dein Wunsch-Sujet ist machbar – Rechnung zu Bestellung ${b.orderNumber}`,
    html: rahmen(`
      <p style="color:#1c1c1c;">Hoi ${esc(vorname(b.name))}</p>
      <p style="color:#1c1c1c;">Gute Nachricht aus der Werkstatt: <strong>${esc(motiv)} ist druckbar</strong> — und ich finde, es ist richtig schön geworden.${mitBild ? '' : ` ${weiter}`}</p>
      ${bildHtml}
      ${mitBild ? `<p style="color:#1c1c1c;">${esc(weiter)}</p>` : ''}
      ${zahlungBlockHtml(b, zahlung, false)}
      ${positionenHtml(b)}
      <p style="color:#666;font-size:14px;">Bestellnummer: ${esc(b.orderNumber)}<br>
      ${abholung ? `Abholung in ${SHOP.ort} nach Absprache.` : `Lieferadresse: ${esc(b.strasse)}, ${esc(b.plz)} ${esc(b.ort)} (${esc(b.land)})`}</p>
      <p style="color:#1c1c1c;margin-top:20px;">Merci für dein Vertrauen${abholung ? ' — und bis bald in Bühler' : ''}<br><strong>Manu · KohliLab</strong></p>
    `),
    text: `Hoi ${vorname(b.name)}

Gute Nachricht aus der Werkstatt: ${motiv.replace('dein ', 'Dein ')} ist druckbar — und ich finde, es ist richtig schön geworden. ${weiter}

${zahlungBlockText(b, zahlung, false)}

${positionenText(b)}

${abholung ? `Abholung in ${SHOP.ort} nach Absprache.` : `Lieferadresse: ${b.strasse}, ${b.plz} ${b.ort} (${b.land})`}

Merci für dein Vertrauen${abholung ? ' — und bis bald in Bühler' : ''}
Manu · KohliLab

${VAT_HINWEIS}
${SHOP.name}, ${SHOP.ort}`,
  };
}

export function mailBenachrichtigungBetreiberin(
  b: MailBestellung,
  shopEmail: string,
  modus: 'anfrage' | 'bezahlt',
): MailInhalt {
  // Aus einer Offerte entstanden? Dann heisst das Ereignis fuer Manolo nicht
  // «neue Bestellung», sondern «Offerte angenommen» — die Bestellung selbst
  // hat er ja schon als Offerte gesehen.
  const titel = b.ausOfferte
    ? `Offerte angenommen: ${b.ausOfferte}`
    : modus === 'anfrage' ? 'Neue Bestellung (Zahlung offen)' : 'Neue bezahlte Bestellung';
  const offerteHtml = b.ausOfferte
    ? `<p style="color:#1c1c1c;">Daraus ist die Bestellung <strong>${esc(b.orderNumber)}</strong> geworden.
       Die Rechnung ist bereits unterwegs; sobald das Geld da ist, kannst du drucken.</p>`
    : '';
  return {
    an: shopEmail,
    antwortAn: b.email,
    betreff: `${titel} ${b.orderNumber} – ${formatPreis(b.totalRappen)}`,
    html: rahmen(`
      <p style="color:#1c1c1c;"><strong>${titel}</strong> von ${esc(b.name)} (${esc(b.email)})</p>
      ${offerteHtml}
      ${modus === 'anfrage' && !b.ausOfferte ? '<p style="color:#1c1c1c;">Zahlung ist noch offen. Antworten auf diese Mail geht direkt an die Kundschaft.</p>' : ''}
      ${positionenHtml(b)}
      <p style="color:#666;font-size:14px;">
        ${esc(b.name)}<br>${esc(b.strasse)}<br>${esc(b.plz)} ${esc(b.ort)} (${esc(b.land)})<br>
        Versand: ${versandLabel(b.versandart)}
        ${b.bemerkung ? `<br><br>Bemerkung: ${esc(b.bemerkung)}` : ''}
      </p>
    `),
    text: `${titel} ${b.orderNumber} von ${b.name} (${b.email})
${b.ausOfferte ? `\nDaraus ist die Bestellung ${b.orderNumber} geworden. Die Rechnung ist bereits unterwegs.\n` : ''}
${positionenText(b)}

${b.name}
${b.strasse}
${b.plz} ${b.ort} (${b.land})
Versand: ${versandLabel(b.versandart)}
${b.bemerkung ? `\nBemerkung: ${b.bemerkung}` : ''}`,
  };
}

/**
 * Meldung an den Betrieb, wenn eine Offerte ABGELEHNT wurde.
 *
 * Für die Zusage braucht es keine eigene Meldung: dort entsteht eine
 * Bestellung, und die meldet der übliche Weg schon.
 */
export function mailOfferteAbsageBetreiber(
  o: { offerNumber: string; email: string; kundeName: string; titel: string; totalRappen: number },
  shopEmail: string,
): MailInhalt {
  return {
    an: shopEmail,
    antwortAn: o.email,
    betreff: `Offerte abgelehnt: ${o.offerNumber} – ${o.titel}`,
    html: rahmen(`
      <p style="color:#1c1c1c;font-size:18px;"><strong>Offerte abgelehnt</strong></p>
      <p style="color:#1c1c1c;">${esc(o.kundeName)} (${esc(o.email)}) hat die Offerte
      <strong>${esc(o.offerNumber)}</strong> über ${formatPreis(o.totalRappen)} abgelehnt.</p>
      <p style="color:#1c1c1c;">${esc(o.titel)}</p>
      <p style="color:#666;font-size:14px;">Es entstehen keine Kosten. Die Offerte steht im Admin
      als abgelehnt. Antworten auf diese Mail geht direkt an die Kundschaft.</p>
    `),
    text: `Offerte abgelehnt

${o.kundeName} (${o.email}) hat die Offerte ${o.offerNumber} über ${formatPreis(o.totalRappen)} abgelehnt.
${o.titel}

Es entstehen keine Kosten. Die Offerte steht im Admin als abgelehnt.
Antworten auf diese Mail geht direkt an die Kundschaft.`,
  };
}

/**
 * Bestätigung nach einer ABSAGE zur Offerte.
 *
 * Bewusst kurz und ohne Nachfassen: Wer absagt, hat entschieden. Die Mail
 * bestätigt nur, dass die Absage angekommen ist und nichts kostet — sonst
 * bleibt die Unsicherheit, ob doch noch eine Rechnung kommt.
 */
export function mailOfferteAbgesagt(o: {
  offerNumber: string;
  email: string;
  kundeName: string;
  titel: string;
}): MailInhalt {
  return {
    an: o.email,
    betreff: `Offerte ${o.offerNumber} abgesagt – ${SHOP.name}`,
    html: rahmen(`
      <p style="color:#1c1c1c;">Hoi ${esc(vorname(o.kundeName))}</p>
      <p style="color:#1c1c1c;">Deine Absage zur Offerte <strong>${esc(o.offerNumber)}</strong>
      (${esc(o.titel)}) ist angekommen. <strong>Es entstehen dir keine Kosten</strong> —
      die Machbarkeitsprüfung und die Offerte sind bei uns gratis.</p>
      <p style="color:#1c1c1c;">Falls du es dir anders überlegst oder etwas anderes brauchst:
      schreib oder ruf einfach an, wir rechnen dir gerne neu.</p>
      ${GRUSS_HTML}
    `),
    text: `Hoi ${vorname(o.kundeName)}

Deine Absage zur Offerte ${o.offerNumber} (${o.titel}) ist angekommen.
Es entstehen dir keine Kosten - die Machbarkeitsprüfung und die Offerte
sind bei uns gratis.

Falls du es dir anders überlegst oder etwas anderes brauchst: schreib oder
ruf einfach an, wir rechnen dir gerne neu.

${GRUSS_TEXT}

${VAT_HINWEIS}
${SHOP.name}, ${SHOP.ort}`,
  };
}
