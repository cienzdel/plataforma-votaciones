#!/bin/sh
# Writes the cloud-init user data for a VM to standard output (ADR-0017).
# Usage: user-data.sh full|restore <host private key file> <deploy public key file>
#
#   full     first boot of a fresh VM: infra/cloud-init.yaml plus the SSH host key
#   restore  a Hetzner VM created again from a snapshot: only the SSH host key, and the deploy key
#            as the only authorized key, written by bootcmd before sshd starts, so that a key
#            removed from the secrets no longer opens the restored disk
#
# The host key is fixed (secret PV_SSH_HOST_KEY), so that Up and Down can check the VM's identity
# before sending it any secret, instead of trusting whatever key answers first.
set -eu
mode=$1
hostkey=$2
deploykey=$3
here=$(dirname "$0")
host_public=$(ssh-keygen -y -f "$hostkey")
deploy_public=$(cut -d' ' -f1,2 "$deploykey")

if [ "$mode" = full ]; then
  cat "$here/../cloud-init.yaml"
else
  echo "#cloud-config"
  echo "bootcmd:"
  echo "  - [sh, -c, 'mkdir -p /root/.ssh && printf \"%s\\n\" \"$deploy_public\" > /root/.ssh/authorized_keys && chmod 600 /root/.ssh/authorized_keys']"
fi
echo "ssh_deletekeys: true"
echo "ssh_genkeytypes: []"
echo "ssh_keys:"
echo "  ed25519_private: |"
sed 's/^/    /' "$hostkey"
echo "  ed25519_public: $host_public"
