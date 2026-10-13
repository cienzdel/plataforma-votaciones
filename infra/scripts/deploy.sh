#!/bin/sh
# Copies the repository at the deployed commit to the VM and starts the stack.
# Usage: deploy.sh <ip> <ssh private key> <env file> <profile file>
set -eu
ip=$1
key=$2
envfile=$3
profile=$4
ssh="ssh -i $key -o StrictHostKeyChecking=accept-new -o ConnectTimeout=10 root@$ip"

# Wait for SSH and for cloud-init to finish (first boot only; instant from a snapshot).
for _ in $(seq 1 60); do $ssh true 2>/dev/null && break; sleep 5; done
$ssh "cloud-init status --wait >/dev/null"

git archive --format=tar HEAD | $ssh "rm -rf /opt/pv/src && mkdir -p /opt/pv/src && tar -x -C /opt/pv/src"
$ssh "cat > /opt/pv/src/infra/.env && chmod 600 /opt/pv/src/infra/.env" < "$envfile"
$ssh "cat > /opt/pv/src/infra/profile.json" < "$profile"
$ssh "cd /opt/pv/src && docker compose -f infra/compose.yaml up -d --build --remove-orphans"
