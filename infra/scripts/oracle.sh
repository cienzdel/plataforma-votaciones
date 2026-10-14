#!/bin/sh
# Oracle Cloud "Always Free" adapter for `up` and `down` (ADR-0017, amended): the free default.
# One Ampere A1 VM in the tenancy's home region (chosen in the EU at sign-up). It is created once
# and then only started and stopped: its boot volume keeps the data, so no snapshot is needed.
# Needs the OCI CLI configured (~/.oci/config) and these variables:
#   OCI_COMPARTMENT_OCID, OCI_SUBNET_OCID (public subnet), OCI_AVAILABILITY_DOMAIN
#
#   oracle.sh up <ssh public key file>    starts (or creates) the VM; prints its public IPv4
#   oracle.sh down                        stops the VM
set -eu
instance=${PV_INSTANCE:-pv}
here=$(dirname "$0")
compartment=$OCI_COMPARTMENT_OCID

instance_id() {
  # shellcheck disable=SC2016 # JMESPath literal in backticks, not a shell expansion.
  oci compute instance list --compartment-id "$compartment" --display-name "$instance" --all \
    --query 'data[?"lifecycle-state" != `TERMINATED`] | [0].id' --raw-output
}

case ${1:-} in
  up)
    key=$2
    id=$(instance_id)
    if [ -z "$id" ] || [ "$id" = "null" ]; then
      # Newest Ubuntu 24.04 image for Arm in the region. Free shape: 2 OCPUs and 12 GB in total.
      image=$(oci compute image list --compartment-id "$compartment" --operating-system "Canonical Ubuntu" \
        --operating-system-version "24.04" --shape VM.Standard.A1.Flex --sort-by TIMECREATED --sort-order DESC \
        --limit 1 --query 'data[0].id' --raw-output 2>/dev/null)
      if [ -z "$image" ] || [ "$image" = null ]; then echo "oracle.sh: no Ubuntu 24.04 Arm image found" >&2; exit 1; fi
      # Free Arm capacity is often exhausted ("Out of host capacity", or 429): retry for a while.
      attempt=1
      until id=$(oci compute instance launch --compartment-id "$compartment" --availability-domain "$OCI_AVAILABILITY_DOMAIN" \
        --display-name "$instance" --shape VM.Standard.A1.Flex --shape-config '{"ocpus": 2, "memoryInGBs": 12}' \
        --image-id "$image" --subnet-id "$OCI_SUBNET_OCID" --assign-public-ip true \
        --ssh-authorized-keys-file "$key" --user-data-file "$here/../cloud-init.yaml" \
        --wait-for-state RUNNING --query 'data.id' --raw-output 2>/tmp/oci-launch.err); do
        if [ "$attempt" -ge "${PV_LAUNCH_ATTEMPTS:-12}" ] || ! grep -qE 'Out of host capacity|TooManyRequests|InternalError' /tmp/oci-launch.err; then
          cat /tmp/oci-launch.err >&2
          exit 1
        fi
        echo "launch attempt $attempt failed (capacity or rate limit); retrying in 5 minutes" >&2
        attempt=$((attempt + 1))
        sleep 300
      done
    else
      oci compute instance action --instance-id "$id" --action START --wait-for-state RUNNING >/dev/null
    fi
    oci compute instance list-vnics --instance-id "$id" --query 'data[0]."public-ip"' --raw-output
    ;;
  down)
    oci compute instance action --instance-id "$(instance_id)" --action SOFTSTOP --wait-for-state STOPPED >/dev/null
    ;;
  ip)
    oci compute instance list-vnics --instance-id "$(instance_id)" --query 'data[0]."public-ip"' --raw-output
    ;;
  *)
    echo "usage: oracle.sh up <ssh public key file> | down | ip" >&2
    exit 2
    ;;
esac
