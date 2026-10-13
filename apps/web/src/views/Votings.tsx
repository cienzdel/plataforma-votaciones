/** Officials: votings of every method and mode, draws, the election assistant, assents and minutes. */
import { useState } from "preact/hooks";
import { api, cfg, getSession } from "../api.ts";
import { t, type Key } from "../i18n.ts";
import { loadSeed, newSeed, seedFile } from "../seeds.ts";
import { errorText, Fingerprint, Outcome, Result, Status, statusLabel, useAction, usePoll } from "../ui.tsx";
import type { VotingView } from "../voting.ts";
import type { AssentView } from "./Voter.tsx";
import type { PanelProps } from "./Officials.tsx";

const lines = (s: string) => s.split("\n").map((x) => x.trim()).filter(Boolean);
const ids = (prefix: string, n: number) => Array.from({ length: n }, (_, i) => `${prefix}${i + 1}`);

/** Builds method parameters, candidates and posts from the form (spec/methods.md). */
function buildParams(f: Record<string, string>) {
  const names = lines(f.candidates ?? "");
  if (f.method === "yes_no") return { params: { base: f.base, rule: f.rule === "two_thirds" ? [2, 3] : f.rule } };
  if (f.method === "single_winner") {
    const c = ids("c", names.length);
    return { params: { candidates: c, stage: "first", attempt: 0, repetitions: 1, against_all_blocks: false, subject: "person" }, candidates: names.map((n, i) => ({ id: c[i], name: n })) };
  }
  if (f.method === "limited_vote") {
    const c = ids("c", names.length);
    return { params: { candidates: c, seats: Number(f.seats), minimum: Number(f.minimum) }, candidates: names.map((n, i) => ({ id: c[i], name: n })) };
  }
  const posts = lines(f.posts ?? "");
  const postIds = ids("v", posts.length);
  const byName = new Map(posts.map((p, i) => [p.toLowerCase(), postIds[i]!]));
  const rows = names.map((row) => row.split("|").map((x) => x.trim()));
  const c = ids("c", rows.length);
  return {
    params: { posts: postIds, candidates: rows.map(([, prefs = ""], i) => ({ id: c[i], preferences: prefs.split(">").map((p) => byName.get(p.trim().toLowerCase()) ?? "?") })) },
    candidates: rows.map(([n], i) => ({ id: c[i], name: n })),
    posts: posts.map((p, i) => ({ id: postIds[i], name: p })),
  };
}

export function VotingPanel({ meeting, votings, reload }: PanelProps) {
  const a = useAction();
  const [form, setForm] = useState<Record<string, string>>({ title: "", mode: "secret", method: "yes_no", rule: "simple", base: "cast", timing: "live", closes_at: "", filter: "", min: "", candidates: "", posts: "", seats: "2", minimum: "0" });
  const [created, setCreated] = useState<{ commitment: string; seed: string } | null>(null);
  if (!meeting || meeting.status !== "open") return <Status>{t("no_meeting")}</Status>;
  const field = (k: string) => ({ value: form[k], onInput: (e: Event) => setForm({ ...form, [k]: (e.currentTarget as HTMLInputElement).value }) });
  const needsDraw = form.method === "posts" || form.method === "limited_vote";
  const liveOnly = form.method === "single_winner" || form.mode === "manual" || form.mode === "paper";

  const create = (e: Event) => {
    e.preventDefault();
    void a.run(async () => {
      const seed = needsDraw ? newSeed() : null;
      const timing = liveOnly ? "live" : form.timing;
      await api("POST", "/votings", {
        meeting_id: meeting.id,
        title: form.title,
        method: form.method,
        mode: form.mode,
        ...buildParams(form),
        timing,
        closes_at: timing === "final_link" ? new Date(form.closes_at!).toISOString().replace(/\.\d{3}Z$/, "Z") : undefined,
        electorate_filter: form.filter || null,
        min_attendance: form.min === "half" ? [1, 2] : form.min === "third" ? [1, 3] : null,
        draw_commitment: seed?.commitment,
      });
      setCreated(seed);
      reload();
      return t("done");
    });
  };

  return (
    <section aria-labelledby="h-votings">
      <h2 id="h-votings">{t("tab_votings")}</h2>
      {[...votings].reverse().map((v) => (
        <VotingAdmin key={v.id} v={v} reload={reload} />
      ))}
      <form onSubmit={create} class="card">
        <h3>{t("create")}</h3>
        <label for="v-title">{t("voting_title")}</label>
        <input id="v-title" required {...field("title")} />
        <label for="v-mode">{t("mode")}</label>
        <select id="v-mode" {...field("mode")}>
          {(["secret", "roll_call", "manual", "paper"] as const).map((m) => (
            <option key={m} value={m}>
              {t(`mode_${m}`)}
            </option>
          ))}
        </select>
        <label for="v-method">{t("method")}</label>
        <select id="v-method" {...field("method")}>
          {(["yes_no", "single_winner", "posts", "limited_vote"] as const).map((m) => (
            <option key={m} value={m}>
              {t(`method_${m}`)}
            </option>
          ))}
        </select>
        {form.method === "yes_no" && (
          <>
            <label for="v-rule">{t("rule")}</label>
            <select id="v-rule" {...field("rule")}>
              <option value="simple">{t("rule_simple")}</option>
              <option value="absolute">{t("rule_absolute")}</option>
              <option value="two_thirds">{t("rule_two_thirds")}</option>
            </select>
            <label for="v-base">{t("base")}</label>
            <select id="v-base" {...field("base")}>
              {(["cast", "present", "present_plus_proxies", "members"] as const).map((b) => (
                <option key={b} value={b}>
                  {t(`base_${b}`)}
                </option>
              ))}
            </select>
          </>
        )}
        {form.method === "posts" && (
          <>
            <label for="v-posts">{t("posts_list")}</label>
            <textarea id="v-posts" required rows={3} {...field("posts")} />
          </>
        )}
        {form.method !== "yes_no" && (
          <>
            <label for="v-cands">{form.method === "posts" ? t("posts_candidates") : t("candidates")}</label>
            <textarea id="v-cands" required rows={4} {...field("candidates")} />
          </>
        )}
        {form.method === "limited_vote" && (
          <>
            <label for="v-seats">{t("seats")}</label>
            <input id="v-seats" type="number" min={1} required {...field("seats")} />
            <label for="v-minimum">{t("minimum")}</label>
            <input id="v-minimum" type="number" min={0} required {...field("minimum")} />
          </>
        )}
        {!liveOnly && (
          <>
            <label for="v-timing">{t("timing")}</label>
            <select id="v-timing" {...field("timing")}>
              <option value="live">{t("timing_live")}</option>
              <option value="final_link">{t("timing_final_link")}</option>
            </select>
            {form.timing === "final_link" && (
              <>
                <label for="v-closes">{t("closes_at")}</label>
                <input id="v-closes" type="datetime-local" required {...field("closes_at")} />
              </>
            )}
          </>
        )}
        <label for="v-min">{t("min_attendance")}</label>
        <select id="v-min" {...field("min")}>
          <option value="">{t("none")}</option>
          <option value="half">1/2</option>
          <option value="third">1/3</option>
        </select>
        <label for="v-filter">{t("filter")}</label>
        <input id="v-filter" {...field("filter")} placeholder={t("filter_all")} />
        <button type="submit">{t("create")}</button>
      </form>
      {created && <SeedNotice {...created} />}
      <Outcome a={a} />
    </section>
  );
}

function SeedNotice({ commitment, seed }: { commitment: string; seed: string }) {
  return (
    <p class="note">
      {t("seed_saved")}{" "}
      <a href={seedFile(commitment, seed)} download={`seed-${commitment.slice(0, 8)}.json`}>
        {t("seed_download")}
      </a>
    </p>
  );
}

/** Reveals a seed kept in this browser, or pasted by the officials. */
function Reveal({ commitment, path, reload }: { commitment: string; path: string; reload: () => void }) {
  const [pasted, setPasted] = useState("");
  const a = useAction();
  const stored = loadSeed(commitment);
  return (
    <div>
      {stored === null && (
        <>
          <label for={`seed-${commitment}`}>{t("seed_missing")}</label>
          <input id={`seed-${commitment}`} value={pasted} onInput={(e) => setPasted(e.currentTarget.value.trim())} />
        </>
      )}
      <button type="button" onClick={() => a.run(async () => (await api("POST", path, { seed: stored ?? pasted }), reload()))}>
        {t("reveal")}
      </button>
      {a.error === "round_not_available" ? <Status kind="error">{t("round_not_ready")}</Status> : <Outcome a={a} />}
    </div>
  );
}

function VotingAdmin({ v, reload }: { v: VotingView; reload: () => void }) {
  const a = useAction();
  const [force, setForce] = useState("");
  const [wait, setWait] = useState(false);
  const [annul, setAnnul] = useState("");
  const act = (path: string, body?: unknown) => a.run(async () => (await api("POST", path, body ?? {}), reload()));
  const result = v.board?.result as { outcome?: string } | null | undefined;

  const next = () =>
    a.run(async () => {
      const { next } = await api<{ next: Record<string, unknown> | null }>("GET", `/votings/${v.id}/next`);
      if (next === null || "draw" in next) return t("nothing_next");
      await api("POST", "/votings", { meeting_id: v.meeting_id, ...next });
      reload();
      return t("next_created");
    });

  return (
    <article class="card" aria-label={v.title}>
      <h3>
        {v.title} <span class={`badge badge-${v.status}`}>{statusLabel(v.status)}</span>
      </h3>
      <p class="note">
        {t(`method_${v.method}`)} · {t(`mode_${v.mode}`)}
      </p>
      {v.opening?.key && <Fingerprint value={v.opening.key.fingerprint} />}
      {v.status === "created" && (
        <div>
          <label for={`force-${v.id}`}>{t("force_reason")}</label>
          <input id={`force-${v.id}`} value={force} onInput={(e) => setForce(e.currentTarget.value)} />
          {v.mode === "secret" && (
            <label class="option">
              <input type="checkbox" checked={wait} onChange={(e) => setWait(e.currentTarget.checked)} /> {t("wait_pages")}
            </label>
          )}
          <button type="button" onClick={() => act(`/votings/${v.id}/open`, { force_reason: force || undefined, wait_for_pages: wait })}>
            {t("open")}
          </button>
        </div>
      )}
      {v.status === "awaiting_pages" && (
        <button type="button" onClick={() => act(`/votings/${v.id}/activate`)}>
          {t("activate")}
        </button>
      )}
      {v.status === "open" && (v.mode === "manual" || v.mode === "paper") && <TalliesForm v={v} reload={reload} />}
      {v.status === "open" && v.timing === "live" && (
        <button type="button" onClick={() => act(`/votings/${v.id}/close`)}>
          {t("close")}
        </button>
      )}
      {v.status === "awaiting_draw" && (
        <>
          <p>{t("draw_info", { c: v.draw_commitment!.slice(0, 16), r: v.draw_round! })}</p>
          <Reveal commitment={v.draw_commitment!} path={`/votings/${v.id}/reveal`} reload={reload} />
        </>
      )}
      {["created", "open", "awaiting_pages", "awaiting_draw"].includes(v.status) && (
        <div>
          <label for={`annul-${v.id}`}>{t("annul_reason")}</label>
          <input id={`annul-${v.id}`} value={annul} onInput={(e) => setAnnul(e.currentTarget.value)} />
          <button type="button" onClick={() => act(`/votings/${v.id}/annul`, { reason: annul })}>
            {t("annul")}
          </button>
        </div>
      )}
      {v.status === "closed" && <Result v={v} />}
      {v.status === "closed" && result?.outcome === "draw_required" && <TieDraw v={v} reload={reload} />}
      {v.status === "closed" && v.method === "single_winner" && ["runoff", "qualified", "repeat", "draw_required"].includes(result?.outcome ?? "") && (
        <button type="button" onClick={next}>
          {t("next_step")}
        </button>
      )}
      <Outcome a={a} />
    </article>
  );
}

function TalliesForm({ v, reload }: { v: VotingView; reload: () => void }) {
  const cells: [string, string[]][] =
    v.method === "yes_no"
      ? [["q", ["for", "against", "blank", "abstain"]]]
      : v.method === "single_winner"
        ? [["choice", [...(v.params.candidates as string[]), "blank", "against_all", "abstain"]]]
        : v.method === "limited_vote"
          ? [["status", ["marked", "blank", "abstain"]], ...(v.params.candidates as string[]).map((c) => [c, ["marked", "unmarked"]] as [string, string[]])]
          : (v.params.candidates as { id: string; preferences: string[] }[]).flatMap((c) => c.preferences.map((p) => [`${c.id}@${p}`, ["for", "against", "abstain"]] as [string, string[]]));
  const cand = (id: string) => v.candidates?.candidates.find((c) => c.id === id)?.name ?? id;
  const post = (id: string) => v.candidates?.posts.find((p) => p.id === id)?.name ?? id;
  const cellLabel = (cell: string) =>
    cell === "q" ? v.title : cell === "choice" ? t("choose") : cell === "status" ? t("ballots_status") : cell.includes("@") ? `${cand(cell.split("@")[0]!)} — ${post(cell.split("@")[1]!)}` : cand(cell);
  const valueLabel = (x: string) => (["for", "against", "blank", "abstain", "against_all", "marked", "unmarked"].includes(x) ? t(`v_${x}` as Key) : cand(x));
  const [values, setValues] = useState<Record<string, string>>({});
  const [received, setReceived] = useState("");
  const a = useAction();
  const save = (e: Event) => {
    e.preventDefault();
    const tallies = Object.fromEntries(cells.map(([cell, vals]) => [cell, Object.fromEntries(vals.map((x) => [x, Number(values[`${cell}/${x}`] ?? 0)]))]));
    void a.run(async () => (await api("POST", `/votings/${v.id}/tallies`, { tallies, received: Number(received) }), reload(), t("done")));
  };
  return (
    <form onSubmit={save}>
      <h4>{t("tallies")}</h4>
      {cells.map(([cell, vals]) => (
        <fieldset key={cell}>
          <legend>{cellLabel(cell)}</legend>
          {vals.map((x) => (
            <label key={x}>
              {valueLabel(x)}
              <input type="number" min={0} value={values[`${cell}/${x}`] ?? ""} onInput={(e) => setValues({ ...values, [`${cell}/${x}`]: e.currentTarget.value })} />
            </label>
          ))}
        </fieldset>
      ))}
      <label for={`received-${v.id}`}>{t("received")}</label>
      <input id={`received-${v.id}`} type="number" min={0} required value={received} onInput={(e) => setReceived(e.currentTarget.value)} />
      <button type="submit">{t("save_tallies")}</button>
      <Outcome a={a} />
    </form>
  );
}

interface Draw {
  id: string;
  commitment: string;
  round: number;
  document: { winners: string[] } | null;
}

function TieDraw({ v, reload }: { v: VotingView; reload: () => void }) {
  const draws = usePoll(() => api<{ draws: Draw[] }>("GET", `/draws?voting_id=${v.id}`), 5000);
  const [created, setCreated] = useState<{ commitment: string; seed: string } | null>(null);
  const a = useAction();
  const d = draws.data?.draws[0];
  const name = (id: string) => v.candidates?.candidates.find((c) => c.id === id)?.name ?? id;
  if (!d) {
    return (
      <>
        <button
          type="button"
          onClick={() =>
            a.run(async () => {
              const s = newSeed();
              await api("POST", "/draws", { voting_id: v.id, commitment: s.commitment });
              setCreated(s);
              draws.reload();
            })
          }
        >
          {t("tie_draw")}
        </button>
        <Outcome a={a} />
      </>
    );
  }
  return (
    <div>
      <p>{t("tie_draw_info", { r: d.round })}</p>
      {created && <SeedNotice {...created} />}
      {d.document ? (
        <p class="headline">{t("winners", { names: d.document.winners.map(name).join(", ") })}</p>
      ) : (
        <Reveal commitment={d.commitment} path={`/draws/${d.id}/reveal`} reload={() => (draws.reload(), reload())} />
      )}
    </div>
  );
}

export function AssentsPanel({ reload }: PanelProps) {
  const list = usePoll(() => api<{ assents: AssentView[] }>("GET", "/assents"), 10000);
  const profile = usePoll(() => api<{ assent_excluded: string[] }>("GET", "/profile"), 600000);
  const [form, setForm] = useState({ title: "", text: "", closes_at: "", filter: "" });
  const [confirm, setConfirm] = useState(false);
  const a = useAction();
  return (
    <section aria-labelledby="h-assent-admin">
      <h2 id="h-assent-admin">{t("tab_assents")}</h2>
      {list.data?.assents.map((x) => (
        <article key={x.id} class="card" aria-label={x.title}>
          <h3>{x.title}</h3>
          <p>
            {t("objections")}: {x.objections}
          </p>
          {x.record && <p class="headline">{t(x.record.outcome === "approved" ? "outcome_approved" : "outcome_next_plenary")}</p>}
        </article>
      ))}
      <form
        class="card"
        onSubmit={(e) => {
          e.preventDefault();
          void a.run(async () => {
            await api("POST", "/assents", {
              title: form.title,
              text: form.text,
              closes_at: new Date(form.closes_at).toISOString().replace(/\.\d{3}Z$/, "Z"),
              electorate_filter: form.filter || null,
              not_excluded: confirm,
            });
            list.reload();
            reload();
            return t("done");
          });
        }}
      >
        <label for="as-title">{t("voting_title")}</label>
        <input id="as-title" required value={form.title} onInput={(e) => setForm({ ...form, title: e.currentTarget.value })} />
        <label for="as-text">{t("assent_text")}</label>
        <textarea id="as-text" required rows={4} value={form.text} onInput={(e) => setForm({ ...form, text: e.currentTarget.value })} />
        <label for="as-closes">{t("closes_at")}</label>
        <input id="as-closes" type="datetime-local" required value={form.closes_at} onInput={(e) => setForm({ ...form, closes_at: e.currentTarget.value })} />
        <label for="as-filter">{t("filter")}</label>
        <input id="as-filter" value={form.filter} placeholder={t("filter_all")} onInput={(e) => setForm({ ...form, filter: e.currentTarget.value })} />
        <label class="option">
          <input type="checkbox" required checked={confirm} onChange={(e) => setConfirm(e.currentTarget.checked)} />
          {t("assent_confirm", { list: (profile.data?.assent_excluded ?? []).join(", ") })}
        </label>
        <button type="submit">{t("send_proposal")}</button>
      </form>
      <Outcome a={a} />
    </section>
  );
}

/** Downloads the minutes with the session header (no cookies). */
export function MinutesPanel({ meeting }: PanelProps) {
  const a = useAction();
  if (!meeting) return <Status>{t("no_meeting")}</Status>;
  const download = (format: "md" | "json") =>
    a.run(async () => {
      const res = await fetch(`${cfg().api}/meetings/${meeting.id}/minutes${format === "json" ? "?format=json" : ""}`, {
        headers: { authorization: "Bearer " + getSession()!.token },
        credentials: "omit",
      });
      if (!res.ok) throw new Error("minutes");
      const link = document.createElement("a");
      link.href = URL.createObjectURL(await res.blob());
      link.download = `minutes-${meeting.id}.${format}`;
      link.click();
    });
  return (
    <section aria-labelledby="h-minutes">
      <h2 id="h-minutes">{t("minutes")}</h2>
      <button type="button" onClick={() => download("md")}>
        {t("download_md")}
      </button>{" "}
      <button type="button" onClick={() => download("json")}>
        {t("download_json")}
      </button>
      {a.error && <Status kind="error">{errorText(a.error)}</Status>}
    </section>
  );
}
