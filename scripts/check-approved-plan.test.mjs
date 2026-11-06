/* global URL */
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import assert from 'node:assert/strict';
const code = await readFile(new URL('./check-approved-plan.mjs', import.meta.url), 'utf8');
const runGate = new (Object.getPrototypeOf(async function () {}).constructor)('process', 'fetch', 'console', code);
const env = { GH_TOKEN: 'fixture-never-used-on-network', GH_REPO: 'owner/repo', TARGET_SHA: 'a'.repeat(40), TARGET_REF: 'feature/demo', APPROVED_PLAN_RUN_ID: '10', PLAN_WORKFLOW_NAME: 'OS Infrastructure', PLAN_WORKFLOW_FILE: 'infra-phase4.yml', PLAN_TITLE_PREFIX: 'OS Infrastructure', PLAN_TAG_PREFIX: 'phase4/os-plan-', PLAN_ARTIFACT_PREFIX: 'os-plan' };
const plan = { status: 'completed', conclusion: 'success', head_sha: env.TARGET_SHA, head_repository: { full_name: env.GH_REPO }, head_branch: env.TARGET_REF, event: 'workflow_dispatch', path: '.github/workflows/infra-phase4.yml', name: 'OS Infrastructure', display_title: `OS Infrastructure plan @${env.TARGET_SHA}` };
const artifact = { name: `os-plan-${env.TARGET_SHA}-10`, expired: false };
const execute = (candidate = plan, artifacts = [artifact], variables = env) => runGate({ env: variables }, async url => ({ ok: true, json: async () => url.includes('/artifacts?') ? { artifacts } : candidate }), { log() {} });

test('accepts exact reviewed plan runs from branch dispatch or a plan tag', async () => {
  await execute();
  await execute({ ...plan, event: 'push', head_branch: 'phase4/os-plan-reviewed-1' });
});

test('rejects other workflows, apply operations, refs, repos, SHAs and unsuccessful runs', async () => {
  for (const changed of [{ name: 'Other' }, { path: '.github/workflows/deploy.yml' }, { display_title: `OS Infrastructure apply @${env.TARGET_SHA}` }, { event: 'push', head_branch: 'phase4/os-apply-1' }, { head_branch: 'other' }, { head_repository: { full_name: 'fork/repo' } }, { head_sha: 'b'.repeat(40) }, { status: 'in_progress' }, { conclusion: 'failure' }]) await assert.rejects(execute({ ...plan, ...changed }), /successful plan/);
});

test('rejects missing, expired or incorrectly named artifacts and invalid approval IDs', async () => {
  for (const values of [[], [{ ...artifact, expired: true }], [{ ...artifact, name: 'terraform.tfstate' }]]) await assert.rejects(execute(plan, values), /redacted text artifact/);
  for (const id of ['', '0', '../10', '9007199254740993']) await assert.rejects(execute(plan, [artifact], { ...env, APPROVED_PLAN_RUN_ID: id }), /Configure the reviewed/);
});

test('fails closed when the approved run cannot be read', async () => {
  await assert.rejects(runGate({ env }, async () => ({ ok: false, status: 403 }), { log() {} }), /HTTP 403/);
});
