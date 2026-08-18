// Prueft, ob der SERVER (dreimf.ts + preis.ts) fuer ein Lochwand-3MF dasselbe
// Gewicht und denselben Preis errechnet wie der Browser (preis.js).
//
// Aufruf: node werkzeug/lochwand-preis-check.mjs [datei.3mf] [gramm-laut-browser] [module]
//   ohne Argumente: Projekt-Daten/kohlilab-skadis/lochwand-test.3mf (alle Faelle des
//   Export-Tests, mehrere Objekte in EINER Datei — genau der Fall, an dem die
//   alte Volumenmessung scheiterte: Dreiecks-Indizes zaehlen je Objekt).
//
// Node >= 22.6 laedt die .ts-Dateien direkt (Type-Stripping).
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import { unzipSync, strFromU8 } from 'fflate';

const datei = process.argv[2] || 'C:/Users/Allgemein/Projekt-Daten/kohlilab-skadis/lochwand-test.3mf';
const browserGramm = process.argv[3] ? Number(process.argv[3]) : null;
const moduleArg = process.argv[4] ? Number(process.argv[4]) : null;

const dreimf = await import(pathToFileURL(path.resolve('src/lib/server/dreimf.ts')).href);
const preis = await import(pathToFileURL(path.resolve('src/lib/preis.ts')).href);
const buf = readFileSync(datei);
const gramm = dreimf.grammAus([buf]);
// Objekte zaehlen (= Module), falls nicht angegeben
const files = unzipSync(new Uint8Array(buf));
const modelKey = Object.keys(files).find((k) => k.endsWith('3dmodel.model'));
const anzahl = moduleArg ?? (strFromU8(files[modelKey]).match(/<object /g) || []).length;
const rappen = preis.lochwandPreisRappen({ gramm, module: anzahl });
console.log(`${path.basename(datei)}: ${anzahl} Objekt(e), Server-Gewicht ${gramm.toFixed(1)} g, Server-Preis CHF ${(rappen / 100).toFixed(2)}`);
if (browserGramm != null) {
  const diff = Math.abs(gramm - browserGramm);
  console.log(`Browser-Gewicht ${browserGramm} g -> Abweichung ${diff.toFixed(2)} g ${diff < 1 ? 'OK' : 'ZU GROSS'}`);
  process.exit(diff < 1 ? 0 : 1);
}
