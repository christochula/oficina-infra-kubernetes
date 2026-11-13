#!/usr/bin/env bash
set -euo pipefail
[[ "${OPERATION:-}" == plan || "${OPERATION:-}" == apply ]]
[[ "${KUBERNETES_VERSION:-}" =~ ^1\.[0-9]+$ ]] || { echo 'Configure KUBERNETES_VERSION explicitly.' >&2; exit 1; }
[[ "${EXPECTED_AWS_ACCOUNT_ID:-}" =~ ^[0-9]{12}$ ]] || { echo 'Configure EXPECTED_AWS_ACCOUNT_ID explicitly.' >&2; exit 1; }
for role in "${CLUSTER_ROLE_ARN:-}" "${NODE_ROLE_ARN:-}"; do
  [[ "$role" == "arn:aws:iam::${EXPECTED_AWS_ACCOUNT_ID}:role/"* ]] || { echo 'Configure existing cluster/node IAM roles for the expected account.' >&2; exit 1; }
done
