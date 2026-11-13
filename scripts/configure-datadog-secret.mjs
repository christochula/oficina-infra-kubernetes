import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { appendFile, chmod, mkdtemp, rm, stat, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import process from 'node:process';

export class DatadogConfigurationError extends Error {
  constructor(code) { super(code); this.code = code; }
}
const fail = code => { throw new DatadogConfigurationError(code); };
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const key = value => typeof value === 'string' && /^[A-Za-z0-9._-]{16,512}$/.test(value);
const json = text => { try { const value = JSON.parse(text); if (!object(value)) fail('INVALID_AWS_JSON'); return value; } catch { fail('INVALID_AWS_JSON'); } };

export async function configureDatadogSecret({ env, runAws, request = fetch, mask = () => {} }) {
  if (env?.GITHUB_ACTIONS !== 'true' || typeof runAws !== 'function') fail('ACTIONS_ONLY');
  if (env.AWS_REGION !== 'us-east-1' || !/^\d{12}$/.test(env.EXPECTED_AWS_ACCOUNT_ID ?? '')) fail('INVALID_ACCOUNT_REGION_SCOPE');
  if (env.DATADOG_SECRET_ID !== 'oficina/datadog') fail('INVALID_SECRET_SCOPE');
  if ((env.DD_SITE || 'datadoghq.com') !== 'datadoghq.com') fail('ONLY_REVIEWED_US1_SITE_ALLOWED');
  if (!key(env.DATADOG_API_KEY) || !key(env.DATADOG_APP_KEY)) fail('DATADOG_KEY_PAIR_REQUIRED');
  const tempRoot = resolve(env.RUNNER_TEMP || '');
  if (!env.RUNNER_TEMP || !(await stat(tempRoot).catch(() => null))?.isDirectory()) fail('RUNNER_TEMP_REQUIRED');
  mask(env.DATADOG_API_KEY);
  mask(env.DATADOG_APP_KEY);
  const common = ['--region', env.AWS_REGION, '--no-cli-pager'];
  async function aws(args, code) {
    try { return await runAws([...common, ...args]); }
    catch (error) {
      if (/\(ResourceNotFoundException\)/.test(String(error?.stderr ?? ''))) throw error;
      fail(code);
    }
  }
  let identity;
  try { identity = json(await aws(['sts', 'get-caller-identity', '--output', 'json'], 'AWS_IDENTITY_READ_FAILED')); }
  catch { fail('AWS_IDENTITY_READ_FAILED'); }
  if (identity.Account !== env.EXPECTED_AWS_ACCOUNT_ID) fail('AWS_ACCOUNT_MISMATCH');
  const expectedArnPrefix = `arn:aws:secretsmanager:us-east-1:${identity.Account}:secret:oficina/datadog-`;
  const validArn = arn => typeof arn === 'string' && arn.startsWith(expectedArnPrefix) && /^[A-Za-z0-9]{6}$/.test(arn.slice(expectedArnPrefix.length));
  let metadata;
  try { metadata = json(await aws(['secretsmanager', 'describe-secret', '--secret-id', env.DATADOG_SECRET_ID, '--output', 'json'], 'AWS_SECRET_READ_FAILED')); }
  catch (error) { if (!/\(ResourceNotFoundException\)/.test(String(error?.stderr ?? ''))) throw error; }
  if (metadata && (!validArn(metadata.ARN) || metadata.Name !== env.DATADOG_SECRET_ID || metadata.DeletedDate)) fail('AWS_SECRET_SCOPE_OR_DELETION_MISMATCH');
  let current;
  if (metadata) {
    if (!object(metadata.VersionIdsToStages ?? {})) fail('INVALID_AWS_METADATA');
    const versions = Object.values(metadata.VersionIdsToStages ?? {});
    if (versions.some(stages => Array.isArray(stages) && stages.includes('AWSCURRENT'))) {
      try { current = json(await aws(['secretsmanager', 'get-secret-value', '--secret-id', env.DATADOG_SECRET_ID, '--version-stage', 'AWSCURRENT', '--query', 'SecretString', '--output', 'text'], 'AWS_SECRET_READ_FAILED')); }
      catch { fail('AWS_SECRET_READ_FAILED'); }
      if (!key(current.api_key) || !key(current.app_key)) fail('INVALID_STORED_DATADOG_PAIR');
      if (current.api_key !== env.DATADOG_API_KEY || current.app_key !== env.DATADOG_APP_KEY) fail('DATADOG_ROTATION_REQUIRES_REVIEW');
    } else if (versions.length > 0) fail('SECRET_CURRENT_VERSION_MISSING');
  }
  const validationUrl = 'https://api.datadoghq.com/api/v2/validate_keys';
  let response;
  try {
    response = await request(validationUrl, { method: 'GET', redirect: 'error', signal: AbortSignal.timeout(15000), headers: { Accept: 'application/json', 'DD-API-KEY': env.DATADOG_API_KEY, 'DD-APPLICATION-KEY': env.DATADOG_APP_KEY } });
    if (response.status !== 200 || response.redirected || response.url !== validationUrl || (await response.json())?.status !== 'ok') fail('DATADOG_KEY_PAIR_VALIDATION_FAILED');
  } catch { fail('DATADOG_KEY_PAIR_VALIDATION_FAILED'); }
  let privateRoot;
  let arn = metadata?.ARN;
  try {
    if (!current) {
      privateRoot = await mkdtemp(join(tempRoot, 'oficina-datadog-'));
      await chmod(privateRoot, 0o700);
      const file = join(privateRoot, 'credentials.json');
      await writeFile(file, JSON.stringify({ api_key: env.DATADOG_API_KEY, app_key: env.DATADOG_APP_KEY }), { mode: 0o600, flag: 'wx' });
      const operation = metadata ? ['put-secret-value', '--secret-id', env.DATADOG_SECRET_ID] : ['create-secret', '--name', env.DATADOG_SECRET_ID];
      let saved;
      try { saved = json(await aws(['secretsmanager', ...operation, '--secret-string', `file://${file}`, '--output', 'json'], 'AWS_SECRET_WRITE_FAILED')); }
      catch { fail('AWS_SECRET_WRITE_FAILED'); }
      if (!validArn(saved.ARN)) fail('INVALID_SAVED_SECRET_METADATA');
      arn = saved.ARN;
    }
    if (env.GITHUB_OUTPUT) await appendFile(env.GITHUB_OUTPUT, `datadog_secret_arn=${arn}\ncredentials_validated=true\n`);
    return { component: 'datadog', site: 'datadoghq.com', credentialsValidated: true, changed: !current, secretArn: arn };
  } finally { if (privateRoot) await rm(privateRoot, { recursive: true, force: true }); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    if (process.platform !== 'linux' || process.env.GITHUB_ACTIONS !== 'true') fail('ACTIONS_LINUX_ONLY');
    const execute = promisify(execFile);
    const result = await configureDatadogSecret({ env: process.env, runAws: async args => (await execute('aws', args, { encoding: 'utf8', timeout: 30000, maxBuffer: 1024 * 1024, env: { ...process.env, AWS_PAGER: '', AWS_CLI_AUTO_PROMPT: 'off' } })).stdout, mask: value => process.stdout.write(`::add-mask::${value}\n`) });
    console.log(JSON.stringify(result));
  } catch (error) { console.error(error instanceof DatadogConfigurationError ? error.code : 'DATADOG_CONFIGURATION_FAILED'); process.exitCode = 1; }
}
