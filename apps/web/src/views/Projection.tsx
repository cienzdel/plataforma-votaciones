import { api } from "../api.ts";
import { t } from "../i18n.ts";
import { errorText, Fingerprint, Result, Status, statusLabel, usePoll } from "../ui.tsx";
import type { VotingView } from "../voting.ts";
import { QuorumLine } from "./Officials.tsx";

/** Read-only view for the room's screen: the current voting, its key fingerprint, quorum and result. */
export function Projection() {
  const { data, error } = usePoll(async () => {
    const { meetings } = await api<{ meetings: { id: string; status: string }[] }>("GET", "/meetings");
    const open = meetings.find((m) => m.status === "open");
    if (!open) return null;
    const meeting = await api<{ title: string; quorum: { call: number; required: number; present: number; met: boolean } | null }>("GET", `/meetings/${open.id}`);
    const { votings } = await api<{ votings: VotingView[] }>("GET", `/votings?meeting_id=${open.id}`);
    return { meeting, voting: votings.filter((v) => v.status !== "created").at(-1) ?? null };
  }, 2000);

  if (error) return <Status kind="error">{errorText(error)}</Status>;
  if (data === undefined || data === null) return <Status>{t("no_meeting")}</Status>;
  const v = data.voting;
  return (
    <section class="projection">
      <h1>{data.meeting.title}</h1>
      {data.meeting.quorum && <QuorumLine q={data.meeting.quorum} />}
      {v && (
        <article aria-live="polite">
          <h2>
            {v.title} <span class={`badge badge-${v.status}`}>{statusLabel(v.status)}</span>
          </h2>
          {v.opening?.key && <Fingerprint value={v.opening.key.fingerprint} />}
          {v.draw_commitment && v.draw_round && v.status !== "closed" && <p>{t("draw_info", { c: v.draw_commitment.slice(0, 16), r: v.draw_round })}</p>}
          {v.status === "closed" && <Result v={v} />}
        </article>
      )}
    </section>
  );
}
