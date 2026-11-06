/* global structuredClone */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fingerprintPlan, compareReviews } from './terraform-plan-fingerprint.mjs';
const metadata = { repository: 'owner/repo', target_sha: 'a'.repeat(40), target_ref: 'feature/demo', workflow: 'infra-phase4.yml', operation: 'plan', run_id: '10', scope: 'default' };
const plan = { format_version: '1.2', timestamp: 'first-run', resource_changes: [{ address: 'aws_secretsmanager_secret_version.runtime', type: 'aws_secretsmanager_secret_version', change: { actions: ['create'], before: null, after: { secret_string: 'private-fixture-do-not-emit', name: 'runtime' }, after_sensitive: { secret_string: true }, after_unknown: { id: true } } }], output_changes: { id: { actions: ['create'], after_unknown: true } } };
const review = () => fingerprintPlan(plan, metadata);

test('fingerprint emits only public metadata and hash, never resource or secret values', () => {
  const result = review();
  assert.match(result.sha256, /^[a-f0-9]{64}$/);
  assert.equal(JSON.stringify(result).includes('private-fixture-do-not-emit'), false);
  assert.equal(JSON.stringify(result).includes('secret_string'), false);
  assert.equal('unexpected_secret' in fingerprintPlan(plan, { ...metadata, unexpected_secret: 'must-never-emit' }), false);
});

test('ignores timestamp/object/resource ordering noise but detects sensitive value drift', () => {
  const reordered = { resource_changes: [{ change: { after_unknown: { id: true }, after_sensitive: { secret_string: true }, after: { name: 'runtime', secret_string: 'private-fixture-do-not-emit' }, before: null, actions: ['create'] }, type: 'aws_secretsmanager_secret_version', address: 'aws_secretsmanager_secret_version.runtime' }], format_version: '1.2', timestamp: 'second-run', output_changes: plan.output_changes };
  assert.equal(fingerprintPlan(reordered, metadata).sha256, review().sha256);
  const changed = structuredClone(plan); changed.resource_changes[0].change.after.secret_string = 'different-private-value';
  assert.notEqual(fingerprintPlan(changed, metadata).sha256, review().sha256);
  const multiple = { ...plan, resource_changes: [...plan.resource_changes, { address: 'aws_sqs_queue.commands', change: { actions: ['create'], after: { name: 'commands' } } }] };
  assert.equal(fingerprintPlan(multiple, metadata).sha256, fingerprintPlan({ ...multiple, resource_changes: [...multiple.resource_changes].reverse() }, metadata).sha256);
});

test('blocks deletion/replacement and invalid metadata', () => {
  for (const actions of [['delete'], ['create', 'delete'], ['delete', 'create']]) {
    const changed = structuredClone(plan); changed.resource_changes[0].change.actions = actions;
    assert.throws(() => fingerprintPlan(changed, metadata), /forbidden/);
  }
  assert.throws(() => fingerprintPlan(plan, { ...metadata, target_sha: 'main' }), /metadata/);
});

test('requires identical semantic hash, source, workflow and scope across reviewed plan/apply', () => {
  const approved = review(); const current = { ...approved, operation: 'apply', run_id: '11' };
  compareReviews(approved, current);
  for (const changed of [{ sha256: 'b'.repeat(64) }, { target_sha: 'b'.repeat(40) }, { target_ref: 'other' }, { workflow: 'deploy.yml' }, { scope: 'observability' }, { operation: 'plan' }]) assert.throws(() => compareReviews(approved, { ...current, ...changed }), /changed/);
});
