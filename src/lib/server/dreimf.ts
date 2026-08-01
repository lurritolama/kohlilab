/**
 * Serverseitige 3MF-Analyse für die fälschungssichere Preisberechnung.
 * Ein 3MF ist ein ZIP mit 3D/3dmodel.model (XML). Wir entpacken, summieren
 * das Dreiecks-Volumen (signiertes Tetraeder-Volumen) und zählen Farben.
 */
import { unzipSync, strFromU8 } from 'fflate';

const DICHTE = 1.24; // g/cm³ (PLA)

function modelXml(buf: Buffer): string {
  const files = unzipSync(new Uint8Array(buf));
  const key = Object.keys(files).find((k) => k.toLowerCase().endsWith('3dmodel.model'));
  if (!key) throw new Error('kein 3D-Modell im 3MF');
  return strFromU8(files[key]);
}

/** Volumen eines 3MF in mm³ (Betrag der Summe signierter Tetraeder). */
export function volumenMm3(buf: Buffer): number {
  const xml = modelXml(buf);
  const verts: [number, number, number][] = [];
  const vre = /<vertex\s+x="([-\d.eE]+)"\s+y="([-\d.eE]+)"\s+z="([-\d.eE]+)"/g;
  let m: RegExpExecArray | null;
  while ((m = vre.exec(xml))) verts.push([parseFloat(m[1]), parseFloat(m[2]), parseFloat(m[3])]);
  const tre = /<triangle\s+v1="(\d+)"\s+v2="(\d+)"\s+v3="(\d+)"/g;
  let vol = 0;
  while ((m = tre.exec(xml))) {
    const a = verts[+m[1]], b = verts[+m[2]], c = verts[+m[3]];
    if (!a || !b || !c) continue;
    vol += (a[0] * (b[1] * c[2] - b[2] * c[1]) + a[1] * (b[2] * c[0] - b[0] * c[2]) + a[2] * (b[0] * c[1] - b[1] * c[0])) / 6;
  }
  return Math.abs(vol);
}

/** Gewicht in Gramm über eine oder mehrere Druckdateien. */
export function grammAus(bufs: Buffer[]): number {
  const mm3 = bufs.reduce((s, b) => s + volumenMm3(b), 0);
  return (mm3 / 1000) * DICHTE; // mm³ -> cm³ -> g
}

/** Anzahl verschiedener Farben im 3MF (m:color-Einträge). */
export function farbAnzahl(buf: Buffer): number {
  const xml = modelXml(buf);
  const set = new Set<string>();
  const cre = /<m:color\s+color="([^"]+)"/g;
  let m: RegExpExecArray | null;
  while ((m = cre.exec(xml))) set.add(m[1].slice(0, 7).toUpperCase());
  return Math.max(1, set.size);
}
