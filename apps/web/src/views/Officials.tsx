import { useState } from "preact/hooks";
import { api } from "../api.ts";
import { getLang, t, type Key } from "../i18n.ts";
import { errorText, Fingerprint, Result, Status, statusLabel, useAction, usePoll } from "../ui.tsx";
import type { VotingView } from "../voting.ts";

interface Member {
  id: string;
  name: string;
  email: string;
  degrees: string[];
  active: boolean;
}
interface Delegation {
  fromMemberId: string;
  toMemberId: string;
  suspendedAt: number | null;
}
interface Quorum {
  call: number;
  required: number;
  present: number;
  met: boolean;
}
interface MeetingDetail {
  id: string;
  title: string;
  status: "scheduled" | "open" | "closed";
  call: number;
  quorum: Quorum | null;
  present: string[];
  delegations: Delegation[];
  second_call_available_at: number | null;
}

const TABS = ["meeting", "attendance", "proxies", "votings", "census", "roles", "assisted"] as const;
type Tab = (typeof TABS)[number];

export function Officials() {
  const [tab, setTab] = useState<Tab>("meeting");
  const state = usePoll(async () => {
    const { meetings } = await api<{ meetings: MeetingDetail[] }>("GET", "/meetings");
    const current = meetings.find((m) => m.status === "open") ?? meetings.filter((m) => m.status === "scheduled").at(-1) ?? null;
    const detail = current ? await api<MeetingDetail>("GET", `/meetings/${current.id}`) : null;
    const { members } = await api<{ members: Member[] }>("GET", "/census");
    const votings = detail ? (await api<{ votings: VotingView[] }>("GET", `/votings?meeting_id=${detail.id}`)).votings : [];
    return { meeting: detail, members: members.filter((m) => m.active), votings };
  }, 4000);

  if (state.data === null) return state.error ? <Status kind="error">{state.error === "officials_only" ? t("officials_only") : errorText(state.error)}</Status> : <Status>{t("loading")}</Status>;
  const props = { ...state.data, reload: state.reload };
  return (
    <section>
      <h1>{t("nav_officials")}</h1>
      <nav class="tabs" aria-label={t("nav_officials")}>
        {TABS.map((x) => (
          <button key={x} type="button" aria-current={tab === x ? "page" : undefined} onClick={() => setTab(x)}>
            {t(`tab_${x}` as Key)}
          </button>
        ))}
      </nav>
      {tab === "meeting" && <MeetingPanel {...props} />}
      {tab === "attendance" && <AttendancePanel {...props} />}
      {tab === "proxies" && <ProxyPanel {...props} />}
      {tab === "votings" && <VotingPanel {...props} />}
      {tab === "census" && <CensusPanel {...props} />}
      {tab === "roles" && <RolesPanel {...props} />}
      {tab === "assisted" && <AssistedPanel {...props} />}
    </section>
  );
}

interface PanelProps {
  meeting: MeetingDetail | null;
  members: Member[];
  votings: VotingView[];
  reload: () => void;
}

function Outcome({ a }: { a: ReturnType<typeof useAction> }) {
  return (
    <>
      {a.error && <Status kind="error">{errorText(a.error)}</Status>}
      {a.message && <Status kind="ok">{a.message}</Status>}
    </>
  );
}

export function QuorumLine({ q }: { q: Quorum }) {
  return (
    <p class={q.met ? "quorum met" : "quorum not-met"}>
      <strong>{t(q.met ? "quorum_met" : "quorum_not_met")}</strong>: {t("quorum_status", { present: q.present, required: q.required, call: q.call })}
    </p>
  );
}

function MeetingPanel({ meeting, reload }: PanelProps) {
  const [title, setTitle] = useState("");
  const a = useAction();
  const act = (f: () => Promise<unknown>) => a.run(async () => (await f(), reload()));
  return (
    <section aria-labelledby="h-meeting">
      <h2 id="h-meeting">{t("tab_meeting")}</h2>
      {meeting && (
        <div class="card">
          <h3>
            {meeting.title} <span class="badge">{meeting.status}</span>
          </h3>
          {meeting.quorum && <QuorumLine q={meeting.quorum} />}
          {meeting.status === "scheduled" && <button type="button" onClick={() => act(() => api("POST", `/meetings/${meeting.id}/open`))}>{t("open")}</button>}
          {meeting.status === "open" && meeting.call === 1 && (
            <p>
              <button type="button" onClick={() => act(() => api("POST", `/meetings/${meeting.id}/second-call`))}>{t("second_call")}</button>{" "}
              {meeting.second_call_available_at !== null && (
                <span class="note">{t("second_call_at", { time: new Date(meeting.second_call_available_at).toLocaleTimeString(getLang()) })}</span>
              )}
            </p>
          )}
          {meeting.status === "open" && <button type="button" onClick={() => act(() => api("POST", `/meetings/${meeting.id}/close`))}>{t("close")}</button>}
        </div>
      )}
      {(!meeting || meeting.status === "closed") && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void act(() => api("POST", "/meetings", { title }));
          }}
        >
          <label for="meeting-title">{t("meeting_title")}</label>
          <input id="meeting-title" required value={title} onInput={(e) => setTitle(e.currentTarget.value)} />
          <button type="submit">{t("create")}</button>
        </form>
      )}
      <Outcome a={a} />
    </section>
  );
}

function AttendancePanel({ meeting, members, reload }: PanelProps) {
  const a = useAction();
  if (!meeting || meeting.status !== "open") return <Status>{t("no_meeting")}</Status>;
  const mark = (member_id: string, kind: string, mode = "in_person") => a.run(async () => (await api("POST", `/meetings/${meeting.id}/attendance`, { member_id, kind, mode }), reload()));
  return (
    <section aria-labelledby="h-att">
      <h2 id="h-att">{t("tab_attendance")}</h2>
      {meeting.quorum && <QuorumLine q={meeting.quorum} />}
      <Outcome a={a} />
      <table>
        <tbody>
          {members.map((m) => {
            const here = meeting.present.includes(m.id);
            return (
              <tr key={m.id}>
                <th scope="row">{m.name}</th>
                <td>{t(here ? "present" : "absent")}</td>
                <td>
                  {here ? (
                    <button type="button" onClick={() => mark(m.id, "out")} aria-label={`${t("mark_out")}: ${m.name}`}>{t("mark_out")}</button>
                  ) : (
                    <>
                      <button type="button" onClick={() => mark(m.id, "in")} aria-label={`${t("mark_in")}: ${m.name}`}>{t("mark_in")}</button>{" "}
                      <button type="button" onClick={() => mark(m.id, "in", "remote")} aria-label={`${t("mark_remote")}: ${m.name}`}>{t("mark_remote")}</button>
                    </>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </section>
  );
}

function MemberSelect({ id, label, members, value, onChange }: { id: string; label: string; members: Member[]; value: string; onChange: (v: string) => void }) {
  return (
    <>
      <label for={id}>{label}</label>
      <select id={id} required value={value} onChange={(e) => onChange(e.currentTarget.value)}>
        <option value="">—</option>
        {members.map((m) => (
          <option key={m.id} value={m.id}>
            {m.name}
          </option>
        ))}
      </select>
    </>
  );
}

function ProxyPanel({ meeting, members, reload }: PanelProps) {
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [justified, setJustified] = useState(false);
  const a = useAction();
  if (!meeting || meeting.status === "closed") return <Status>{t("no_meeting")}</Status>;
  const name = (id: string) => members.find((m) => m.id === id)?.name ?? id;
  return (
    <section aria-labelledby="h-proxy">
      <h2 id="h-proxy">{t("tab_proxies")}</h2>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void a.run(async () => {
            await api("POST", `/meetings/${meeting.id}/delegations`, { from_member_id: from, to_member_id: to, justified });
            reload();
            return t("done");
          });
        }}
      >
        <MemberSelect id="proxy-from" label={t("proxy_from")} members={members} value={from} onChange={setFrom} />
        <MemberSelect id="proxy-to" label={t("proxy_to")} members={members} value={to} onChange={setTo} />
        <label class="option">
          <input type="checkbox" required checked={justified} onChange={(e) => setJustified(e.currentTarget.checked)} /> {t("proxy_justified")}
        </label>
        <button type="submit">{t("proxy_register")}</button>
      </form>
      <Outcome a={a} />
      <ul>
        {meeting.delegations.map((d) => (
          <li key={d.fromMemberId}>
            {name(d.fromMemberId)} → {name(d.toMemberId)} {d.suspendedAt !== null && <em>({t("proxy_suspended")})</em>}
            {d.suspendedAt === null && (
              <button type="button" onClick={() => a.run(async () => (await api("DELETE", `/meetings/${meeting.id}/delegations/${d.fromMemberId}`), reload()))}>
                {t("proxy_revoke")}
              </button>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

function VotingPanel({ meeting, votings, reload }: PanelProps) {
  const a = useAction();
  const [form, setForm] = useState({ title: "", method: "yes_no", rule: "simple", base: "cast", timing: "live", closes_at: "", filter: "", min: "", candidates: "" });
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const [wait, setWait] = useState(false);
  if (!meeting || meeting.status !== "open") return <Status>{t("no_meeting")}</Status>;
  const field = (k: keyof typeof form) => ({ value: form[k], onInput: (e: Event) => setForm({ ...form, [k]: (e.currentTarget as HTMLInputElement).value }) });

  const create = (e: Event) => {
    e.preventDefault();
    void a.run(async () => {
      const names = form.candidates.split("\n").map((x) => x.trim()).filter(Boolean);
      const ids = names.map((_, i) => `c${i + 1}`);
      const rule = form.rule === "two_thirds" ? [2, 3] : form.rule;
      const params =
        form.method === "yes_no"
          ? { base: form.base, rule }
          : { candidates: ids, stage: "first", attempt: 0, repetitions: 1, against_all_blocks: false, subject: "person" };
      await api("POST", "/votings", {
        meeting_id: meeting.id,
        title: form.title,
        method: form.method,
        params,
        timing: form.timing,
        closes_at: form.timing === "final_link" ? new Date(form.closes_at).toISOString().replace(/\.\d{3}Z$/, "Z") : undefined,
        electorate_filter: form.filter || null,
        min_attendance: form.min === "half" ? [1, 2] : form.min === "third" ? [1, 3] : null,
        candidates: names.map((n, i) => ({ id: ids[i], name: n })),
      });
      reload();
      return t("done");
    });
  };
  const act = (path: string, body?: unknown) => a.run(async () => (await api("POST", path, body ?? {}), reload()));

  return (
    <section aria-labelledby="h-votings">
      <h2 id="h-votings">{t("tab_votings")}</h2>
      {[...votings].reverse().map((v) => (
        <article key={v.id} class="card" aria-label={v.title}>
          <h3>
            {v.title} <span class={`badge badge-${v.status}`}>{statusLabel(v.status)}</span>
          </h3>
          {v.opening && <Fingerprint value={v.opening.key.fingerprint} />}
          {v.status === "created" && (
            <div>
              <label for={`force-${v.id}`}>{t("force_reason")}</label>
              <input id={`force-${v.id}`} value={reasons[v.id] ?? ""} onInput={(e) => setReasons({ ...reasons, [v.id]: e.currentTarget.value })} />
              <label class="option">
                <input type="checkbox" checked={wait} onChange={(e) => setWait(e.currentTarget.checked)} /> {t("wait_pages")}
              </label>
              <button type="button" onClick={() => act(`/votings/${v.id}/open`, { force_reason: reasons[v.id] || undefined, wait_for_pages: wait })}>{t("open")}</button>
            </div>
          )}
          {v.status === "awaiting_pages" && <button type="button" onClick={() => act(`/votings/${v.id}/activate`)}>{t("activate")}</button>}
          {v.status === "open" && v.opening?.closes_at === null && <button type="button" onClick={() => act(`/votings/${v.id}/close`)}>{t("close")}</button>}
          {(v.status === "created" || v.status === "open" || v.status === "awaiting_pages") && (
            <div>
              <label for={`annul-${v.id}`}>{t("annul_reason")}</label>
              <input id={`annul-${v.id}`} value={reasons["a" + v.id] ?? ""} onInput={(e) => setReasons({ ...reasons, ["a" + v.id]: e.currentTarget.value })} />
              <button type="button" onClick={() => act(`/votings/${v.id}/annul`, { reason: reasons["a" + v.id] })}>{t("annul")}</button>
            </div>
          )}
          {v.status === "closed" && <Result v={v} />}
        </article>
      ))}
      <form onSubmit={create} class="card">
        <h3>{t("create")}</h3>
        <label for="v-title">{t("voting_title")}</label>
        <input id="v-title" required {...field("title")} />
        <label for="v-method">{t("method")}</label>
        <select id="v-method" {...field("method")}>
          <option value="yes_no">{t("method_yes_no")}</option>
          <option value="single_winner">{t("method_single_winner")}</option>
        </select>
        {form.method === "yes_no" ? (
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
        ) : (
          <>
            <label for="v-cands">{t("candidates")}</label>
            <textarea id="v-cands" required rows={4} {...field("candidates")} />
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
      <Outcome a={a} />
    </section>
  );
}

function CensusPanel({ meeting, members, reload }: PanelProps) {
  const [csv, setCsv] = useState("");
  const [reason, setReason] = useState("");
  const a = useAction();
  const send = (dry_run: boolean) =>
    a.run(async () => {
      const r = await api<{ added: number; updated: number; deactivated: number }>("POST", "/census/import", { csv, dry_run, reason: reason || undefined });
      if (!dry_run) reload();
      return t("census_summary", r);
    });
  return (
    <section aria-labelledby="h-census">
      <h2 id="h-census">{t("tab_census")}</h2>
      <label for="csv">{t("csv")}</label>
      <textarea id="csv" rows={8} value={csv} onInput={(e) => setCsv(e.currentTarget.value)} />
      {meeting?.status === "open" && (
        <>
          <label for="census-reason">{t("reason_open_meeting")}</label>
          <input id="census-reason" value={reason} onInput={(e) => setReason(e.currentTarget.value)} />
        </>
      )}
      <button type="button" onClick={() => send(true)}>{t("preview")}</button> <button type="button" onClick={() => send(false)}>{t("import")}</button>
      <Outcome a={a} />
      <p>
        {members.length} · {members.map((m) => m.name).join(", ")}
      </p>
    </section>
  );
}

function RolesPanel({ members }: PanelProps) {
  const roles = usePoll(() => api<{ officials: { member_id: string; alias: string; name: string }[] }>("GET", "/roles"), 10000);
  const [who, setWho] = useState("");
  const [alias, setAlias] = useState("");
  const a = useAction();
  return (
    <section aria-labelledby="h-roles">
      <h2 id="h-roles">{t("tab_roles")}</h2>
      <ul>
        {roles.data?.officials.map((o) => (
          <li key={o.member_id}>
            {o.name} ({o.alias}){" "}
            <button type="button" onClick={() => a.run(async () => (await api("DELETE", `/roles/${o.member_id}`), roles.reload()))}>{t("remove")}</button>
          </li>
        ))}
      </ul>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void a.run(async () => (await api("POST", "/roles", { member_id: who, alias }), roles.reload()));
        }}
      >
        <MemberSelect id="role-member" label={t("member")} members={members} value={who} onChange={setWho} />
        <label for="role-alias">{t("role_alias")}</label>
        <input id="role-alias" required value={alias} onInput={(e) => setAlias(e.currentTarget.value)} />
        <button type="submit">{t("assign")}</button>
      </form>
      <Outcome a={a} />
    </section>
  );
}

function AssistedPanel({ members }: PanelProps) {
  const [who, setWho] = useState("");
  const a = useAction();
  return (
    <section aria-labelledby="h-assisted">
      <h2 id="h-assisted">{t("tab_assisted")}</h2>
      <p class="note">{t("assisted_note")}</p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void a.run(async () => {
            const { code } = await api<{ code: string }>("POST", "/auth/assisted-code", { member_id: who });
            return t("assisted_code", { name: members.find((m) => m.id === who)?.name ?? "", code });
          });
        }}
      >
        <MemberSelect id="assisted-member" label={t("member")} members={members} value={who} onChange={setWho} />
        <button type="submit">{t("generate")}</button>
      </form>
      <Outcome a={a} />
    </section>
  );
}
