#!/usr/bin/env bash
set -euo pipefail
: "${DATADOG_ENABLED:?DATADOG_ENABLED must be explicit}"
[[ "$DATADOG_ENABLED" == true || "$DATADOG_ENABLED" == false ]]
printf 'TF_VAR_datadog_enabled=%s\n' "$DATADOG_ENABLED" >> "$GITHUB_ENV"
if [[ "$DATADOG_ENABLED" == false ]]; then exit 0; fi
test -n "${DATADOG_SECRET_ID:-}" || { echo 'DATADOG_SECRET_ID is required when Datadog is enabled.' >&2; exit 1; }
[[ "${API_BASE_URL:-}" == https://* && "$API_BASE_URL" != *REPLACE* && "$API_BASE_URL" != *placeholder* ]] || { echo 'Configure the real HTTPS API_BASE_URL before enabling Datadog synthetics.' >&2; exit 1; }
aws secretsmanager get-secret-value --secret-id "$DATADOG_SECRET_ID" --query SecretString --output text > "$RUNNER_TEMP/platform-datadog.json"
api="$(jq -er '.api_key | select(type == "string" and length > 0)' "$RUNNER_TEMP/platform-datadog.json")"
app="$(jq -er '.app_key | select(type == "string" and length > 0)' "$RUNNER_TEMP/platform-datadog.json")"
echo "::add-mask::$api"
echo "::add-mask::$app"
printf 'TF_VAR_datadog_api_key=%s\nTF_VAR_datadog_app_key=%s\nDD_API_KEY=%s\nDD_APP_KEY=%s\n' "$api" "$app" "$api" "$app" >> "$GITHUB_ENV"
