#!/usr/bin/env bash
set -euo pipefail

: "${OPERATION:?OPERATION is required}"
: "${STATE_BUCKET:?STATE_BUCKET is required}"
: "${AWS_REGION:?AWS_REGION is required}"
: "${RUNNER_TEMP:?RUNNER_TEMP is required}"
: "${TARGET_SHA:?TARGET_SHA is required}"
: "${TARGET_REF:?TARGET_REF is required}"
: "${TF_VAR_kubernetes_version:?KUBERNETES_VERSION must be configured explicitly}"
: "${TF_VAR_datadog_enabled:?DATADOG_ENABLED must be explicit}"
[[ "$OPERATION" == plan || "$OPERATION" == apply ]]
[[ "$TF_VAR_datadog_enabled" == true || "$TF_VAR_datadog_enabled" == false ]]
export PLAN_WORKFLOW_FILE="${PLAN_WORKFLOW_FILE:-deploy.yml}" PLAN_OPERATION="$OPERATION"
PLAN_SCOPE=aws node scripts/terraform-plan-fingerprint.mjs --validate-environment

current="$RUNNER_TEMP/platform-current"
approved="$RUNNER_TEMP/platform-approved"
mkdir -p "$current"
stacks=(aws)
if [[ "$TF_VAR_datadog_enabled" == true ]]; then stacks+=(observability); fi
node --input-type=module -e 'process.stdout.write(JSON.stringify({schema_version:1,datadog_enabled:process.env.TF_VAR_datadog_enabled==="true"})+"\n")' > "$current/scope.json"

for stack in "${stacks[@]}"; do
  if [[ "$stack" == aws ]]; then key=oficina/kubernetes/terraform.tfstate; else key=oficina/observability/terraform.tfstate; fi
  terraform -chdir="$stack" init -input=false -lockfile=readonly \
    -backend-config="bucket=$STATE_BUCKET" -backend-config="key=$key" \
    -backend-config="region=$AWS_REGION" -backend-config="encrypt=true" -backend-config="use_lockfile=true"
  terraform -chdir="$stack" fmt -check -recursive
  terraform -chdir="$stack" validate -no-color
  plan="$RUNNER_TEMP/platform-${stack}.tfplan"
  terraform -chdir="$stack" plan -input=false -lock-timeout=5m -no-color -out="$plan" > "$RUNNER_TEMP/platform-${stack}-plan.log" 2>&1 || {
    cat "$RUNNER_TEMP/platform-${stack}-plan.log" >&2
    exit 1
  }
  terraform -chdir="$stack" show -no-color "$plan" > "$current/${stack}-plan.txt"
  # Raw plan JSON can contain secrets: it is piped into a hash, never persisted or uploaded.
  terraform -chdir="$stack" show -json "$plan" |
    PLAN_SCOPE="$stack" node scripts/terraform-plan-fingerprint.mjs > "$current/${stack}-review.json"
done

if [[ "$OPERATION" == apply ]]; then
  cmp "$approved/scope.json" "$current/scope.json" || { echo 'Datadog scope changed; request a new reviewed plan.' >&2; exit 1; }
  # Check every stack before applying any stack.
  for stack in "${stacks[@]}"; do
    cmp "$approved/${stack}-plan.txt" "$current/${stack}-plan.txt" || { echo 'Text plan changed; request a new reviewed plan.' >&2; exit 1; }
    node scripts/terraform-plan-fingerprint.mjs --compare "$approved/${stack}-review.json" "$current/${stack}-review.json"
  done
  for stack in "${stacks[@]}"; do
    terraform -chdir="$stack" apply -input=false -lock-timeout=5m -auto-approve "$RUNNER_TEMP/platform-${stack}.tfplan"
  done
  terraform -chdir=aws output
else
  if [[ "${PLAN_REVIEW_ELIGIBLE:-true}" == true ]]; then
    printf '## Platform plan\n\nReview the redacted text artifact for `%s` at `%s`.\n\nAfter review, configure homolog `PLATFORM_APPROVED_PLAN_RUN_ID=%s`, then request apply for the same SHA/ref. The state bucket was verified with encryption, versioning and public access blocking. No EKS resources were applied.\n' "$TARGET_REF" "$TARGET_SHA" "$GITHUB_RUN_ID" >> "$GITHUB_STEP_SUMMARY"
  else
    printf '## PR Plan aws\n\nActual Terraform preview for `%s` at `%s`; no apply or bucket bootstrap. This PR run is not an apply approval. Request an explicit Platform plan after its exact branch CI is green.\n' "$TARGET_REF" "$TARGET_SHA" >> "$GITHUB_STEP_SUMMARY"
  fi
fi
