/**
 * Zentrale Shop-Konstanten für KohliLab. Versandkosten, Zahlungsempfänger und
 * Steuerlogik leben ausschliesslich hier – nichts davon in Komponenten
 * duplizieren.
 */

export const SHOP = {
  name: 'KohliLab',
  ort: 'Bühler AR',
  land: 'Schweiz',
  waehrung: 'CHF',
} as const;

/**
 * Kennung dieses Shops in der gemeinsamen (Multi-Shop-)Supabase. Alle
 * serverseitigen Abfragen filtern darauf; Bestellungen werden mit diesem
 * `shop` angelegt (Bestellnummern-Präfix KL). So bleiben munsby, TeeLab und
 * KohliLab in einer DB sauber getrennt und der zentrale Admin kann filtern.
 */
export const SHOP_ID = 'kohlilab';

/**
 * Zahlungsempfänger für die QR-Rechnung (Kontoinhaber). Wie bei TeeLab läuft
 * die Zahlung vorerst über Creative Lab Munsby / Manuel Looser. Sobald
 * KohliLab ein eigenes Konto hat, hier den Empfänger und in Netlify die IBAN
 * wechseln.
 */
export const ZAHLUNG_EMPFAENGER = {
  name: 'Manuel Looser',
  strasse: 'Kohli',
  hausnummer: '16',
  plz: 9055,
  ort: 'Bühler',
  land: 'CH',
} as const;

/** Versandarten. Preise in Rappen, wie überall im Projekt. */
export const VERSANDARTEN = {
  b_post: {
    id: 'b_post',
    label: 'B-Post',
    beschreibung: 'Zustellung in der Regel innert 2–4 Werktagen.',
    kostenRappen: 700,
  },
  a_post: {
    id: 'a_post',
    label: 'A-Post',
    beschreibung: 'Zustellung in der Regel am nächsten Werktag.',
    kostenRappen: 950,
  },
  abholung: {
    id: 'abholung',
    label: `Abholung in ${SHOP.ort}`,
    beschreibung: 'Nach Absprache. Wir melden uns für einen Termin.',
    kostenRappen: 0,
  },
} as const;

export type VersandartId = keyof typeof VERSANDARTEN;
export const VERSANDART_IDS = Object.keys(VERSANDARTEN) as VersandartId[];

/** Versand nur Schweiz und Fürstentum Liechtenstein. */
export const LIEFERLAENDER = ['CH', 'LI'] as const;
export type Lieferland = (typeof LIEFERLAENDER)[number];

/**
 * Mehrwertsteuer. Kleinunternehmen unter CHF 100'000 Umsatz – keine MwSt.
 * geschuldet. Als Variable geführt, damit ein späteres Einschalten nur diese
 * Zahl betrifft.
 */
export const VAT_RATE = 0;
export const VAT_ENABLED = VAT_RATE > 0;
export const VAT_HINWEIS = 'Preise in CHF. Keine MwSt. geschuldet.';
