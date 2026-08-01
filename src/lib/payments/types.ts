/**
 * Das Zahlungs-Interface. Die Checkout-Route kennt ausschliesslich diese
 * Typen – welcher Anbieter dahintersteckt, entscheidet die Factory in
 * index.ts. Ein Anbieterwechsel (später Stripe) ist eine neue Datei, kein
 * Umbau.
 */
import type { MailBestellung } from '../server/mail-templates';

export interface CheckoutAuftrag {
  /** Interne Bestell-ID (uuid). */
  orderId: string;
  bestellung: MailBestellung;
}

export interface CheckoutErgebnis {
  /**
   * 'manuell': Bestellung ist als Anfrage gespeichert, Mails sind raus, die
   *            Kundschaft landet direkt auf der Danke-Seite.
   * 'redirect': Weiterleitung zum Zahlungsanbieter (später Stripe).
   */
  modus: 'manuell' | 'redirect';
  redirectUrl?: string;
}

export interface PaymentProvider {
  createCheckout(auftrag: CheckoutAuftrag): Promise<CheckoutErgebnis>;
}
