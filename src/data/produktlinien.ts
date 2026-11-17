// Alle Produktlinien von KohliLab, nach Bereich (Manolo 14.11.2026: zwei Bereiche, «3D-Druck» mit allen bisherigen
// Linien und neu «Smart Home»). Neue Linien NUR hier eintragen: die Produktübersicht auf der Startseite
// (ProduktLinien.astro) und die Bereichsseite /smart-home lesen beide aus dieser Liste.
//
// Das Titelbild steht bei der Linie selbst statt in einer Bedingungskette in der Darstellung: die war schon vierfach
// verschachtelt und musste bei jedem neuen Bild aufgebohrt werden.
// status 'test' kommt aus der zentralen Testphase-Liste (src/lib/testphase.ts); 'bald' = angekündigt, noch nicht im Verkauf.
import { inTestphase } from '../lib/testphase';

export type Bereich = '3d-druck' | 'smart-home';

export interface Linie {
  slug: string;
  name: string;
  bereich: Bereich;
  status: 'live' | 'test' | 'bald';
  beschreibung: string;
  href: string | null;
  bild: string | null;
  alt: string;
  breite: number;
  hoehe: number;
  /** Stichworte für die Bereichsseite (nur Smart Home) */
  merkmale?: string[];
  /** anderes Bild für die Bereichsseite (dort steht das Titelbild schon oben) */
  bildBereich?: { src: string; breite: number; hoehe: number };
}

export const BEREICHE: Record<Bereich, { name: string; zeile: string; anker: string }> = {
  '3d-druck': { name: '3D-Druck', zeile: 'Konfiguratoren, Mikrofabrik und Einzelstücke', anker: 'produkte-3d-druck' },
  'smart-home': { name: 'Smart Home', zeile: 'Geräte fürs Zuhause, lokal und ohne Cloud', anker: 'produkte-smart-home' },
};

export const linien: Linie[] = [
  {
    slug: 'qr-schilder',
    name: 'QR-Schilder',
    bereich: '3d-druck',
    status: inTestphase('schild') ? 'test' : 'live',
    beschreibung:
      'Dein QR-Schild im Konfigurator: Form, Farben, WLAN/URL/vCard, Text und Logo — mehrfarbig 3D-gedruckt.',
    href: '/qr-schilder',
    bild: '/bilder/qr-schilder-titel.jpg',
    alt: 'Neun frisch gedruckte QR-Marker auf dem Druckbett',
    breite: 576, hoehe: 360,
  },
  {
    slug: 'organizer',
    name: 'Schubladen-Organizer',
    bereich: '3d-druck',
    status: 'live',   // Manolo 19.08.2026: gleiches LIVE-Kennzeichen wie die anderen fertigen Linien
    beschreibung:
      'Dein Schubladeneinsatz nach Mass: Innenmass eingeben, Fächer frei einteilen — für Besteck, Büro, Werkzeug und mehr.',
    href: '/organizer',
    bild: '/bilder/organizer-titel.jpg',
    alt: 'Gedruckter Schubladen-Organizer mit Trennwänden auf dem Druckbett',
    breite: 930, hoehe: 581,
  },
  {
    slug: 'kuechenschrank',
    name: 'Küchenschrank-Einsatz',
    bereich: '3d-druck',
    status: inTestphase('schrank') ? 'test' : 'live',    // Testphase (14.09.2026): Drucktest der Schwalbenschwanz-Passung offen
    beschreibung:
      'Gitter für den Schrank-Korpus nach Mass: Trennwände längs und quer, die mit Schwalbenschwänzen ineinandergreifen — frei hineinstellen, jederzeit umsetzen, Bodenplatte optional.',
    href: '/kuechenschrank',
    // Titelbild folgt (Render aus dem Konfigurator, spaeter Foto von Manolo)
    bild: null,
    alt: 'Küchenschrank-Einsatz-Konfigurator',
    breite: 1200, hoehe: 750,
  },
  {
    slug: 'ventilkappen',
    name: 'Ventilkappen',
    bereich: '3d-druck',
    status: 'live',
    beschreibung:
      'Kleine Skulpturen mit Ventilgewinde aus der KI-Mikrofabrik — Schrader oder Presta, neue Sujets laufend, jedes von Hand freigegeben.',
    href: '/ventilkappen',
    bild: '/bilder/ventilkappen-titel.jpg',
    alt: 'Vier frisch gedruckte Glace-Ventilkappen auf dem Druckbett',
    breite: 820, hoehe: 512,
  },
  {
    slug: 'golf-tees',
    name: 'Golf-Tees',
    bereich: '3d-druck',
    status: 'live',
    beschreibung:
      'Dein Golf-Tee nach Mass: Länge, Kopfform, Schaft und Farben im Konfigurator einstellen — 3D-gedruckt, zweiteilig gesteckt, ab 10 Stück.',
    href: '/golf-tees',
    // Render aus dem Konfigurator; Foto folgt (Manolo)
    bild: '/bilder/golf-tees-titel.jpg',
    alt: 'Gerenderte Golf-Tees in mehreren Farben mit Cup- und Augen-Kopf',
    breite: 1200, hoehe: 750,
  },
  {
    slug: 'lochwand',
    name: 'Lochwand-Planer',
    bereich: '3d-druck',
    status: inTestphase('lochwand') ? 'test' : 'live',    // Testphase (Manolo 18.08.2026): Drucke und Bestellablauf noch in Abnahme
    beschreibung:
      'Module für IKEA Skådis: Wannen, Halter, Haken und Klemmen frei auf der Platte platzieren, beschriften, als Set bestellen.',
    href: '/lochwand',
    // Render aus dem Planer selbst (Etappe 3) — endgültige Fotos folgen (Manolo).
    bild: '/bilder/lochwand-titel.jpg',
    alt: 'Gerenderte Skådis-Lochwand mit Wannen, Haltern, Haken und Klemmen in Orange, Schwarz und Grau',
    breite: 1200, hoehe: 750,
  },
  {
    slug: 'relief',
    name: 'Relief — dein Stück Schweiz',
    bereich: '3d-druck',
    status: inTestphase('relief') ? 'test' : 'live',    // Testphase (07.09.2026): Drucktests der Farbzonen und der Praegung offen
    beschreibung:
      'Dein Dorf, dein Haus oder deine Tour als Relief: Ausschnitt auf der Karte wählen, Seen, Wald, Fels und Schnee in Farbe, optional die GPX-Route — aus den swisstopo-Höhendaten.',
    href: '/relief',
    // Titelbild folgt (Render aus dem Konfigurator, spaeter Foto von Manolo)
    bild: null,
    alt: 'Relief-Konfigurator',
    breite: 1200, hoehe: 750,
  },
  {
    slug: 'spezialanfertigung',
    name: 'Spezialanfertigung',
    bereich: '3d-druck',
    status: 'live',
    beschreibung:
      'Ersatzteil, Halterung, Einzelstück oder dein fertiges 3D-Modell: Anfrage schicken, wir prüfen kostenlos die Machbarkeit.',
    href: '/spezialanfertigung',
    // Querformat-Zuschnitt desselben Fotos: die Karten sind 16:10, das
    // Hochformat der Unterseite haette hier nur einen schmalen Streifen
    // gefuellt. Die Teile liegen im Bild waagrecht, der Zuschnitt kostet
    // also nichts (Manolo 14.08.2026).
    bild: '/bilder/spezial-titel-quer.webp',
    alt: 'Gedruckte Schutzhalterungen mit Klemmringen, frisch vom Druckbett',
    breite: 1400, hoehe: 875,
  },
  // ---------------------------------------------------------------- Smart Home
  {
    slug: 'zaehlerleser',
    name: 'Zählerleser E450',
    bereich: 'smart-home',
    status: 'bald',   // Produktseite unter Smart Home, noch nicht im Verkauf (Manolo 13./17.11.2026)
    beschreibung:
      'Hält mit einem Magneten am Smart Meter E450, liest ihn lokal aus und schickt die Werte per WLAN an Home Assistant, MQTT oder Prometheus. Das Gehäuse — Eule, Spinne oder Astronaut — kommt aus dem eigenen Drucklabor.',
    href: '/smart-home/zaehlerleser',
    bild: '/zaehlerleser-medien/bild_trio.webp',
    alt: 'Drei Zählerleser als Eule, Spinne und Astronaut auf Stromzählern',
    breite: 1600, hoehe: 900,
    bildBereich: { src: '/zaehlerleser-medien/hero_poster.webp', breite: 1600, hoehe: 900 },
    merkmale: ['Landis+Gyr E450', 'RJ12-Schnittstelle', 'WLAN', 'Home Assistant', 'MQTT', 'JSON', 'Prometheus'],
  },
];

export const linienIn = (b: Bereich): Linie[] => linien.filter((l) => l.bereich === b);
