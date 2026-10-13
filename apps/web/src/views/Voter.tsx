import { useEffect, useState } from "preact/hooks";
import { api, ApiError } from "../api.ts";
import { t, type Key } from "../i18n.ts";
import { errorText, Fingerprint, Result, Status, statusLabel, useAction, usePoll } from "../ui.tsx";
import { castBallot, checkMyReceipts, ensureCredentials, getReceipt, KeyMismatchError, receiptFile, StorageError, type Credential, type Receipt, type VotingView } from "../voting.ts";

interface Meeting {
  id: string;
  title: string;
  status: string;
}

export interface AssentView {
  id: string;
  title: string;
  text: string;
  status: "open" | "closed";
  closes_at: string;
  record: { outcome: string; objections: number } | null;
  in_electorate: boolean;
  objected: boolean;
  objections?: number;
}

export function Voter() {
  const { data, error, reload } = usePoll(async () => {
    const { meetings } = await api<{ meetings: Meeting[] }>("GET", "/meetings");
    const meeting = meetings.find((m) => m.status === "open") ?? null;
    const votings = meeting ? (await api<{ votings: VotingView[] }>("GET", `/votings?meeting_id=${meeting.id}`)).votings : [];
    const { assents } = await api<{ assents: AssentView[] }>("GET", "/assents");
    return { meeting, votings: votings.filter((v) => v.status !== "created"), assents };
  }, 3000);

  if (data === null) return error ? <Status kind="error">{errorText(error)}</Status> : <Status>{t("loading")}</Status>;
  return (
    <section>
      {data.meeting === null ? (
        <Status>{t("no_meeting")}</Status>
      ) : (
        <>
          <h1>{data.meeting.title}</h1>
          <h2>{t("votings")}</h2>
          {data.votings.length === 0 && <p>{t("no_votings")}</p>}
          {[...data.votings].reverse().map((v) => (
            <VotingCard key={v.id} v={v} reload={reload} />
          ))}
        </>
      )}
      {data.assents.length > 0 && <Assents assents={data.assents} reload={reload} />}
    </section>
  );
}

function VotingCard({ v, reload }: { v: VotingView; reload: () => void }) {
  const headingId = `voting-${v.id}`;
  let body = null;
  if (v.status === "open") {
    if (v.mode === "manual" || v.mode === "paper") body = <p>{t("manual_info")}</p>;
    else if (v.my_rights === 0) body = <p>{t("not_in_electorate")}</p>;
    else if (v.mode === "roll_call") body = <NominalBallots v={v} reload={reload} />;
    else body = <Ballots v={v} />;
  }
  return (
    <article class="card" aria-labelledby={headingId}>
      <h3 id={headingId}>
        {v.title} <span class={`badge badge-${v.status}`}>{statusLabel(v.status)}</span>
      </h3>
      {body}
      {v.status === "awaiting_draw" && <p>{t("draw_info", { c: v.draw_commitment!.slice(0, 16), r: v.draw_round! })}</p>}
      {v.status === "closed" && <Closed v={v} />}
    </article>
  );
}

function Closed({ v }: { v: VotingView }) {
  const check = checkMyReceipts(v);
  return (
    <>
      <Result v={v} />
      {check === true && <Status kind="ok">{t("check_ok")}</Status>}
      {check === false && <Status kind="error">{t("check_fail")}</Status>}
    </>
  );
}

function Ballots({ v }: { v: VotingView }) {
  const [creds, setCreds] = useState<Credential[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    ensureCredentials(v).then(setCreds, (e: Error) =>
      setError(
        e instanceof StorageError
          ? t("error_storage")
          : e instanceof KeyMismatchError
            ? t("error_key")
            : e instanceof ApiError && e.code === "already_issued"
              ? t("error_other_device")
              : t("error_generic"),
      ),
    );
  }, [v.id, v.my_rights]);

  if (error) return <Status kind="error">{error}</Status>;
  if (creds === null) return <Status>{t("getting_credentials")}</Status>;
  return (
    <>
      <Fingerprint value={v.opening!.key!.fingerprint} />
      {creds.map((c, j) => (
        <SecretBallot key={j} v={v} right={j} cred={c} />
      ))}
    </>
  );
}

function NominalBallots({ v, reload }: { v: VotingView; reload: () => void }) {
  return (
    <>
      <p class="note">{t("roll_call_warning")}</p>
      {Array.from({ length: v.my_rights }, (_, j) =>
        v.my_nominal_votes.includes(j) ? (
          <Status key={j} kind="ok">
            {label(j)}: {t("sent")}
          </Status>
        ) : (
          <BallotForm key={j} v={v} right={j} send={async (answers) => (await api("POST", `/votings/${v.id}/nominal`, { right: j, answers }), reload())} />
        ),
      )}
    </>
  );
}

const label = (right: number) => (right === 0 ? t("ballot_own") : t("ballot_proxy", { n: right }));

function SecretBallot({ v, right, cred }: { v: VotingView; right: number; cred: Credential }) {
  const [receipt, setReceipt] = useState<Receipt | null>(() => getReceipt(v.id, right));
  if (receipt) {
    return (
      <div class="ballot">
        <h4>{label(right)}</h4>
        <Status kind="ok">{t("sent")}</Status>
        <a class="button" href={receiptFile(receipt)} download={`receipt-${v.id}-${right}.json`}>
          {t("receipt_download")}
        </a>
        <p class="note">{t("receipt_warning")}</p>
      </div>
    );
  }
  return <BallotForm v={v} right={right} send={async (answers) => setReceipt(await castBallot(v, right, cred, answers))} />;
}

const name = (v: VotingView, id: string) => v.candidates?.candidates.find((c) => c.id === id)?.name ?? id;
const postName = (v: VotingView, id: string) => v.candidates?.posts.find((p) => p.id === id)?.name ?? id;

/** The cells of the ballot with their initial values (spec/formats.md §3). */
function initialAnswers(v: VotingView): Record<string, string> {
  if (v.method === "posts") {
    const p = v.params as { candidates: { id: string; preferences: string[] }[] };
    return Object.fromEntries(p.candidates.flatMap((c) => c.preferences.map((post) => [`${c.id}@${post}`, "abstain"])));
  }
  if (v.method === "limited_vote") return Object.fromEntries([["status", "blank"], ...(v.params.candidates as string[]).map((c) => [c, "unmarked"])]);
  return {};
}

function summary(v: VotingView, a: Record<string, string>): string[] {
  if (v.method === "yes_no") return [t(`v_${a.q}` as Key)];
  if (v.method === "single_winner") return [a.choice === "blank" || a.choice === "against_all" || a.choice === "abstain" ? t(`v_${a.choice}` as Key) : name(v, a.choice!)];
  if (v.method === "posts") return Object.entries(a).map(([cell, x]) => `${name(v, cell.split("@")[0]!)} — ${postName(v, cell.split("@")[1]!)}: ${t(`v_${x}` as Key)}`);
  if (a.status !== "marked") return [t(a.status === "abstain" ? "v_abstain" : "v_blank")];
  return (v.params.candidates as string[]).filter((c) => a[c] === "marked").map((c) => name(v, c));
}

/** Fills in a ballot, shows a summary and sends it on confirmation. */
function BallotForm({ v, right, send }: { v: VotingView; right: number; send: (answers: Record<string, string>) => Promise<void> }) {
  const [answers, setAnswers] = useState<Record<string, string>>(() => initialAnswers(v));
  const [reviewing, setReviewing] = useState(false);
  const a = useAction();
  const set = (cell: string, value: string) => setAnswers({ ...answers, [cell]: value });
  const prefix = `ballot-${v.id}-${right}`;
  const k = Math.max(1, ((v.params.seats as number) ?? 1) - 1);
  const marks = v.method === "limited_vote" ? (v.params.candidates as string[]).filter((c) => answers[c] === "marked").length : 0;

  const complete = v.method === "yes_no" ? answers.q !== undefined : v.method === "single_winner" ? answers.choice !== undefined : marks <= k;
  const finalAnswers = (): Record<string, string> => {
    if (v.method !== "limited_vote" || answers.status === "abstain") return answers;
    return { ...answers, status: marks > 0 ? "marked" : "blank" };
  };

  if (reviewing) {
    return (
      <div class="ballot">
        <h4>
          {t("review_title")}: {label(right)}
        </h4>
        <ul class="choice">
          {summary(v, finalAnswers()).map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
        <p class="note">{t("review_note")}</p>
        <button type="button" onClick={() => setReviewing(false)} disabled={a.busy}>
          {t("back")}
        </button>{" "}
        <button type="button" class="primary" onClick={() => a.run(() => send(finalAnswers()))} disabled={a.busy}>
          {a.busy ? t("sending") : t("send")}
        </button>
        {a.error && <Status kind="error">{errorText(a.error)}</Status>}
      </div>
    );
  }

  const radio = (cell: string, legend: string, options: [string, string][]) => (
    <fieldset key={cell}>
      <legend>{legend}</legend>
      {options.map(([id, text]) => (
        <label key={id} class="option">
          <input type="radio" name={`${prefix}-${cell}`} value={id} checked={answers[cell] === id} onChange={() => set(cell, id)} />
          {text}
        </label>
      ))}
    </fieldset>
  );

  let fields;
  if (v.method === "yes_no") fields = radio("q", `${label(right)} — ${t("choose")}`, (["for", "against", "blank", "abstain"] as const).map((x) => [x, t(`v_${x}`)]));
  else if (v.method === "single_winner")
    fields = radio("choice", `${label(right)} — ${t("choose")}`, [
      ...(v.params.candidates as string[]).map((c) => [c, name(v, c)] as [string, string]),
      ["blank", t("v_blank")],
      ["against_all", t("v_against_all")],
      ["abstain", t("v_abstain")],
    ]);
  else if (v.method === "posts")
    fields = (
      <>
        <h4>{label(right)}</h4>
        {Object.keys(answers).map((cell) => radio(cell, `${name(v, cell.split("@")[0]!)} — ${postName(v, cell.split("@")[1]!)}`, (["for", "against", "abstain"] as const).map((x) => [x, t(`v_${x}`)])))}
      </>
    );
  else
    fields = (
      <fieldset>
        <legend>
          {label(right)} — {t("mark_up_to", { k })}
        </legend>
        {(v.params.candidates as string[]).map((c) => (
          <label key={c} class="option">
            <input
              type="checkbox"
              checked={answers[c] === "marked"}
              disabled={answers.status === "abstain"}
              onChange={(e) => set(c, e.currentTarget.checked ? "marked" : "unmarked")}
            />
            {name(v, c)}
          </label>
        ))}
        <label class="option">
          <input type="checkbox" checked={answers.status === "abstain"} onChange={(e) => setAnswers({ ...initialAnswers(v), status: e.currentTarget.checked ? "abstain" : "blank" })} />
          {t("abstain_button")}
        </label>
        <p class="note">{marks > k ? <strong>{t("too_many_marks")}</strong> : t("no_marks_blank")}</p>
      </fieldset>
    );

  return (
    <form
      class="ballot"
      onSubmit={(e) => {
        e.preventDefault();
        if (complete) setReviewing(true);
      }}
    >
      {fields}
      <button type="submit" class="primary" disabled={!complete}>
        {t("review")}
      </button>
    </form>
  );
}

function Assents({ assents, reload }: { assents: AssentView[]; reload: () => void }) {
  const a = useAction();
  return (
    <section aria-labelledby="h-assents">
      <h2 id="h-assents">{t("assents")}</h2>
      {[...assents].reverse().map((x) => (
        <article key={x.id} class="card" aria-label={x.title}>
          <h3>{x.title}</h3>
          <p>{x.text}</p>
          <p class="note">
            {t("closes_at")}: {new Date(x.closes_at).toLocaleString()}
          </p>
          {x.record && <p class="headline">{t(x.record.outcome === "approved" ? "outcome_approved" : "outcome_next_plenary")}</p>}
          {x.status === "open" && x.in_electorate && (
            <>
              {x.objected && <Status kind="ok">{t("objected")}</Status>}
              <button type="button" onClick={() => a.run(async () => (await api(x.objected ? "DELETE" : "POST", `/assents/${x.id}/objection`), reload()))}>
                {t(x.objected ? "withdraw" : "object")}
              </button>
            </>
          )}
        </article>
      ))}
      {a.error && <Status kind="error">{errorText(a.error)}</Status>}
    </section>
  );
}
