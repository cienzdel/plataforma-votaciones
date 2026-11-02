#!/bin/sh
# Lists what is still open on the voting machine (votings not finished, assents before their
# deadline) and fails if there is anything. Run on the VM from /opt/pv/src before Down: a deadline
# that passes while the machine is off would close on the next boot with nobody able to act, and an
# assent would be approved by a silence nobody could break.
set -eu
docker compose -f infra/compose.yaml exec -T api node -e '
  const Database = require("better-sqlite3");
  const db = new Database(process.env.PV_DB, { readonly: true });
  const votings = db.prepare("SELECT id, title, status FROM voting WHERE status IN (?, ?, ?)").all("open", "awaiting_pages", "awaiting_draw");
  const assents = db.prepare("SELECT id, title FROM assent WHERE status = ?").all("open");
  for (const v of votings) console.log("open voting:", v.id, v.status, v.title);
  for (const a of assents) console.log("open assent:", a.id, a.title);
  process.exit(votings.length + assents.length === 0 ? 0 : 1);
'
