#!/bin/sh
# Copies the repository at the deployed commit to the VM and starts the stack.
# Usage: deploy.sh <ip> <ssh private key> <env file> <profile file> <known_hosts file>
# PV_SSH_USER is root on Hetzner and ubuntu (with sudo) on Oracle. The known_hosts file holds the
# VM's fixed host key: no secret is sent to a machine that cannot prove it is the VM.
set -eu
ip=$1
key=$2
envfile=$3
profile=$4
known=$5
[ -n "$ip" ] || { echo "deploy.sh: no IP address" >&2; exit 2; }
user=${PV_SSH_USER:-root}
sudo=""
[ "$user" = root ] || sudo="sudo"
ssh="ssh -i $key -o StrictHostKeyChecking=yes -o UserKnownHostsFile=$known -o ConnectTimeout=10 $user@$ip"

# Wait for SSH and for cloud-init to finish (first boot only; instant from a snapshot).
for _ in $(seq 1 60); do $ssh true 2>/dev/null && break; sleep 5; done
$ssh "$sudo cloud-init status --wait >/dev/null"
# The current deploy key is the only one allowed in, so a rotated-out key stops working here too.
ssh-keygen -y -f "$key" | $ssh "umask 077 && mkdir -p ~/.ssh && cat > ~/.ssh/authorized_keys.new && mv ~/.ssh/authorized_keys.new ~/.ssh/authorized_keys"

git archive --format=tar HEAD | $ssh "$sudo sh -c 'rm -rf /opt/pv/src && mkdir -p /opt/pv/src && tar -x -C /opt/pv/src'"
$ssh "$sudo sh -c 'cat > /opt/pv/src/infra/.env && chmod 600 /opt/pv/src/infra/.env'" < "$envfile"
$ssh "$sudo sh -c 'cat > /opt/pv/src/infra/profile.json'" < "$profile"
$ssh "$sudo sh -c 'cd /opt/pv/src && docker compose -f infra/compose.yaml up -d --build --remove-orphans'"
