#!/usr/bin/env bash
set -euo pipefail
umask 077
[[ "${OPERATION:-}" == apply && "${TF_VAR_datadog_enabled:-}" == true ]]
[[ "${AWS_REGION:-}" == us-east-1 && "${EXPECTED_AWS_ACCOUNT_ID:-}" =~ ^[0-9]{12}$ ]]
[[ "${DATADOG_SECRET_ID:-}" == oficina/datadog ]]
[[ "${CLUSTER_NAME:-}" == oficina-homolog-eks ]]
account="$(aws sts get-caller-identity --query Account --output text)"
[[ "$account" == "$EXPECTED_AWS_ACCOUNT_ID" ]] || { echo 'Datadog runtime account mismatch' >&2; exit 1; }
cluster_arn="$(aws eks describe-cluster --name "$CLUSTER_NAME" --query cluster.arn --output text)"
[[ "$cluster_arn" == "arn:aws:eks:us-east-1:${EXPECTED_AWS_ACCOUNT_ID}:cluster/oficina-homolog-eks" ]]
status="$(aws eks describe-cluster --name "$CLUSTER_NAME" --query cluster.status --output text)"
[[ "$status" == ACTIVE ]] || { echo 'Enable Datadog only after the base EKS cluster is ACTIVE' >&2; exit 1; }
secret_dir="$(mktemp -d "${RUNNER_TEMP:?}/oficina-datadog-agent-XXXXXX")"
trap 'rm -rf "$secret_dir"' EXIT
chmod 700 "$secret_dir"
aws eks update-kubeconfig --name "$CLUSTER_NAME" --kubeconfig "$secret_dir/kubeconfig" >/dev/null
export KUBECONFIG="$secret_dir/kubeconfig"
aws secretsmanager get-secret-value --secret-id "$DATADOG_SECRET_ID" --query SecretString --output text > "$secret_dir/credentials.json"
jq -ej '.api_key | select(type == "string" and length >= 16)' "$secret_dir/credentials.json" > "$secret_dir/api-key"
jq -ej '.app_key | select(type == "string" and length >= 16)' "$secret_dir/credentials.json" > "$secret_dir/app-key"
rm -f "$secret_dir/credentials.json"
kubectl create namespace datadog --dry-run=client -o yaml | kubectl apply -f -
kubectl -n datadog create secret generic datadog-credentials --from-file=api-key="$secret_dir/api-key" --from-file=app-key="$secret_dir/app-key" --dry-run=client -o yaml | kubectl apply -f -
