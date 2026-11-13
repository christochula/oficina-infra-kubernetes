import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { pathToFileURL } from 'node:url';
import process from 'node:process';

const allowed = new Set(['coredns', 'kube-proxy', 'vpc-cni']);
const fail = code => { throw new Error(code); };
export function parseAddonVersions(text = '{}') {
  let value;
  try { value = JSON.parse(text); } catch { fail('INVALID_ADDON_VERSIONS_JSON'); }
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail('INVALID_ADDON_VERSIONS_MAP');
  for (const [name, version] of Object.entries(value)) if (!allowed.has(name) || typeof version !== 'string' || !/^v\d+\.\d+\.\d+-eksbuild\.\d+$/.test(version)) fail('INVALID_ADDON_NAME_OR_VERSION');
  return value;
}
export async function validateAddonVersions({ env, runAws }) {
  if (env?.GITHUB_ACTIONS !== 'true' || typeof runAws !== 'function') fail('ACTIONS_ONLY');
  if (!/^1\.\d+$/.test(env.KUBERNETES_VERSION ?? '') || env.AWS_REGION !== 'us-east-1') fail('INVALID_ADDON_PLATFORM_SCOPE');
  for (const name of ['MANAGE_METRIC_TAG_CONFIGURATION', 'ENABLE_DISTRIBUTION_PERCENTILES']) if (!['true', 'false'].includes(env[name] || 'false')) fail('INVALID_METRIC_TAG_CONFIGURATION_FLAG');
  const versions = parseAddonVersions(env.ADDON_VERSIONS_JSON || '{}');
  for (const [name, version] of Object.entries(versions)) {
    let result;
    try { result = JSON.parse(await runAws(['eks', 'describe-addon-versions', '--addon-name', name, '--kubernetes-version', env.KUBERNETES_VERSION, '--region', env.AWS_REGION, '--no-cli-pager', '--output', 'json'])); }
    catch { fail('ADDON_COMPATIBILITY_READ_FAILED'); }
    const compatible = result.addons?.filter(addon => addon.addonName === name).flatMap(addon => addon.addonVersions || []).some(candidate => candidate.addonVersion === version && candidate.compatibilities?.some(item => item.clusterVersion === env.KUBERNETES_VERSION));
    if (!compatible) fail('PINNED_ADDON_VERSION_NOT_COMPATIBLE');
  }
  return { kubernetesVersion: env.KUBERNETES_VERSION, compatibleOverrides: versions };
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const execute = promisify(execFile);
    const result = await validateAddonVersions({ env: process.env, runAws: async args => (await execute('aws', args, { encoding: 'utf8', timeout: 60000, maxBuffer: 8 * 1024 * 1024, env: { ...process.env, AWS_PAGER: '', AWS_CLI_AUTO_PROMPT: 'off' } })).stdout });
    console.log(JSON.stringify(result));
  } catch (error) { console.error(/^[A-Z_]+$/.test(error?.message ?? '') ? error.message : 'ADDON_VERSION_VALIDATION_FAILED'); process.exitCode = 1; }
}
