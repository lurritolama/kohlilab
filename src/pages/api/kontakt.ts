// Kontaktformular (UX-Durchgang 31.08.2026, Punkt 9): die Kontaktseite hatte
// nur eine Mailadresse — wer am Handy ohne eingerichtetes Mailprogramm
// unterwegs ist, kam nicht durch. Die Nachricht geht per Resend an die
// Betreiber-Adresse (SHOP_EMAIL), Antworten laufen direkt an die Absenderin.
//
// Schutz ohne Drittdienst: Honigtopf-Feld (Bots fuellen es), Laengenlimits,
// und je Adresse hoechstens 5 Nachrichten pro Stunde (im Speicher der
// Function — reicht gegen Schleifen, nicht gegen einen Angriff; dafuer gaebe
// es Netlify-Rate-Limits).
export const prerender = false;

import type { APIRoute } from 'astro';
import { sendeMail } from '../../lib/server/mail';

const MAX = { name: 80, email: 120, telefon: 40, nachricht: 3000 };
const zaehler = new Map<string, number[]>();
function zuViele(schluessel: string): boolean {
  const jetzt = Date.now();
  const liste = (zaehler.get(schluessel) ?? []).filter((t) => jetzt - t < 3600_000);
  liste.push(jetzt);
  zaehler.set(schluessel, liste);
  return liste.length > 5;
}
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string);
const antwort = (status: number, body: Record<string, unknown>) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json; charset=utf-8' } });

export const POST: APIRoute = async ({ request, clientAddress }) => {
  let d: Record<string, unknown>;
  try { d = await request.json(); } catch { return antwort(400, { fehler: 'Ungültige Anfrage.' }); }
  const feld = (k: keyof typeof MAX) => String(d[k] ?? '').trim().slice(0, MAX[k]);
  const name = feld('name'), email = feld('email'), telefon = feld('telefon'), nachricht = feld('nachricht');
  if (String(d.firma ?? '').trim()) return antwort(200, { ok: true });          // Honigtopf: still schlucken
  if (name.length < 2) return antwort(400, { fehler: 'Bitte deinen Namen angeben.' });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return antwort(400, { fehler: 'Bitte eine gültige E-Mail-Adresse angeben.' });
  if (nachricht.length < 10) return antwort(400, { fehler: 'Bitte eine Nachricht schreiben (mindestens 10 Zeichen).' });
  if (zuViele(email.toLowerCase()) || zuViele('ip:' + (clientAddress ?? '?'))) return antwort(429, { fehler: 'Zu viele Nachrichten in kurzer Zeit — bitte später nochmals versuchen.' });

  const env: Record<string, string | undefined> = { ...(import.meta.env as any), ...(typeof process !== 'undefined' ? process.env : {}) };
  const an = env.SHOP_EMAIL;
  if (!an) return antwort(503, { fehler: 'Kontaktformular ist gerade nicht erreichbar — bitte per E-Mail schreiben.' });

  const text = `Kontaktanfrage über kohlilab.ch\n\nName: ${name}\nE-Mail: ${email}\nTelefon: ${telefon || '–'}\n\n${nachricht}\n`;
  const html = `<p><b>Kontaktanfrage über kohlilab.ch</b></p>
<p>Name: ${esc(name)}<br>E-Mail: <a href="mailto:${esc(email)}">${esc(email)}</a><br>Telefon: ${esc(telefon || '–')}</p>
<p style="white-space:pre-wrap">${esc(nachricht)}</p>`;
  const ok = await sendeMail({ an, betreff: `Kontakt: ${name}`, text, html, antwortAn: email });
  if (!ok) return antwort(503, { fehler: 'Senden hat nicht geklappt — bitte per E-Mail schreiben.' });
  return antwort(200, { ok: true });
};
