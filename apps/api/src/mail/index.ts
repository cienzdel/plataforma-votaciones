/**
 * E-mail transport (ADR-0014): Gmail API with OAuth or generic SMTP, chosen by configuration.
 * Messages never contain voting credentials; login codes are the only secret sent by e-mail.
 */
import MailComposer from "nodemailer/lib/mail-composer/index.js";
import nodemailer from "nodemailer";

export interface Message {
  to: string;
  subject: string;
  text: string;
}

export interface Mailer {
  send(message: Message): Promise<void>;
}

/** Keeps messages in memory. For tests and local development only. */
export class MemoryMailer implements Mailer {
  readonly sent: Message[] = [];
  async send(message: Message): Promise<void> {
    this.sent.push(message);
  }
}

export interface SmtpConfig {
  host: string;
  port: number;
  user: string;
  password: string;
  from: string;
}

export function smtpMailer(c: SmtpConfig): Mailer {
  const transport = nodemailer.createTransport({ host: c.host, port: c.port, secure: c.port === 465, auth: { user: c.user, pass: c.password } });
  return {
    async send(m) {
      await transport.sendMail({ from: c.from, ...m });
    },
  };
}

export interface GmailConfig {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
  from: string;
}

/** Gmail API with an OAuth refresh token of the body's account (`gmail.send` scope). */
export function gmailMailer(c: GmailConfig, fetchFn: typeof fetch = fetch): Mailer {
  let token: { value: string; expiresAt: number } | null = null;

  async function accessToken(): Promise<string> {
    if (token !== null && token.expiresAt > Date.now() + 60_000) return token.value;
    const res = await fetchFn("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: c.clientId,
        client_secret: c.clientSecret,
        refresh_token: c.refreshToken,
        grant_type: "refresh_token",
      }),
    });
    if (!res.ok) throw new Error("gmail token request failed: " + res.status);
    const body = (await res.json()) as { access_token: string; expires_in: number };
    token = { value: body.access_token, expiresAt: Date.now() + body.expires_in * 1000 };
    return token.value;
  }

  return {
    async send(m) {
      const raw = await new MailComposer({ from: c.from, ...m }).compile().build();
      const res = await fetchFn("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
        method: "POST",
        headers: { authorization: "Bearer " + (await accessToken()), "content-type": "application/json" },
        body: JSON.stringify({ raw: raw.toString("base64url") }),
      });
      if (!res.ok) throw new Error("gmail send failed: " + res.status);
    },
  };
}
