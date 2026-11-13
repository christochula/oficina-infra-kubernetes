#!/usr/bin/env bash
set -euo pipefail

: "${AWS_REGION:?AWS_REGION is required}"
: "${EXPECTED_AWS_ACCOUNT_ID:?Configure EXPECTED_AWS_ACCOUNT_ID in homolog}"
: "${OPERATION:?OPERATION is required}"
: "${RUNNER_TEMP:?RUNNER_TEMP is required}"
: "${GITHUB_OUTPUT:?GITHUB_OUTPUT is required}"
[[ "$EXPECTED_AWS_ACCOUNT_ID" =~ ^[0-9]{12}$ ]]
[[ "$OPERATION" == plan || "$OPERATION" == apply ]]
bootstrap="${ALLOW_STATE_BOOTSTRAP:-false}"
[[ "$bootstrap" == true || "$bootstrap" == false ]]

account="$(aws sts get-caller-identity --query Account --output text)"
if [[ "$account" != "$EXPECTED_AWS_ACCOUNT_ID" ]]; then
  echo 'AWS session account differs from the explicitly configured account.' >&2
  exit 1
fi
bucket="oficina-tc3-tfstate-${account}"
created=false
if ! aws s3api head-bucket --bucket "$bucket" --expected-bucket-owner "$account" 2>"$RUNNER_TEMP/platform-bucket-error.txt"; then
  if [[ "$OPERATION" != plan || "$bootstrap" != true ]] || ! grep -Eq '\(404\)|\(NoSuchBucket\)' "$RUNNER_TEMP/platform-bucket-error.txt"; then
    echo 'State bucket is unavailable; use an explicitly requested platform plan to bootstrap a confirmed absent bucket.' >&2
    exit 1
  fi
  if [[ "$AWS_REGION" == us-east-1 ]]; then
    aws s3api create-bucket --bucket "$bucket" --region "$AWS_REGION"
  else
    aws s3api create-bucket --bucket "$bucket" --region "$AWS_REGION" --create-bucket-configuration "LocationConstraint=$AWS_REGION"
  fi
  created=true
fi

# Plan may bootstrap the state bucket before Terraform has a backend.
# Apply only reads and verifies the bucket prepared during the reviewed plan.
if [[ "$OPERATION" == plan && "$bootstrap" == true ]]; then
  if [[ "$created" == true ]]; then
    aws s3api put-bucket-encryption --bucket "$bucket" --expected-bucket-owner "$account" \
      --server-side-encryption-configuration '{"Rules":[{"ApplyServerSideEncryptionByDefault":{"SSEAlgorithm":"AES256"}}]}'
  fi
  aws s3api put-bucket-versioning --bucket "$bucket" --expected-bucket-owner "$account" --versioning-configuration Status=Enabled
  aws s3api put-public-access-block --bucket "$bucket" --expected-bucket-owner "$account" \
    --public-access-block-configuration BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true
fi
aws s3api get-bucket-encryption --bucket "$bucket" --expected-bucket-owner "$account" --output json |
  jq -e '.ServerSideEncryptionConfiguration.Rules | any(.ApplyServerSideEncryptionByDefault.SSEAlgorithm == "AES256" or .ApplyServerSideEncryptionByDefault.SSEAlgorithm == "aws:kms")' >/dev/null
aws s3api get-bucket-versioning --bucket "$bucket" --expected-bucket-owner "$account" --output json |
  jq -e '.Status == "Enabled"' >/dev/null
aws s3api get-public-access-block --bucket "$bucket" --expected-bucket-owner "$account" --output json |
  jq -e '.PublicAccessBlockConfiguration | .BlockPublicAcls and .IgnorePublicAcls and .BlockPublicPolicy and .RestrictPublicBuckets' >/dev/null
printf 'bucket=%s\n' "$bucket" >> "$GITHUB_OUTPUT"
