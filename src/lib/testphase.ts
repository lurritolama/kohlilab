// Zentrale Testphase-Liste der Konfiguratoren (Manolo 17.09.2026).
// Ein Konfigurator in der Testphase ist auf der Website als TEST markiert
// («ausprobieren ja, bestellen nein»): KonfigFrame gibt ?test=1 an die App,
// konfig-mobil.js sperrt dort den Warenkorb-Knopf, der Warenkorb zeigt solche
// Positionen als nicht bestellbar, und konfig-checkout.ts lehnt sie ab.
// Freischalten = Eintrag auf false setzen — NUR auf Manolos ausdrückliches OK,
// wenn Drucktests, Preise und Ablauf abgenommen sind.
// Schlüssel = Warenkorb-Typ (kcart `typ`, wie in konfig-checkout.ts).
export const TESTPHASE: Record<string, boolean> = {
  schild: true,          // QR-Schilder
  lochwand: true,        // Lochwand-Planer (Test seit 18.08.2026)
  namensschild: true,    // Tisch-/Tür-Schild, Hausnummer (pausiert bis Drucktest)
  lithophane: true,      // pausiert bis Graukeil-Drucktest
  relief: true,          // Prägung/Farbzonen im Drucktest
  schrank: true,         // Küchenschrank-Einsatz (Passung, Stabilität im Drucktest)
  organizer: false,
  ventilkappe: false,
  tee: false,
};
export const inTestphase = (typ: string): boolean => TESTPHASE[typ] === true;
