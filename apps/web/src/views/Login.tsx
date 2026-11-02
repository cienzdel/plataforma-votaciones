import { useState } from "preact/hooks";
import { api, setSession, type Session } from "../api.ts";
import { t } from "../i18n.ts";
import { Status, useAction } from "../ui.tsx";

export function Login({ onLogin }: { onLogin: (s: Session) => void }) {
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [sent, setSent] = useState(false);
  // The id the API gives this browser with the code: a mailed code only works together with it.
  const [requestId, setRequestId] = useState<string | undefined>(undefined);
  const [assisted, setAssisted] = useState(false);
  const a = useAction();

  const request = (e: Event) => {
    e.preventDefault();
    void a.run(async () => {
      const res = await api<{ request: string }>("POST", "/auth/code", { email });
      setRequestId(res.request);
      setAssisted(false);
      setSent(true);
    });
  };
  const enter = (e: Event) => {
    e.preventDefault();
    void a.run(async () => {
      const s = await api<Session>("POST", "/auth/session", assisted ? { email, code } : { email, code, request: requestId });
      setSession(s);
      onLogin(s);
    });
  };

  return (
    <section>
      <h1>{t("login_title")}</h1>
      <form onSubmit={request}>
        <label for="email">{t("login_email")}</label>
        <input id="email" type="email" autocomplete="email" required value={email} onInput={(e) => setEmail(e.currentTarget.value)} />
        <button type="submit" disabled={a.busy}>
          {t("login_send")}
        </button>
      </form>
      {sent && !assisted && <Status kind="ok">{t("login_sent")}</Status>}
      {!sent && !assisted && (
        <button type="button" onClick={() => setAssisted(true)}>
          {t("login_have_assisted")}
        </button>
      )}
      {(sent || assisted) && (
        <form onSubmit={enter}>
          <label for="code">{assisted ? t("login_assisted_code") : t("login_code")}</label>
          <input
            id="code"
            inputMode="numeric"
            autocomplete="one-time-code"
            pattern={assisted ? "[0-9 ]{12,15}" : "[0-9]{8}"}
            required
            value={code}
            onInput={(e) => setCode(e.currentTarget.value)}
          />
          <button type="submit" disabled={a.busy}>
            {t("login_enter")}
          </button>
        </form>
      )}
      {a.error && <Status kind="error">{a.error === "too_many_requests" ? t("login_wait") : a.error === "invalid_code" ? t("login_bad_code") : t("error_generic")}</Status>}
    </section>
  );
}
