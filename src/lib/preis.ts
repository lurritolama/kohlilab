/**
 * Preiswahrheit für die KohliLab-Konfiguratoren (Rappen). Spiegelt exakt die
 * Formeln in den Konfigurator-Apps (public/*-app), wird aber SERVERSEITIG mit
 * dem aus dem 3MF gemessenen Gewicht gerechnet -> fälschungssicher.
 *
 * Manolos Sätze: Filament 30.–/kg (= 3 Rp/g), Maschine 0.50/h.
 */
const FILAMENT_RP_G = 3;        // 30 CHF/kg
const MASCHINE_RP_H = 50;       // 0.50 CHF/h

/** Organizer: eine individuelle Wanne, Menge immer 1. */
export function organizerPreisRappen(o: { gramm: number; module: number; hatText: boolean }): number {
  const material = o.gramm * FILAMENT_RP_G;
  const maschine = (o.gramm / 25) * MASCHINE_RP_H;              // ~25 g/h
  const roh = 900 + material + maschine + Math.max(0, o.module - 1) * 500 + (o.hatText ? 300 : 0);
  return Math.max(1500, Math.ceil(roh / 50) * 50);             // min 15.–, Rundung 0.50
}

/** Schild-Rohpreis PRO STÜCK (ohne Grundpreis, ohne Staffel). */
export function schildStueckRohRappen(s: { gramm: number; zusatzFarben: number }): number {
  return s.gramm * FILAMENT_RP_G + (s.gramm / 15) * MASCHINE_RP_H + s.zusatzFarben * 200;
}

/** Schild-Gesamtpreis inkl. Grundpreis, Mengenstaffel und Stück-Minimum. */
export function schildGesamtRappen(s: { gramm: number; zusatzFarben: number; menge: number }): number {
  const n = Math.max(1, Math.round(s.menge));
  const stueckRoh = schildStueckRohRappen(s);
  const rab = n >= 10 ? 0.75 : n >= 5 ? 0.85 : 1;
  const erst = stueckRoh * rab;
  const weitere = Math.max(600, stueckRoh * rab);              // jedes weitere Schild min. 6.–
  const roh = 900 + erst + (n - 1) * weitere;
  return Math.max(1200, Math.ceil(roh / 50) * 50);            // min 12.–, Rundung 0.50
}
