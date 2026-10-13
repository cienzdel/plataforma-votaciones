#!/bin/sh
# Hetzner Cloud adapter for `up` and `down` (ADR-0017), used by the GitHub Actions workflows.
# Needs the hcloud CLI and HCLOUD_TOKEN. Every resource carries the label pv-instance=$PV_INSTANCE.
#
#   hetzner.sh up <ssh public key file>     creates the VM (from the last snapshot if any); prints its IPv4
#   hetzner.sh down                         shuts the VM down, snapshots it and deletes it
set -eu
instance=${PV_INSTANCE:-pv}
type=${PV_SERVER_TYPE:-cx22}
location=${PV_LOCATION:-fsn1}
label="pv-instance=$instance"
here=$(dirname "$0")

firewall() {
  if ! hcloud firewall describe "$instance" >/dev/null 2>&1; then
    hcloud firewall create --name "$instance" --label "$label" >/dev/null
    for port in 22 80 443; do
      hcloud firewall add-rule "$instance" --direction in --protocol tcp --port "$port" \
        --source-ips 0.0.0.0/0 --source-ips ::/0 >/dev/null
    done
  fi
}

case ${1:-} in
  up)
    key=$2
    # The newest snapshot of this instance, or a fresh Ubuntu with cloud-init.
    snapshot=$(hcloud image list --type snapshot --selector "$label" -o noheader -o columns=id | sort -n | tail -n 1)
    hcloud ssh-key delete "$instance-deploy" >/dev/null 2>&1 || true
    hcloud ssh-key create --name "$instance-deploy" --public-key-from-file "$key" --label "$label" >/dev/null
    firewall
    if [ -n "$snapshot" ]; then
      hcloud server create --name "$instance" --type "$type" --location "$location" --image "$snapshot" \
        --ssh-key "$instance-deploy" --firewall "$instance" --label "$label" >/dev/null
    else
      hcloud server create --name "$instance" --type "$type" --location "$location" --image ubuntu-24.04 \
        --ssh-key "$instance-deploy" --firewall "$instance" --label "$label" \
        --user-data-from-file "$here/../cloud-init.yaml" >/dev/null
    fi
    hcloud server ip "$instance"
    ;;
  down)
    hcloud server shutdown "$instance" --wait
    hcloud server create-image --type snapshot --label "$label" \
      --description "$instance $(date -u +%Y-%m-%dT%H:%M:%SZ)" "$instance" >/dev/null
    # Keep the two newest snapshots.
    hcloud image list --type snapshot --selector "$label" -o noheader -o columns=id | sort -n | head -n -2 |
      while read -r old; do hcloud image delete "$old"; done
    hcloud server delete "$instance"
    hcloud ssh-key delete "$instance-deploy" >/dev/null 2>&1 || true
    ;;
  *)
    echo "usage: hetzner.sh up <ssh public key file> | down" >&2
    exit 2
    ;;
esac
