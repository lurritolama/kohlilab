/**
 * Mailversand über Resend – über die schlichte HTTP-API statt eines SDK.
 *
 * Nur serverseitig. Fehler beim Versand werfen NICHT nach oben: Eine
 * Bestellung, die in der Datenbank steht, ist eine Bestellung – auch wenn die
 * Bestätigungsmail gerade nicht rausging. Der Fehler wird geloggt, die
 * Bestellung ist im zentralen Admin sichtbar.
 */

export interface MailAnhang {
  filename: string;
  /** Dateiinhalt als Base64. */
  inhaltBase64: string;
}

export interface MailInhalt {
  an: string;
  betreff: string;
  html: string;
  text: string;
  antwortAn?: string;
  anhaenge?: MailAnhang[];
}

export async function sendeMail(mail: MailInhalt): Promise<boolean> {
  const apiKey = import.meta.env.RESEND_API_KEY;
  const absender = import.meta.env.MAIL_FROM;
  const shopEmail = import.meta.env.SHOP_EMAIL;

  if (!apiKey || !absender) {
    console.warn(
      `[mail] RESEND_API_KEY/MAIL_FROM nicht gesetzt – Mail an ${mail.an} („${mail.betreff}") nicht verschickt.`,
    );
    return false;
  }

  // Antworten an die echte Betreiber-Adresse leiten, wenn kein anderer
  // Empfänger gesetzt ist (der Absender ist eine reine Versandadresse).
  const antwortAn = mail.antwortAn ?? shopEmail;

  try {
    const antwort = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: `KohliLab <${absender}>`,
        to: [mail.an],
        subject: mail.betreff,
        html: mail.html,
        text: mail.text,
        ...(antwortAn ? { reply_to: antwortAn } : {}),
        ...(mail.anhaenge?.length
          ? {
              attachments: mail.anhaenge.map((a) => ({
                filename: a.filename,
                content: a.inhaltBase64,
              })),
            }
          : {}),
      }),
    });

    if (!antwort.ok) {
      const fehler = await antwort.text();
      console.error(`[mail] Resend antwortete ${antwort.status}: ${fehler}`);
      return false;
    }
    return true;
  } catch (fehler) {
    console.error('[mail] Versand fehlgeschlagen:', fehler);
    return false;
  }
}
