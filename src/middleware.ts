/**
 * Sicherheits-Header für alle on-demand gerenderten Antworten.
 *
 * Bis zum 11.08.2026 lieferte kohlilab.ch ausser HSTS gar nichts aus, während
 * munsby.ch längst eine vollständige Härtung hatte — die war beim Aufsetzen
 * dieses Shops schlicht nie mitgenommen worden.
 *
 * Zwei Stellen, weil zwei Auslieferungswege: Die [[headers]] in netlify.toml
 * greifen für die statisch vorgerenderten Seiten und alles unter public/
 * (also auch die Konfiguratoren). Seiten aus der SSR-Function — /ventilkappen
 * und die API — kämen darüber NICHT abgedeckt raus. Darum setzt diese
 * Middleware dieselben Header nochmals auf Applikationsebene. Beides doppelt
 * gesetzt schadet nicht, eines davon fehlend schon. Werte bitte in beiden
 * Dateien gleich halten.
 */
import { defineMiddleware } from 'astro:middleware';

// script-src erlaubt 'unsafe-inline' — bewusst, nicht aus Bequemlichkeit:
// die beiden Konfiguratoren sind absichtlich autarke Ein-Datei-Anwendungen
// (public/*-app/index.html) mit tausenden Zeilen Inline-Skript, und Layout und
// KonfigFrame nutzen kleine is:inline-Blöcke. Der Angriffsweg, der hier real
// war, wird trotzdem geschlossen: fremde Skript-HERKÜNFTE sind gesperrt, es
// lädt nichts mehr von unpkg oder sonstwo. Werden die Konfiguratoren eines
// Tages in echte Module zerlegt, kann 'unsafe-inline' ersatzlos weg.
//
// frame-ancestors 'self' statt 'none': der Shop rahmt seine EIGENEN
// Konfiguratoren ein (KonfigFrame.astro). 'none' würde /organizer und
// /qr-schilder weiss lassen.
const CSP = [
  "default-src 'self'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'self'",
  "frame-src 'self'",
  "object-src 'none'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "font-src 'self'",
  // Sujet-Bilder liegen im öffentlichen Supabase-Bucket; blob:/data: brauchen
  // die Konfiguratoren für Vorschau und Dateiausgabe.
  "img-src 'self' data: blob: https://*.supabase.co",
  "connect-src 'self'",
  'upgrade-insecure-requests',
].join('; ');

export const onRequest = defineMiddleware(async (_context, next) => {
  const antwort = await next();
  const h = antwort.headers;

  h.set('Content-Security-Policy', CSP);
  h.set('Strict-Transport-Security', 'max-age=63072000; includeSubDomains; preload');
  h.set('X-Frame-Options', 'SAMEORIGIN');
  h.set('X-Content-Type-Options', 'nosniff');
  h.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  // web-share NICHT sperren: der Konfigurator teilt am Handy den
  // Konfigurations-Link über die System-Teilen-Funktion.
  h.set('Permissions-Policy', 'geolocation=(), microphone=(), camera=(), payment=(), interest-cohort=()');
  h.set('Cross-Origin-Opener-Policy', 'same-origin');

  return antwort;
});
