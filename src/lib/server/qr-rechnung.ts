/**
 * Erzeugt eine Schweizer QR-Rechnung (QR-Bill) als PDF für eine Bestellung.
 *
 * Die A4-Seite hat zwei Teile: oben eine schlichte Rechnung (Empfänger,
 * Rechnungsnummer, Positionen, Beträge), unten der genormte Schweizer
 * QR-Zahlteil. `swissqrbill` liefert nur den Zahlteil – den Rechnungskopf
 * zeichnen wir selbst mit pdfkit darüber.
 *
 * Nur serverseitig. Die IBAN kommt aus der Umgebung (`ZAHLUNG_IBAN`), der
 * Zahlungsempfänger aus der Config. Bei jedem Fehler wird `null` zurückgegeben
 * – die Bestätigungsmail geht dann ohne Anhang raus, die Zahlungsdetails
 * stehen ohnehin auch als Text im Mailtext.
 */
import { SwissQRBill } from 'swissqrbill/pdf';
import PDFDocument from 'pdfkit';
import { SHOP, VAT_HINWEIS, ZAHLUNG_EMPFAENGER } from '../config';
import { formatPreis } from '../format';

export interface QrRechnungInput {
  orderNumber: string;
  datum: string;
  totalRappen: number;
  subtotalRappen: number;
  versandRappen: number;
  versandLabel: string;
  positionen: { titel: string; qty: number; preisRappen: number }[];
  debtorName: string;
  debtorStrasse: string;
  debtorPlz: string;
  debtorOrt: string;
  debtorLand: string;
  /** Optionale TWINT-Nummer – wird als zusätzliche Zahlart genannt. */
  twintTel?: string;
}

const FARBE_TEXT = '#12281d';
const FARBE_LEISE = '#5a6b62';
const LINKS = 50; // linker Rand
const RECHTS = 545; // rechter Rand (A4-Breite 595 minus 50)

/**
 * Zeichnet den Rechnungskopf in den oberen Seitenteil. Der QR-Zahlteil
 * (unterste ~10.5 cm) wird danach von SwissQRBill dort platziert.
 */
function zeichneRechnung(pdf: PDFKit.PDFDocument, input: QrRechnungInput): void {
  // Absenderzeile (klein, ganz oben)
  pdf
    .font('Helvetica')
    .fontSize(8)
    .fillColor(FARBE_LEISE)
    .text(
      `${SHOP.name} · ${ZAHLUNG_EMPFAENGER.name} · ${ZAHLUNG_EMPFAENGER.strasse} ${ZAHLUNG_EMPFAENGER.hausnummer} · ${ZAHLUNG_EMPFAENGER.plz} ${ZAHLUNG_EMPFAENGER.ort}`,
      LINKS,
      45,
    );

  // Empfängeradresse
  pdf.fontSize(11).fillColor(FARBE_TEXT);
  pdf.text(input.debtorName, LINKS, 95);
  if (input.debtorStrasse) pdf.text(input.debtorStrasse);
  pdf.text(`${input.debtorPlz} ${input.debtorOrt}`);

  // Titel + Meta
  pdf.font('Helvetica-Bold').fontSize(20).fillColor(FARBE_TEXT).text('Rechnung', LINKS, 165);
  pdf.font('Helvetica').fontSize(10).fillColor(FARBE_TEXT);
  pdf.text(`Rechnungs-Nr.  ${input.orderNumber}`, LINKS, 195);
  pdf.text(`Datum  ${input.datum}`);

  // Positionstabelle
  const xMenge = 320;
  const xEinzel = 385;
  const xBetrag = 465;
  const wMenge = 55;
  const wEinzel = 75;
  const wBetrag = 80;
  let y = 235;

  // Kopfzeile
  pdf.font('Helvetica-Bold').fontSize(9).fillColor(FARBE_LEISE);
  pdf.text('Beschreibung', LINKS, y, { width: 260 });
  pdf.text('Menge', xMenge, y, { width: wMenge, align: 'right' });
  pdf.text('Einzelpreis', xEinzel, y, { width: wEinzel, align: 'right' });
  pdf.text('Betrag', xBetrag, y, { width: wBetrag, align: 'right' });
  y += 16;
  pdf.moveTo(LINKS, y).lineTo(RECHTS, y).strokeColor('#DDE3DE').lineWidth(0.75).stroke();
  y += 8;

  // Zeilen
  pdf.font('Helvetica').fontSize(10).fillColor(FARBE_TEXT);
  for (const p of input.positionen) {
    const hoehe = pdf.heightOfString(p.titel, { width: 260 });
    pdf.text(p.titel, LINKS, y, { width: 260 });
    pdf.text(String(p.qty), xMenge, y, { width: wMenge, align: 'right' });
    pdf.text(formatPreis(p.preisRappen), xEinzel, y, { width: wEinzel, align: 'right' });
    pdf.text(formatPreis(p.preisRappen * p.qty), xBetrag, y, { width: wBetrag, align: 'right' });
    y += Math.max(hoehe, 14) + 6;
  }

  // Summen
  pdf.moveTo(LINKS, y).lineTo(RECHTS, y).strokeColor('#DDE3DE').lineWidth(0.75).stroke();
  y += 8;
  const summeZeile = (label: string, betrag: string, fett = false) => {
    pdf
      .font(fett ? 'Helvetica-Bold' : 'Helvetica')
      .fontSize(fett ? 11 : 10)
      .fillColor(FARBE_TEXT);
    pdf.text(label, xEinzel - 90, y, { width: 155, align: 'right' });
    pdf.text(betrag, xBetrag, y, { width: wBetrag, align: 'right' });
    y += fett ? 20 : 16;
  };
  summeZeile('Zwischensumme', formatPreis(input.subtotalRappen));
  summeZeile(`Versand (${input.versandLabel})`, formatPreis(input.versandRappen));
  summeZeile('Total', formatPreis(input.totalRappen), true);

  // Hinweise
  y += 6;
  pdf.font('Helvetica').fontSize(8).fillColor(FARBE_LEISE);
  pdf.text(VAT_HINWEIS, LINKS, y, { width: RECHTS - LINKS });
  const zahlarten = input.twintTel
    ? `Zahlbar mit dem QR-Zahlteil unten, per Banküberweisung oder TWINT an ${input.twintTel}. Verwendungszweck: ${input.orderNumber}.`
    : `Zahlbar mit dem QR-Zahlteil unten oder per Banküberweisung. Verwendungszweck: ${input.orderNumber}.`;
  pdf.text(zahlarten, LINKS, y + 12, { width: RECHTS - LINKS });
}

export async function baueQrRechnungPdf(
  input: QrRechnungInput,
  iban: string,
): Promise<Buffer | null> {
  try {
    const zip = Number(input.debtorPlz);
    const debtor =
      input.debtorName && Number.isInteger(zip) && input.debtorOrt
        ? {
            name: input.debtorName,
            address: input.debtorStrasse,
            zip,
            city: input.debtorOrt,
            country: input.debtorLand === 'LI' ? 'LI' : 'CH',
          }
        : undefined;

    const data = {
      currency: 'CHF' as const,
      amount: input.totalRappen / 100,
      creditor: {
        name: ZAHLUNG_EMPFAENGER.name,
        address: ZAHLUNG_EMPFAENGER.strasse,
        buildingNumber: ZAHLUNG_EMPFAENGER.hausnummer,
        zip: ZAHLUNG_EMPFAENGER.plz,
        city: ZAHLUNG_EMPFAENGER.ort,
        account: iban.replace(/\s/g, ''),
        country: ZAHLUNG_EMPFAENGER.land,
      },
      ...(debtor ? { debtor } : {}),
      message: `Bestellung ${input.orderNumber}`,
    };

    const pdf = new PDFDocument({ size: 'A4' });
    const chunks: Buffer[] = [];
    pdf.on('data', (c: Buffer) => chunks.push(c));
    const fertig = new Promise<Buffer>((resolve, reject) => {
      pdf.on('end', () => resolve(Buffer.concat(chunks)));
      pdf.on('error', reject);
    });

    // Erst der Rechnungskopf oben, dann der genormte QR-Zahlteil unten.
    zeichneRechnung(pdf, input);
    const bill = new SwissQRBill(data);
    bill.attachTo(pdf);
    pdf.end();
    return await fertig;
  } catch (fehler) {
    console.error('[qr-rechnung] Generierung fehlgeschlagen:', fehler);
    return null;
  }
}
