/** Small shared pieces: polling, status messages, results. */
import type { ComponentChildren } from "preact";
import { useEffect, useRef, useState } from "preact/hooks";
import { ApiError } from "./api.ts";
import { t, type Key } from "./i18n.ts";
import type { VotingView } from "./voting.ts";

/** Runs `load` now and every `ms` milliseconds while the component is shown. */
export function usePoll<T>(load: () => Promise<T>, ms: number, deps: unknown[] = []): { data: T | null; error: string | null; reload: () => void } {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const loadRef = useRef(load);
  loadRef.current = load;
  useEffect(() => {
    let alive = true;
    const run = () =>
      loadRef.current().then(
        (d) => alive && (setData(d), setError(null)),
        (e: Error) => alive && setError(e instanceof ApiError ? e.code : "network"),
      );
    run();
    const id = setInterval(run, ms);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [tick, ...deps]);
  return { data, error, reload: () => setTick((x) => x + 1) };
}

/** A message read out by screen readers when it appears. */
export function Status({ kind = "info", children }: { kind?: "info" | "error" | "ok"; children: ComponentChildren }) {
  return (
    <p class={`status status-${kind}`} role={kind === "error" ? "alert" : "status"}>
      {children}
    </p>
  );
}

export function errorText(code: string): string {
  return code === "network" ? t("error_generic") : `${t("error_generic")} (${code})`;
}

/** Runs an async action, with a busy flag and an error message. */
export function useAction(): { busy: boolean; error: string | null; message: string | null; run: (f: () => Promise<string | void>) => Promise<void> } {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  return {
    busy,
    error,
    message,
    run: async (f) => {
      setBusy(true);
      setError(null);
      setMessage(null);
      try {
        const m = await f();
        if (typeof m === "string") setMessage(m);
      } catch (e) {
        setError(e instanceof ApiError ? e.code : "network");
      } finally {
        setBusy(false);
      }
    },
  };
}

export function statusLabel(s: VotingView["status"]): string {
  return t(`status_${s}` as Key);
}

/** Groups a fingerprint in blocks of four so that it can be read aloud and compared. */
export function Fingerprint({ value }: { value: string }) {
  return (
    <p class="fingerprint">
      {t("fingerprint")}: <code>{value.slice(0, 32).match(/.{4}/g)!.join(" ")}</code>
    </p>
  );
}

export function Result({ v }: { v: VotingView }) {
  const r = v.board?.result as Record<string, unknown> | null | undefined;
  if (!r) return null;
  const name = (id: unknown) => v.candidates?.candidates.find((c) => c.id === id)?.name ?? String(id);
  const names = (ids: unknown) => ((ids as string[] | undefined) ?? []).map(name).join(", ");
  const outcome = String(r.outcome);
  let headline: string;
  if (v.method === "yes_no") headline = t(outcome === "approved" ? "outcome_approved" : "outcome_rejected");
  else if (outcome === "elected") headline = t("outcome_elected", { name: name(r.elected) });
  else if (outcome === "vacant") headline = t("outcome_vacant");
  else headline = t(`outcome_${outcome}` as Key, { names: names(outcome === "runoff" || outcome === "qualified" ? r.qualified : r.tied) });

  const rows: [string, number][] =
    v.method === "yes_no"
      ? (["for", "against", "blank", "abstain"] as const).map((x) => [t(`v_${x}`), r[x] as number])
      : Object.entries(r.tallies as Record<string, number>).map(([id, n]) => [id === "blank" ? t("v_blank") : id === "against_all" ? t("v_against_all") : name(id), n]);
  return (
    <section class="result" aria-label={t("result")}>
      <p class="headline">{headline}</p>
      <table>
        <tbody>
          {rows.map(([label, n]) => (
            <tr key={label}>
              <th scope="row">{label}</th>
              <td>{n}</td>
            </tr>
          ))}
          <tr>
            <th scope="row">{t("cast_count")}</th>
            <td>{r.cast as number}</td>
          </tr>
        </tbody>
      </table>
    </section>
  );
}
