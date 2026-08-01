/**
 * Zahlungsabwicklung im Anfrage-Modus (Standard bei TeeLab).
 *
 * Es geht kein Aufruf an einen Zahlungsanbieter: Die Bestellung liegt bereits
 * mit status='pending' in der Datenbank, hier gehen nur die zwei Mails raus –
 * Bestätigung an die Kundschaft (mit QR-Rechnung, falls eine IBAN hinterlegt
 * ist) und Benachrichtigung an den Betrieb.
 */
import { sendeMail } from '../server/mail';
import {
  mailAnfrageKunde,
  mailBenachrichtigungBetreiberin,
  type ZahlungAngaben,
} from '../server/mail-templates';
import { baueQrRechnungPdf } from '../server/qr-rechnung';
import { VERSANDARTEN } from '../config';
import type { CheckoutAuftrag, CheckoutErgebnis, PaymentProvider } from './types';

export class ManualProvider implements PaymentProvider {
  async createCheckout(auftrag: CheckoutAuftrag): Promise<CheckoutErgebnis> {
    const shopEmail = import.meta.env.SHOP_EMAIL;
    const iban = import.meta.env.ZAHLUNG_IBAN?.trim();
    const twintTel = import.meta.env.ZAHLUNG_TWINT_TEL?.trim();
    const b = auftrag.bestellung;

    // Ist eine IBAN hinterlegt, bekommt die Kundschaft Zahlungsangaben +
    // QR-Rechnung. Ohne IBAN bleibt es beim Hinweis, dass wir uns melden.
    const datum = new Date().toLocaleDateString('de-CH', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
    const pdf = iban
      ? await baueQrRechnungPdf(
          {
            orderNumber: b.orderNumber,
            datum,
            totalRappen: b.totalRappen,
            subtotalRappen: b.subtotalRappen,
            versandRappen: b.versandRappen,
            versandLabel: VERSANDARTEN[b.versandart].label,
            positionen: b.positionen,
            debtorName: b.name,
            debtorStrasse: b.strasse,
            debtorPlz: b.plz,
            debtorOrt: b.ort,
            debtorLand: b.land,
            ...(twintTel ? { twintTel } : {}),
          },
          iban,
        )
      : null;

    const zahlung: ZahlungAngaben | undefined = iban
      ? { iban, ...(twintTel ? { twintTel } : {}), mitQrPdf: pdf !== null }
      : undefined;

    const kundenMail = mailAnfrageKunde(b, zahlung);
    if (pdf) {
      kundenMail.anhaenge = [
        { filename: `QR-Rechnung-${b.orderNumber}.pdf`, inhaltBase64: pdf.toString('base64') },
      ];
    }

    // Mailfehler verhindern die Bestellung nicht – sie steht schon in der DB.
    await sendeMail(kundenMail);
    if (shopEmail) {
      await sendeMail(mailBenachrichtigungBetreiberin(b, shopEmail, 'anfrage'));
    } else {
      console.warn('[payments] SHOP_EMAIL nicht gesetzt – keine Betriebs-Benachrichtigung.');
    }

    return { modus: 'manuell' };
  }
}
