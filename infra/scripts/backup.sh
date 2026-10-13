#!/bin/sh
# Encrypted backup of the database (ADR-0022), run on the VM from /opt/pv.
# Usage: backup.sh <age recipients file> <output file>
# SQLite's online backup API gives a consistent copy while the API keeps running; the copy is
# encrypted with age to the public keys of the people who keep the private keys offline.
set -eu
recipients=$1
out=$2
compose="docker compose -f infra/compose.yaml"
# The copy goes to the data volume: /tmp in the container is a tmpfs, which `docker cp` cannot read.
$compose exec -T api node -e '
  const Database = require("better-sqlite3");
  new Database(process.env.PV_DB, { readonly: true }).backup("/data/pv-backup.db").then(() => process.exit(0));
'
$compose cp api:/data/pv-backup.db /tmp/pv-backup.db
$compose exec -T api rm -f /data/pv-backup.db
age --encrypt --recipients-file "$recipients" --output "$out" /tmp/pv-backup.db
shred -u /tmp/pv-backup.db 2>/dev/null || rm -f /tmp/pv-backup.db
echo "backup written to $out"
