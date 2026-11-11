import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, rm, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { configureDatadogSecret } from './configure-datadog-secret.mjs';

const apiKey = 'a'.repeat(32);
const appKey = 'b'.repeat(40);
const secretArn = 'arn:aws:secretsmanager:us-east-1:810704675829:secret:oficina/datadog-Ab1234';
const missing = () => Object.assign(new Error('private credential detail'), { stderr: 'An error occurred (ResourceNotFoundException) when calling DescribeSecret' });

async function fixture(t, options = {}) {
  const root = await mkdtemp(join(tmpdir(), 'oficina-dd-test-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const env = { GITHUB_ACTIONS: 'true', AWS_REGION: 'us-east-1', EXPECTED_AWS_ACCOUNT_ID: '810704675829', DATADOG_SECRET_ID: 'oficina/datadog', DD_SITE: 'datadoghq.com', DATADOG_API_KEY: apiKey, DATADOG_APP_KEY: appKey, RUNNER_TEMP: root, ...options.env };
  const calls = [];
  const masks = [];
  const requests = [];
  let payload;
  let mode;
  const runAws = async args => {
    calls.push(args);
    const operation = args[4];
    if (operation === 'get-caller-identity') return JSON.stringify({ Account: options.account || '810704675829' });
    if (operation === 'describe-secret') {
      if (!options.metadata) throw missing();
      return JSON.stringify(options.metadata);
    }
    if (operation === 'get-secret-value') return JSON.stringify(options.current);
    if (['create-secret', 'put-secret-value'].includes(operation)) {
      const file = args[args.indexOf('--secret-string') + 1].slice('file://'.length);
      payload = JSON.parse(await readFile(file, 'utf8'));
      mode = (await stat(file)).mode & 0o777;
      if (options.writeFails) throw Object.assign(new Error('secret ' + apiKey), { stderr: 'AccessDenied ' + appKey });
      return JSON.stringify({ ARN: secretArn });
    }
    throw new Error('Unexpected AWS operation');
  };
  const request = async (url, init) => {
    requests.push({ url, init });
    if (options.requestFails) throw new Error(apiKey + appKey);
    return { status: options.httpStatus || 200, url, redirected: options.redirected || false, json: async () => ({ status: options.validationStatus || 'ok' }) };
  };
  return { env, calls, requests, masks, root, run: () => configureDatadogSecret({ env, runAws, request, mask: value => masks.push(value) }), payload: () => payload, mode: () => mode, writes: () => calls.filter(args => ['create-secret', 'put-secret-value'].includes(args[4])) };
}

test('creates one atomic pair after account and official GET validation; cleans private file', async t => {
  const f = await fixture(t);
  const result = await f.run();
  assert.equal(result.changed, true);
  assert.deepEqual(f.payload(), { api_key: apiKey, app_key: appKey });
  assert.equal(f.writes().length, 1);
  assert.equal(f.writes()[0][4], 'create-secret');
  assert.equal(f.requests[0].url, 'https://api.datadoghq.com/api/v2/validate_keys');
  assert.equal(f.requests[0].init.method, 'GET');
  assert.equal(f.requests[0].init.redirect, 'error');
  assert.equal(f.requests[0].init.headers['DD-API-KEY'], apiKey);
  assert.equal(f.requests[0].init.headers['DD-APPLICATION-KEY'], appKey);
  assert.deepEqual(f.masks, [apiKey, appKey]);
  assert.equal(JSON.stringify(result).includes(apiKey), false);
  assert.equal(JSON.stringify(result).includes(appKey), false);
  assert.equal(f.calls.some(args => args.includes(apiKey) || args.includes(appKey)), false);
  assert.deepEqual(await readdir(f.root), []);
  if (process.platform !== 'win32') assert.equal(f.mode(), 0o600);
});

test('preserves existing identical validated pair without redundant secret versions', async t => {
  const f = await fixture(t, { metadata: { ARN: secretArn, Name: 'oficina/datadog', VersionIdsToStages: { version: ['AWSCURRENT'] } }, current: { api_key: apiKey, app_key: appKey } });
  assert.equal((await f.run()).changed, false);
  assert.equal(f.writes().length, 0);
  assert.equal(f.requests.length, 1);
});

test('accepts current ddapp prefix and base62 format without assuming forty hex digits', async t => {
  const modernAppKey = 'ddapp_' + 'aB9Zx2'.repeat(12);
  const f = await fixture(t, { env: { DATADOG_APP_KEY: modernAppKey } });
  await f.run();
  assert.equal(f.payload().app_key, modernAppKey);
  assert.equal(f.requests[0].init.headers['DD-APPLICATION-KEY'], modernAppKey);
});

test('initializes existing metadata without current version using put, not create', async t => {
  const f = await fixture(t, { metadata: { ARN: secretArn, Name: 'oficina/datadog', VersionIdsToStages: {} } });
  await f.run();
  assert.equal(f.writes()[0][4], 'put-secret-value');
});

test('wrong AWS account aborts before DD requests or any secret mutation', async t => {
  const f = await fixture(t, { account: '000000000000' });
  await assert.rejects(f.run(), /AWS_ACCOUNT_MISMATCH/);
  assert.equal(f.writes().length, 0);
  assert.equal(f.requests.length, 0);
});

test('wrong secret owner or name is rejected without write', async t => {
  const f = await fixture(t, { metadata: { ARN: secretArn.replace('810704675829', '000000000000'), Name: 'oficina/datadog' } });
  await assert.rejects(f.run(), /AWS_SECRET_SCOPE_OR_DELETION_MISMATCH/);
  assert.equal(f.writes().length, 0);
});

test('existing differing keys require separate rotation review', async t => {
  const f = await fixture(t, { metadata: { ARN: secretArn, Name: 'oficina/datadog', VersionIdsToStages: { version: ['AWSCURRENT'] } }, current: { api_key: 'c'.repeat(32), app_key: appKey } });
  await assert.rejects(f.run(), /DATADOG_ROTATION_REQUIRES_REVIEW/);
  assert.equal(f.writes().length, 0);
});

for (const options of [{ httpStatus: 403 }, { validationStatus: 'invalid' }, { redirected: true }, { requestFails: true }]) {
  test(`invalid official validation ${JSON.stringify(options)} never writes secrets`, async t => {
    const f = await fixture(t, options);
    await assert.rejects(f.run(), error => error.message === 'DATADOG_KEY_PAIR_VALIDATION_FAILED' && !error.message.includes(apiKey));
    assert.equal(f.writes().length, 0);
  });
}

test('AWS write error is sanitized and private credentials removed', async t => {
  const f = await fixture(t, { writeFails: true });
  await assert.rejects(f.run(), error => error.message === 'AWS_SECRET_WRITE_FAILED' && !error.message.includes(apiKey) && !error.message.includes(appKey));
  assert.deepEqual(await readdir(f.root), []);
});

for (const env of [{ GITHUB_ACTIONS: 'false' }, { DATADOG_SECRET_ID: 'unrelated/secret' }, { DD_SITE: 'attacker.example' }, { DATADOG_API_KEY: '' }, { DATADOG_APP_KEY: appKey + '\n' }]) {
  test(`invalid execution scope or key pair ${Object.keys(env)[0]} performs no CLI or HTTP`, async t => {
    const f = await fixture(t, { env });
    await assert.rejects(f.run());
    assert.equal(f.calls.length, 0);
    assert.equal(f.requests.length, 0);
  });
}

test('Helm and loader keep credential values outside Terraform variables/state', async () => {
  const helm = await readFile(new URL('../aws/helm.tf', import.meta.url), 'utf8');
  const loader = await readFile(new URL('./load-datadog.sh', import.meta.url), 'utf8');
  assert.match(helm, /apiKeyExistingSecret\s*=\s*"datadog-credentials"/);
  assert.match(helm, /appKeyExistingSecret\s*=\s*"datadog-credentials"/);
  assert.doesNotMatch(helm, /set_sensitive|var\.datadog_(api|app)_key/);
  assert.doesNotMatch(loader, /TF_VAR_datadog_(api|app)_key/);
});
