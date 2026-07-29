// Sujet-Katalog. Quelle ist sujets.json — die Mikrofabrik (fabrik.py push)
// schreibt dort neue Sujets nach der menschlichen Freigabe hinein.
// Später wandert das in die gemeinsame Supabase (shop='kohlilab').
import sujetsJson from './sujets.json';

export const sujets = sujetsJson;

export function preisFormat(rappen) {
  return `CHF ${(rappen / 100).toFixed(2).replace(/\.00$/, '.—')}`;
}
