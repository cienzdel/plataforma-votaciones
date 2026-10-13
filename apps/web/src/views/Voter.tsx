import { useEffect, useState } from "preact/hooks";
import { api } from "../api.ts";
import { t, type Key } from "../i18n.ts";
import { errorText, Fingerprint, Result, Status, statusLabel, usePoll } from "../ui.tsx";
import { castBallot, checkMyReceipts, ensureCredentials, getReceipt, KeyMismatchError, receiptFile, StorageError, type Credential, type Receipt, type VotingView } from "../voting.ts";

interface Meeting {
  id: string;
  title: string;
  status: string;
}

export function Voter() {
  const { data, error } = usePoll(async () => {
    const { meetings } = await api<{ meetings: Meeting[] }>("GET", "/meetings");
    const meeting = meetings.find((m) => m.status === "open") ?? null;
    const votings = meeting ? (await api<{ votings: VotingView[] }>("GET", `/votings?meeting_id=${meeting.id}`)).votings : [];
    return { meeting, votings: votings.filter((v) => v.status !== "created") };
  }, 3000);

  if (data === null) return error ? <Status kind="error">{errorText(error)}</Status> : <Status>{t("loading")}</Status>;
  if (data.meeting === null) return <Status>{t("no_meeting")}</Status>;
  return (
    <section>
      <h1>{data.meeting.title}</h1>
      <h2>{t("votings")}</h2>
      {data.votings.length === 0 && <p>{t("no_votings")}</p>}
      {[...data.votings].reverse().map((v) => (
        <VotingCard key={v.id} v={v} />
      ))}
    </section>
  );
}

function VotingCard({ v }: { v: VotingView }) {
  const headingId = `voting-${v.id}`;
  return (
    <article class="card" aria-labelledby={headingId}>
      <h3 id={headingId}>
        {v.title} <span class={`badge badge-${v.status}`}>{statusLabel(v.status)}</span>
      </h3>
      {v.status === "open" && (v.my_rights > 0 ? <Ballots v={v} /> : <p>{t("not_in_electorate")}</p>)}
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
      setError(e instanceof StorageError ? t("error_storage") : e instanceof KeyMismatchError ? t("error_key") : t("error_generic")),
    );
  }, [v.id, v.my_rights]);

  if (error) return <Status kind="error">{error}</Status>;
  if (creds === null) return <Status>{t("getting_credentials")}</Status>;
  return (
    <>
      <Fingerprint value={v.opening!.key.fingerprint} />
      {creds.map((c, j) => (
        <Ballot key={j} v={v} right={j} cred={c} />
      ))}
    </>
  );
}

function options(v: VotingView): [string, string][] {
  if (v.method === "yes_no") return (["for", "against", "blank", "abstain"] as const).map((x) => [x, t(`v_${x}` as Key)]);
  return [
    ...(v.candidates?.candidates ?? []).map((c) => [c.id, c.name] as [string, string]),
    ["blank", t("v_blank")],
    ["against_all", t("v_against_all")],
    ["abstain", t("v_abstain")],
  ];
}

function Ballot({ v, right, cred }: { v: VotingView; right: number; cred: Credential }) {
  const [choice, setChoice] = useState<string | null>(null);
  const [reviewing, setReviewing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [receipt, setReceipt] = useState<Receipt | null>(() => getReceipt(v.id, right));
  const [error, setError] = useState<string | null>(null);
  const cell = v.method === "yes_no" ? "q" : "choice";
  const label = right === 0 ? t("ballot_own") : t("ballot_proxy", { n: right });
  const opts = options(v);
  const name = `ballot-${v.id}-${right}`;

  if (receipt) {
    return (
      <div class="ballot">
        <h4>{label}</h4>
        <Status kind="ok">{t("sent")}</Status>
        <a class="button" href={receiptFile(receipt)} download={`receipt-${v.id}-${right}.json`}>
          {t("receipt_download")}
        </a>
        <p class="note">{t("receipt_warning")}</p>
      </div>
    );
  }

  const send = async () => {
    setBusy(true);
    setError(null);
    try {
      setReceipt(await castBallot(v, right, cred, { [cell]: choice! }));
    } catch (e) {
      setError(e instanceof StorageError ? t("error_storage") : t("error_generic"));
    } finally {
      setBusy(false);
    }
  };

  if (reviewing) {
    return (
      <div class="ballot">
        <h4>{t("review_title")}: {label}</h4>
        <p class="choice">{opts.find(([id]) => id === choice)![1]}</p>
        <p class="note">{t("review_note")}</p>
        <button type="button" onClick={() => setReviewing(false)} disabled={busy}>
          {t("back")}
        </button>{" "}
        <button type="button" class="primary" onClick={send} disabled={busy}>
          {busy ? t("sending") : t("send")}
        </button>
        {error && <Status kind="error">{error}</Status>}
      </div>
    );
  }

  return (
    <form
      class="ballot"
      onSubmit={(e) => {
        e.preventDefault();
        if (choice !== null) setReviewing(true);
      }}
    >
      <fieldset>
        <legend>
          {label} — {t("choose")}
        </legend>
        {opts.map(([id, text]) => (
          <label key={id} class="option">
            <input type="radio" name={name} value={id} checked={choice === id} onChange={() => setChoice(id)} required />
            {text}
          </label>
        ))}
      </fieldset>
      <button type="submit" class="primary">
        {t("review")}
      </button>
    </form>
  );
}
