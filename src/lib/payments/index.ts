/**
 * Wählt den Zahlungsanbieter. TeeLab startet im Anfrage-Modus (Manual): die
 * Bestellung landet als Anfrage in der DB, die Zahlung wird per QR-Rechnung /
 * TWINT abgewickelt. Stripe kann später als eigener Provider ergänzt werden
 * (analog munsby: Umschalten per Umgebungsvariable, keine Umbauten hier).
 */
import { ManualProvider } from './manual';
import type { PaymentProvider } from './types';

export type { CheckoutAuftrag, CheckoutErgebnis, PaymentProvider } from './types';

export function getPaymentProvider(): PaymentProvider {
  return new ManualProvider();
}
