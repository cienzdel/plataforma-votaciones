import { render } from "preact";
import { useEffect, useState } from "preact/hooks";
import { api, getSession, loadConfig, setSession, type Session } from "./api.ts";
import { getLang, setLang, t, useLang } from "./i18n.ts";
import { Status } from "./ui.tsx";
import { Login } from "./views/Login.tsx";
import { Officials } from "./views/Officials.tsx";
import { Projection } from "./views/Projection.tsx";
import { Voter } from "./views/Voter.tsx";

type Route = "vote" | "officials" | "projection";

function route(): Route {
  const h = location.hash.replace(/^#\/?/, "");
  return h === "officials" || h === "projection" ? h : "vote";
}

function App() {
  useLang();
  const [session, setS] = useState<Session | null>(getSession());
  const [r, setRoute] = useState<Route>(route());
  useEffect(() => {
    const f = () => setRoute(route());
    addEventListener("hashchange", f);
    return () => removeEventListener("hashchange", f);
  }, []);
  useEffect(() => {
    document.title = t("app_title");
  });

  const logout = async () => {
    await api("POST", "/auth/logout").catch(() => null);
    setSession(null);
    setS(null);
  };
  const link = (to: Route, label: string) => (
    <a href={`#/${to}`} aria-current={r === to ? "page" : undefined}>
      {label}
    </a>
  );

  return (
    <>
      <a class="skip" href="#main">
        {t("skip")}
      </a>
      <header>
        <p class="brand">{t("app_title")}</p>
        <nav aria-label={t("app_title")}>
          {session && link("vote", t("nav_vote"))}
          {session?.member.official && link("officials", t("nav_officials"))}
          {session && link("projection", t("nav_projection"))}
        </nav>
        <button type="button" lang={getLang() === "es" ? "en" : "es"} onClick={() => setLang(getLang() === "es" ? "en" : "es")}>
          {t("language")}
        </button>
        {session && (
          <button type="button" onClick={logout}>
            {t("logout")}
          </button>
        )}
      </header>
      <main id="main" tabIndex={-1}>
        {!session ? <Login onLogin={setS} /> : r === "officials" ? <Officials /> : r === "projection" ? <Projection /> : <Voter />}
      </main>
    </>
  );
}

document.documentElement.lang = getLang();
loadConfig().then(
  () => render(<App />, document.getElementById("app")!),
  () => render(<Status kind="error">{t("error_generic")}</Status>, document.getElementById("app")!),
);
