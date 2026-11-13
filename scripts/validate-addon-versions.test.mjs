import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { parseAddonVersions, validateAddonVersions } from './validate-addon-versions.mjs';
const pins = { coredns: 'v1.14.7-eksbuild.28', 'kube-proxy': 'v1.35.3-eksbuild.64', 'vpc-cni': 'v1.23.2-eksbuild.8' };
const env = { GITHUB_ACTIONS: 'true', AWS_REGION: 'us-east-1', KUBERNETES_VERSION: '1.35', ADDON_VERSIONS_JSON: JSON.stringify(pins), MANAGE_METRIC_TAG_CONFIGURATION: 'false' };

test('accepts only reviewed addon map keys and version syntax; empty map preserves initial provisioning fallback', () => {
  assert.deepEqual(parseAddonVersions('{}'), {});
  assert.deepEqual(parseAddonVersions(JSON.stringify(pins)), pins);
  for (const value of ['[]', 'null', '{', '{"other":"v1.0.0-eksbuild.1"}', '{"coredns":"latest"}', '{"coredns":null}']) assert.throws(() => parseAddonVersions(value));
});
test('validates all pinned versions using only EKS read requests and actual cluster compatibility', async () => {
  const calls = [];
  const result = await validateAddonVersions({ env, runAws: async args => {
    calls.push(args);
    const name = args[args.indexOf('--addon-name') + 1];
    return JSON.stringify({ addons: [{ addonName: name, addonVersions: [{ addonVersion: pins[name], compatibilities: [{ clusterVersion: '1.35' }] }] }] });
  } });
  assert.deepEqual(result.compatibleOverrides, pins);
  assert.equal(calls.length, 3);
  assert.ok(calls.every(args => args[0] === 'eks' && args[1] === 'describe-addon-versions'));
});
test('rejects installed-looking version not compatible with the selected EKS minor', async () => {
  await assert.rejects(validateAddonVersions({ env, runAws: async () => JSON.stringify({ addons: [{ addonName: 'coredns', addonVersions: [{ addonVersion: pins.coredns, compatibilities: [{ clusterVersion: '1.34' }] }] }] }) }), /PINNED_ADDON_VERSION_NOT_COMPATIBLE/);
});
test('refuses invalid flags or version map before any AWS request', async () => {
  for (const overrides of [{ GITHUB_ACTIONS: 'false' }, { MANAGE_METRIC_TAG_CONFIGURATION: 'yes' }, { ENABLE_DISTRIBUTION_PERCENTILES: 'yes' }, { ADDON_VERSIONS_JSON: '{"bad":"v1.0.0-eksbuild.1"}' }]) {
    let calls = 0;
    await assert.rejects(validateAddonVersions({ env: { ...env, ...overrides }, runAws: async () => { calls++; } }));
    assert.equal(calls, 0);
  }
});
test('AWS compatibility read errors are sanitized', async () => {
  await assert.rejects(validateAddonVersions({ env, runAws: async () => { throw new Error('private-session-detail'); } }), error => error.message === 'ADDON_COMPATIBILITY_READ_FAILED');
});
test('queue dashboard uses custom max gauges per queue, without adding replica samples', async () => {
  const dashboard = await readFile(new URL('../observability/dashboard.tf', import.meta.url), 'utf8');
  assert.doesNotMatch(dashboard, /aws\.sqs\./);
  assert.match(dashboard, /max:oficina\.messaging\.queue\.visible\{env:\$env,role:inbox\} by \{queue\}/);
  assert.match(dashboard, /max:oficina\.messaging\.queue\.visible\{env:\$env,role:dlq\} by \{queue\}/);
  for (const metric of ['inflight', 'delayed']) assert.ok(dashboard.includes(`max:oficina.messaging.queue.${metric}{env:$env} by {queue,role}`));
  assert.doesNotMatch(dashboard, /sum:oficina\.messaging\.queue\./);
});
