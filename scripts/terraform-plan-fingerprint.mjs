import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import process from 'node:process';

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value !== null && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])]));
  return value;
}

export function fingerprintPlan(plan, metadata) {
  if (!plan || typeof plan.format_version !== 'string' || plan.resource_changes !== undefined && !Array.isArray(plan.resource_changes)) throw new Error('Invalid Terraform plan structure');
  if (!/^[\w.-]+\/[\w.-]+$/.test(metadata.repository ?? '') || !/^[a-f0-9]{40}$/.test(metadata.target_sha ?? '') || !/^[\w][\w./-]{0,199}$/.test(metadata.target_ref ?? '') || !/^[\w.-]+\.ya?ml$/.test(metadata.workflow ?? '') || !['plan', 'apply'].includes(metadata.operation) || !/^[1-9]\d*$/.test(metadata.run_id ?? '') || !/^[\w.-]+$/.test(metadata.scope ?? '')) throw new Error('Invalid public plan review metadata');
  const resources = (plan.resource_changes ?? []).map(resource => {
    if (!Array.isArray(resource.change?.actions) || resource.change.actions.includes('delete')) throw new Error('Resource deletion or replacement is forbidden');
    return Object.fromEntries(['address', 'previous_address', 'module_address', 'mode', 'type', 'name', 'index', 'provider_name', 'deposed', 'change'].filter(key => resource[key] !== undefined).map(key => [key, resource[key]]));
  }).sort((a, b) => `${a.address}:${a.deposed ?? ''}`.localeCompare(`${b.address}:${b.deposed ?? ''}`));
  // Hash actual before/after values, including sensitive attributes. None are emitted.
  // Top-level plan timestamps, checks and UI rendering are intentionally excluded.
  const semantic = canonical({ format_version: plan.format_version, resource_changes: resources, output_changes: plan.output_changes ?? {} });
  const publicMetadata = Object.fromEntries(['repository', 'target_sha', 'target_ref', 'workflow', 'operation', 'run_id', 'scope'].map(key => [key, String(metadata[key])]));
  return { schema_version: 1, ...publicMetadata, sha256: createHash('sha256').update(JSON.stringify(semantic)).digest('hex') };
}

export function compareReviews(approved, current) {
  if (approved?.schema_version !== 1 || current?.schema_version !== 1 || approved.operation !== 'plan' || current.operation !== 'apply' || !/^[a-f0-9]{64}$/.test(approved.sha256 ?? '') || approved.sha256 !== current.sha256 || ['repository', 'target_sha', 'target_ref', 'workflow', 'scope'].some(key => !approved[key] || approved[key] !== current[key])) throw new Error('Plan fingerprint or reviewed source changed; request a new plan review');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    if (process.argv[2] === '--compare' && process.argv.length === 5) {
      compareReviews(JSON.parse(readFileSync(process.argv[3], 'utf8')), JSON.parse(readFileSync(process.argv[4], 'utf8')));
      process.stdout.write('Reviewed plan fingerprint matches.\n');
    } else if (process.argv.length === 2) {
      const metadata = { repository: process.env.GH_REPO ?? process.env.GITHUB_REPOSITORY, target_sha: process.env.TARGET_SHA, target_ref: process.env.TARGET_REF, workflow: process.env.PLAN_WORKFLOW_FILE, operation: process.env.PLAN_OPERATION, run_id: process.env.GITHUB_RUN_ID, scope: process.env.PLAN_SCOPE ?? 'default' };
      process.stdout.write(JSON.stringify(fingerprintPlan(JSON.parse(readFileSync(0, 'utf8')), metadata)) + '\n');
    } else throw new Error('Invalid plan fingerprint arguments');
  } catch {
    process.stderr.write('Plan fingerprint validation failed; raw Terraform values are omitted.\n');
    process.exitCode = 1;
  }
}
