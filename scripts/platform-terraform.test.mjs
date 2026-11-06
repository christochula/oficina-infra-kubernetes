import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, writeFile, readFile, readdir, cp, rm } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { join, delimiter, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = fileURLToPath(new URL('../', import.meta.url));
const bash = process.platform === 'win32' ? 'C:/Program Files/Git/bin/bash.exe' : 'bash';
const shellPath = value => process.platform === 'win32' ? value.replaceAll('\\', '/').replace(/^([A-Za-z]):/, (_, drive) => `/${drive.toLowerCase()}`) : value;
const basePlan = { format_version: '1.2', resource_changes: [{ address: 'aws_eks_cluster.this', change: { actions: ['create'], before: null, after: { role_arn: 'arn:aws:iam::111111111111:role/fixture-cluster' }, after_unknown: { endpoint: true } } }] };

test('platform plans remain local and apply requires identical text, semantic content and scope', async () => {
  const temp = await mkdtemp(join(repo, '.platform-controls-'));
  try {
    const bin = join(temp, 'bin');
    await mkdir(bin);
    await writeFile(join(bin, 'terraform'), `#!/usr/bin/env bash
set -euo pipefail
printf '%s\\n' "$*" >> "$TF_ACTION_LOG"
case " $* " in
  *" show -json "*) cat "$TF_FIXTURE_JSON" ;;
  *" show -no-color "*) cat "$TF_FIXTURE_TEXT" ;;
esac
`, { mode: 0o755 });
    const json = join(temp, 'fixture.json');
    const text = join(temp, 'fixture.txt');
    const log = join(temp, 'commands.log');
    await writeFile(json, JSON.stringify(basePlan));
    await writeFile(text, 'Plan: 1 to add, 0 to change, 0 to destroy.\n');
    const env = {
      ...process.env, PATH: bin + delimiter + process.env.PATH,
      OPERATION: 'plan', STATE_BUCKET: 'fixture-state', AWS_REGION: 'us-east-1', RUNNER_TEMP: shellPath(temp),
      TARGET_SHA: 'a'.repeat(40), TARGET_REF: 'feature/demo', GH_REPO: 'owner/repo', GITHUB_RUN_ID: '10',
      GITHUB_STEP_SUMMARY: shellPath(join(temp, 'summary.md')), TF_VAR_kubernetes_version: '1.35', TF_VAR_datadog_enabled: 'false',
      TF_FIXTURE_JSON: shellPath(json), TF_FIXTURE_TEXT: shellPath(text), TF_ACTION_LOG: shellPath(log),
    };
    const execute = overrides => spawnSync(bash, ['scripts/platform-terraform.sh'], { cwd: repo, env: { ...env, ...overrides }, encoding: 'utf8' });
    let result = execute({});
    assert.equal(result.status, 0, result.stderr);
    assert.equal((await readFile(log, 'utf8')).includes(' apply '), false);
    assert.deepEqual((await readdir(join(temp, 'platform-current'))).sort(), ['aws-plan.txt', 'aws-review.json', 'scope.json']);
    await cp(join(temp, 'platform-current'), join(temp, 'platform-approved'), { recursive: true });
    result = execute({ OPERATION: 'apply', GITHUB_RUN_ID: '11' });
    assert.equal(result.status, 0, result.stderr);
    assert.equal((await readFile(log, 'utf8')).split('\n').filter(line => line.includes(' apply ')).length, 1);

    const assertBlocked = async (overrides = {}) => {
      await writeFile(log, '');
      const result = execute({ OPERATION: 'apply', GITHUB_RUN_ID: '12', ...overrides });
      assert.notEqual(result.status, 0, result.stdout);
      assert.equal((await readFile(log, 'utf8')).includes(' apply '), false, 'no stack may apply after a failed review comparison');
    };
    const drift = structuredClone(basePlan);
    drift.resource_changes[0].change.after.role_arn = 'arn:aws:iam::111111111111:role/changed';
    await writeFile(json, JSON.stringify(drift));
    await assertBlocked();
    await writeFile(json, JSON.stringify(basePlan));
    await writeFile(text, 'Different text, same semantic JSON.\n');
    await assertBlocked();
    await writeFile(text, 'Plan: 1 to add, 0 to change, 0 to destroy.\n');
    await assertBlocked({ TF_VAR_datadog_enabled: 'true' });
    const destructive = structuredClone(basePlan);
    destructive.resource_changes[0].change.actions = ['delete', 'create'];
    await writeFile(json, JSON.stringify(destructive));
    await assertBlocked();
  } finally {
    assert.ok(resolve(temp).startsWith(resolve(join(repo, '.platform-controls-'))));
    await rm(temp, { recursive: true, force: true });
  }
});

test('PR/apply cannot bootstrap a missing state bucket; wrong account and access denial fail closed', async () => {
  const temp = await mkdtemp(join(repo, '.platform-controls-'));
  try {
    const bin = join(temp, 'bin');
    await mkdir(bin);
    const log = join(temp, 'aws.log');
    await writeFile(join(bin, 'aws'), `#!/usr/bin/env bash
set -euo pipefail
printf '%s\\n' "$*" >> "$FAKE_AWS_LOG"
case "$1 $2" in
  "sts get-caller-identity") printf '%s\\n' "$FAKE_ACCOUNT" ;;
  "s3api head-bucket") printf 'An error occurred (%s) when calling HeadBucket\\n' "$FAKE_HEAD_STATUS" >&2; exit 254 ;;
  *) echo 'Unexpected AWS command in a non-mutating fixture' >&2; exit 99 ;;
esac
`, { mode: 0o755 });
    const env = { ...process.env, PATH: bin + delimiter + process.env.PATH,
      AWS_REGION: 'us-east-1', EXPECTED_AWS_ACCOUNT_ID: '111111111111', FAKE_ACCOUNT: '111111111111',
      RUNNER_TEMP: shellPath(temp), GITHUB_OUTPUT: shellPath(join(temp, 'outputs')),
      FAKE_AWS_LOG: shellPath(log), FAKE_HEAD_STATUS: '404',
    };
    const cases = [
      { OPERATION: 'plan', ALLOW_STATE_BOOTSTRAP: 'false' },
      { OPERATION: 'apply', ALLOW_STATE_BOOTSTRAP: 'true' },
      { OPERATION: 'plan', ALLOW_STATE_BOOTSTRAP: 'true', FAKE_HEAD_STATUS: '403' },
      { OPERATION: 'plan', ALLOW_STATE_BOOTSTRAP: 'true', FAKE_ACCOUNT: '222222222222' },
    ];
    for (const variables of cases) {
      await writeFile(log, '');
      const result = spawnSync(bash, ['scripts/bootstrap-state-bucket.sh'], { cwd: repo, env: { ...env, ...variables }, encoding: 'utf8' });
      assert.notEqual(result.status, 0, result.stdout);
      const commands = (await readFile(log, 'utf8')).trim().split('\n');
      assert.ok(commands.every(command => command.startsWith('sts get-caller-identity') || command.startsWith('s3api head-bucket')), commands.join('\n'));
      assert.equal(commands.length, variables.FAKE_ACCOUNT ? 1 : 2);
    }
  } finally {
    assert.ok(resolve(temp).startsWith(resolve(join(repo, '.platform-controls-'))));
    await rm(temp, { recursive: true, force: true });
  }
});
