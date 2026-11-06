/* global URL */
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import assert from 'node:assert/strict';
const code = await readFile(new URL('./check-approved-plan.mjs', import.meta.url), 'utf8');
const runGate = new (Object.getPrototypeOf(async function () {}).constructor)('process', 'fetch', 'console', code);
const env = { GH_TOKEN: 'fixture-never-used-on-network', GH_REPO: 'owner/repo', TARGET_SHA: 'a'.repeat(40), TARGET_REF: 'feature/demo', APPROVED_PLAN_RUN_ID: '10', PLAN_WORKFLOW_NAME: 'OS Infrastructure', PLAN_WORKFLOW_FILE: 'infra-phase4.yml', PLAN_TITLE_PREFIX: 'OS Infrastructure', PLAN_TAG_PREFIX: 'phase4/os-plan-', PLAN_ARTIFACT_PREFIX: 'os-plan' };
const plan = { workflow_id: 123, status: 'completed', conclusion: 'success', head_sha: env.TARGET_SHA, head_repository: { full_name: env.GH_REPO }, head_branch: env.TARGET_REF, event: 'workflow_dispatch', path: '.github/workflows/infra-phase4.yml', name: `OS Infrastructure plan @${env.TARGET_SHA}`, display_title: `OS Infrastructure plan @${env.TARGET_SHA}` };
const workflow = { id: 123, name: 'OS Infrastructure', path: '.github/workflows/infra-phase4.yml' };
const artifact = { name: `os-plan-${env.TARGET_SHA}-10`, expired: false };
const execute = (candidate = plan, artifacts = [artifact], variables = env, definition = workflow) => runGate({ env: variables }, async url => ({ ok: true, json: async () => url.includes('/actions/workflows/') ? definition : url.includes('/artifacts?') ? { artifacts } : candidate }), { log() {} });

test('accepts exact reviewed plan runs from branch dispatch or a plan tag', async () => {
  await execute();
  await execute({ ...plan, event: 'push', head_branch: 'phase4/os-plan-reviewed-1' });
});

test('rejects other workflows, apply operations, refs, repos, SHAs and unsuccessful runs', async () => {
  for (const changed of [{ workflow_id: 0 }, { workflow_id: '../123' }, { path: '.github/workflows/deploy.yml' }, { display_title: `OS Infrastructure apply @${env.TARGET_SHA}` }, { event: 'push', head_branch: 'phase4/os-apply-1' }, { head_branch: 'other' }, { head_repository: { full_name: 'fork/repo' } }, { head_sha: 'b'.repeat(40) }, { status: 'in_progress' }, { conclusion: 'failure' }]) await assert.rejects(execute({ ...plan, ...changed }), /successful plan/);
});

test('accepts the real GitHub shape where run.name is the custom title, not the workflow name', async () => {
  const sha = '30f41972ee737710a605a486ca4997d6daa4028c';
  const variables = { ...env, GH_REPO: 'christochula/oficina-infra-kubernetes', TARGET_SHA: sha, TARGET_REF: 'feature/phase4-distributed', APPROVED_PLAN_RUN_ID: '42139322186', PLAN_WORKFLOW_NAME: 'Terraform deploy', PLAN_WORKFLOW_FILE: 'deploy.yml', PLAN_TITLE_PREFIX: 'Platform', PLAN_TAG_PREFIX: 'phase4/platform-plan-', PLAN_ARTIFACT_PREFIX: 'platform-plan' };
  const candidate = { ...plan, head_sha: sha, head_branch: variables.TARGET_REF, head_repository: { full_name: variables.GH_REPO }, path: '.github/workflows/deploy.yml', name: `Platform plan @${sha}`, display_title: `Platform plan @${sha}` };
  const requested = [];
  await runGate({ env: variables }, async url => {
    requested.push(url);
    return { ok: true, json: async () => url.includes('/actions/workflows/') ? { id: 123, name: 'Terraform deploy', path: '.github/workflows/deploy.yml' } : url.includes('/artifacts?') ? { artifacts: [{ name: `platform-plan-${sha}-42139322186`, expired: false }] } : candidate };
  }, { log() {} });
  assert.ok(requested.some(url => url.endsWith('/actions/workflows/123')));
});

test('rejects foreign workflow metadata even when run title, source and artifact are valid', async () => {
  for (const changed of [{ id: 124 }, { name: 'Other workflow' }, { path: '.github/workflows/other.yml' }]) await assert.rejects(execute(plan, [artifact], env, { ...workflow, ...changed }), /workflow metadata/);
  await assert.rejects(execute({ ...plan, workflow_id: 124 }), /workflow metadata/);
});

test('rejects missing, expired or incorrectly named artifacts and invalid approval IDs', async () => {
  for (const values of [[], [{ ...artifact, expired: true }], [{ ...artifact, name: 'terraform.tfstate' }]]) await assert.rejects(execute(plan, values), /redacted text artifact/);
  for (const id of ['', '0', '../10', '9007199254740993']) await assert.rejects(execute(plan, [artifact], { ...env, APPROVED_PLAN_RUN_ID: id }), /Configure the reviewed/);
});

test('fails closed when the approved run cannot be read', async () => {
  await assert.rejects(runGate({ env }, async () => ({ ok: false, status: 403 }), { log() {} }), /HTTP 403/);
});
