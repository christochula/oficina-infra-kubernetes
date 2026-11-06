import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { appendFile } from 'node:fs/promises';
import { isAbsolute, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import process from 'node:process';

export const SCOPE = Object.freeze({ account: '810704675829', region: 'us-east-1', cluster: 'oficina-homolog-eks', nodegroup: 'oficina-homolog-ng', context: 'oficina-homolog-eks-recovery', confirmation: 'RECOVER_EMPTY_OFICINA_NODES' });
export const PREFERENCES = Object.freeze({ MinHealthyPercentage: 50, MaxHealthyPercentage: 100, InstanceWarmup: 120, SkipMatching: false, AutoRollback: false });
const active = new Set(['Pending', 'InProgress', 'Cancelling', 'RollbackInProgress', 'Baking']);
const terminal = new Set(['Successful', 'Failed', 'Cancelled', 'RollbackFailed', 'RollbackSuccessful']);
const systemNamespaces = new Set(['kube-system', 'kube-public', 'kube-node-lease']);
export class RecoveryError extends Error { constructor(code) { super(code); this.code = code; } }
const fail = code => { throw new RecoveryError(code); };
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const escape = value => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export function validateRequest(env) {
  if (env.GITHUB_ACTIONS !== 'true') fail('ACTIONS_ONLY');
  if (env.AWS_REGION !== SCOPE.region || env.EXPECTED_AWS_ACCOUNT_ID !== SCOPE.account) fail('INVALID_FIXED_ACCOUNT_OR_REGION');
  if (env.CONFIRM_NODE_RECOVERY !== SCOPE.confirmation) fail('EXPLICIT_CONFIRMATION_REQUIRED');
  if (!new RegExp(`^arn:aws:iam::${SCOPE.account}:role/[A-Za-z0-9+=,.@_/-]+$`).test(env.NODE_ROLE_ARN ?? '')) fail('EXPECTED_NODE_ROLE_REQUIRED');
  if (!env.RUNNER_TEMP || !isAbsolute(env.RUNNER_TEMP)) fail('RUNNER_TEMP_REQUIRED');
  return { kubeconfig: join(env.RUNNER_TEMP, 'oficina-node-recovery.kubeconfig') };
}

function executor(env) {
  const execute = promisify(execFile);
  return async (command, args, { timeout = 30000 } = {}) => (await execute(command, args, { env: { ...env, AWS_PAGER: '', AWS_CLI_AUTO_PROMPT: 'off' }, encoding: 'utf8', timeout, maxBuffer: 8 * 1024 * 1024, windowsHide: true })).stdout;
}

export async function recoverEmptyNodes({ env, run, sleep = delay, now = Date.now, timeoutMs = 45 * 60 * 1000, intervalMs = 15000 }) {
  const { kubeconfig } = validateRequest(env);
  if (typeof run !== 'function' || !Number.isFinite(timeoutMs) || timeoutMs <= 0 || !Number.isFinite(intervalMs) || intervalMs <= 0) fail('INVALID_RECOVERY_CONTROLS');
  async function invoke(command, args, options) {
    try { return await run(command, args, options); }
    catch { fail('RECOVERY_CLI_FAILED'); }
  }
  async function json(command, args) {
    const text = await invoke(command, args);
    try { const value = JSON.parse(text); if (!object(value)) fail('INVALID_CLI_JSON'); return value; }
    catch { fail('INVALID_CLI_JSON'); }
  }
  const aws = (...args) => json('aws', ['--region', SCOPE.region, '--no-cli-pager', ...args, '--output', 'json']);
  const kubeArgs = (...args) => ['--kubeconfig', kubeconfig, '--context', SCOPE.context, ...args];
  const kube = (...args) => json('kubectl', kubeArgs(...args, '-o', 'json'));
  const identity = await aws('sts', 'get-caller-identity');
  if (identity.Account !== SCOPE.account) fail('WRONG_CALLER_ACCOUNT');
  const cluster = (await aws('eks', 'describe-cluster', '--name', SCOPE.cluster)).cluster;
  if (!object(cluster) || cluster.name !== SCOPE.cluster || cluster.arn !== `arn:aws:eks:${SCOPE.region}:${SCOPE.account}:cluster/${SCOPE.cluster}` || cluster.status !== 'ACTIVE' || typeof cluster.endpoint !== 'string') fail('CLUSTER_SCOPE_OR_STATUS_INVALID');
  const config = await kube('config', 'view', '--minify');
  if (config['current-context'] !== SCOPE.context || config.clusters?.length !== 1 || config.clusters[0]?.cluster?.server !== cluster.endpoint) fail('KUBERNETES_CONTEXT_MISMATCH');

  async function readOwnedGroup() {
    const group = (await aws('eks', 'describe-nodegroup', '--cluster-name', SCOPE.cluster, '--nodegroup-name', SCOPE.nodegroup)).nodegroup;
    if (!object(group) || group.clusterName !== SCOPE.cluster || group.nodegroupName !== SCOPE.nodegroup || !new RegExp(`^arn:aws:eks:${SCOPE.region}:${SCOPE.account}:nodegroup/${SCOPE.cluster}/${SCOPE.nodegroup}/[a-f0-9-]+$`).test(group.nodegroupArn ?? '') || group.status !== 'ACTIVE') fail('NODEGROUP_SCOPE_OR_STATUS_INVALID');
    if (group.nodeRole !== env.NODE_ROLE_ARN) fail('NODE_ROLE_MISMATCH');
    if (group.scalingConfig?.desiredSize !== 2 || !Number.isInteger(group.scalingConfig?.maxSize) || group.scalingConfig.maxSize < 4) fail('NODEGROUP_CAPACITY_INVALID');
    const groups = group.resources?.autoScalingGroups;
    if (!Array.isArray(groups) || groups.length !== 1 || !/^eks-oficina-homolog-ng-[A-Za-z0-9-]+$/.test(groups[0]?.name ?? '')) fail('NODEGROUP_ASG_OWNERSHIP_INVALID');
    const name = groups[0].name;
    const response = await aws('autoscaling', 'describe-auto-scaling-groups', '--auto-scaling-group-names', name);
    if (!Array.isArray(response.AutoScalingGroups) || response.AutoScalingGroups.length !== 1) fail('ASG_SCOPE_INVALID');
    const asg = response.AutoScalingGroups[0];
    if (asg.AutoScalingGroupName !== name || !new RegExp(`^arn:aws:autoscaling:${SCOPE.region}:${SCOPE.account}:autoScalingGroup:[^:]+:autoScalingGroupName/${escape(name)}$`).test(asg.AutoScalingGroupARN ?? '')) fail('ASG_SCOPE_INVALID');
    if (!Array.isArray(asg.Tags)) fail('ASG_OWNERSHIP_TAGS_INVALID');
    for (const [key, value] of [['eks:cluster-name', SCOPE.cluster], ['eks:nodegroup-name', SCOPE.nodegroup], [`kubernetes.io/cluster/${SCOPE.cluster}`, 'owned']]) {
      const matches = asg.Tags.filter(tag => tag.Key === key);
      if (matches.length !== 1 || matches[0].Value !== value) fail('ASG_OWNERSHIP_TAGS_INVALID');
    }
    if (asg.DesiredCapacity !== 2 || !Number.isInteger(asg.MaxSize) || asg.MaxSize < 4 || (asg.DesiredCapacityType && asg.DesiredCapacityType !== 'units')) fail('ASG_CAPACITY_INVALID');
    if (!Array.isArray(asg.Instances) || asg.Instances.length !== 2 || asg.Instances.some(instance => instance.LifecycleState !== 'InService' || instance.HealthStatus !== 'Healthy' || instance.ProtectedFromScaleIn === true || instance.WeightedCapacity && instance.WeightedCapacity !== '1')) fail('ASG_INSTANCES_NOT_STABLE');
    return name;
  }
  const asgName = await readOwnedGroup();
  async function refreshes(id) {
    const response = await aws('autoscaling', 'describe-instance-refreshes', '--auto-scaling-group-name', asgName, ...(id ? ['--instance-refresh-ids', id] : []));
    if (!Array.isArray(response.InstanceRefreshes)) fail('INVALID_REFRESH_LIST');
    for (const item of response.InstanceRefreshes) if (item.AutoScalingGroupName !== asgName || !active.has(item.Status) && !terminal.has(item.Status)) fail('INVALID_REFRESH_SCOPE_OR_STATUS');
    return response.InstanceRefreshes;
  }
  async function ensureNoActiveRefresh() { if ((await refreshes()).some(item => active.has(item.Status))) fail('REFRESH_ALREADY_ACTIVE'); }
  function ready(node) { return node.metadata?.labels?.['eks.amazonaws.com/nodegroup'] === SCOPE.nodegroup && node.status?.conditions?.some(condition => condition.type === 'Ready' && condition.status === 'True'); }
  async function nodes() {
    const list = await kube('get', 'nodes');
    if (!Array.isArray(list.items)) fail('INVALID_NODE_LIST');
    return list.items;
  }
  async function emptyOrReady() {
    const items = await nodes();
    if (items.length === 0) return false;
    if (items.length === 2 && items.every(ready)) return true;
    fail('PARTIAL_OR_UNEXPECTED_REGISTERED_NODES');
  }
  let pendingApplicationPods = 0;
  async function noActiveOrPersistentApplicationPods() {
    const list = await kube('get', 'pods', '--all-namespaces');
    if (!Array.isArray(list.items)) fail('INVALID_POD_LIST');
    const applications = list.items.filter(pod => !systemNamespaces.has(pod.metadata?.namespace));
    for (const pod of applications) {
      if (typeof pod.metadata?.namespace !== 'string' || !pod.metadata.namespace || !object(pod.spec) || pod.status?.phase !== 'Pending' || pod.spec.nodeName !== undefined && pod.spec.nodeName !== '') fail('ACTIVE_OR_ASSIGNED_APPLICATION_PODS_EXIST');
      const volumes = pod.spec.volumes ?? [];
      if (!Array.isArray(volumes) || volumes.some(volume => !object(volume) || Object.keys(volume).some(key => !['name', 'emptyDir', 'secret', 'configMap', 'projected', 'downwardAPI'].includes(key)))) fail('PERSISTENT_OR_HOST_APPLICATION_VOLUMES_EXIST');
    }
    pendingApplicationPods = applications.length;
  }
  async function verifySystemRollouts() {
    for (const deployment of ['coredns', 'metrics-server']) {
      await invoke('kubectl', kubeArgs('rollout', 'status', `deployment/${deployment}`, '--namespace', 'kube-system', '--timeout=300s'), { timeout: 310000 });
      const current = await kube('get', 'deployment', deployment, '--namespace', 'kube-system');
      const minimum = deployment === 'coredns' ? 2 : 1;
      if (current.metadata?.name !== deployment || current.metadata?.namespace !== 'kube-system' || !Number.isInteger(current.spec?.replicas) || current.spec.replicas < minimum || (current.status?.availableReplicas ?? 0) < current.spec.replicas || (current.status?.updatedReplicas ?? 0) < current.spec.replicas) fail('SYSTEM_DEPLOYMENT_NOT_READY');
    }
    const items = await nodes();
    if (items.some(node => node.metadata?.labels?.['eks.amazonaws.com/nodegroup'] !== SCOPE.nodegroup)) fail('UNEXPECTED_NODEGROUP_AFTER_REFRESH');
    if (items.filter(ready).length < 2) fail('READY_NODES_LOST_AFTER_ROLLOUT');
    return items.filter(ready).length;
  }
  const result = (status, refreshId, readyNodes) => ({ status, account: SCOPE.account, cluster: SCOPE.cluster, nodegroup: SCOPE.nodegroup, asg: asgName, ...(refreshId ? { refreshId } : {}), readyNodes, pendingApplicationPods, systemRollouts: ['coredns', 'metrics-server'] });
  await ensureNoActiveRefresh();
  if (await emptyOrReady()) return result('noop-already-ready', undefined, await verifySystemRollouts());
  await noActiveOrPersistentApplicationPods();
  // Recheck all mutable scope/health guards immediately before the only AWS write.
  if (await readOwnedGroup() !== asgName) fail('ASG_CHANGED_DURING_PREFLIGHT');
  await ensureNoActiveRefresh();
  if (await emptyOrReady()) return result('noop-already-ready', undefined, await verifySystemRollouts());
  await noActiveOrPersistentApplicationPods();
  const started = await aws('autoscaling', 'start-instance-refresh', '--auto-scaling-group-name', asgName, '--strategy', 'Rolling', '--preferences', JSON.stringify(PREFERENCES));
  if (!/^[a-f0-9-]{36}$/.test(started.InstanceRefreshId ?? '')) fail('INVALID_STARTED_REFRESH_ID');
  const refreshId = started.InstanceRefreshId;
  const deadline = now() + timeoutMs;
  for (;;) {
    const matches = (await refreshes(refreshId)).filter(item => item.InstanceRefreshId === refreshId);
    if (matches.length === 0) {
      if (now() >= deadline) fail('STARTED_REFRESH_NOT_FOUND');
      await sleep(intervalMs);
      continue;
    }
    if (matches.length !== 1) fail('DUPLICATE_REFRESH_RESPONSE');
    if (matches[0].Status === 'Successful') break;
    if (!active.has(matches[0].Status)) fail('INSTANCE_REFRESH_UNSUCCESSFUL');
    if (now() >= deadline) fail('INSTANCE_REFRESH_TIMEOUT');
    await sleep(intervalMs);
  }
  for (;;) {
    const items = await nodes();
    if (items.some(node => node.metadata?.labels?.['eks.amazonaws.com/nodegroup'] !== SCOPE.nodegroup)) fail('UNEXPECTED_NODEGROUP_AFTER_REFRESH');
    if (items.filter(ready).length >= 2) break;
    if (now() >= deadline) fail('READY_NODES_TIMEOUT');
    await sleep(intervalMs);
  }
  return result('refreshed', refreshId, await verifySystemRollouts());
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    if (process.platform !== 'linux' || process.env.GITHUB_ACTIONS !== 'true') fail('ACTIONS_LINUX_ONLY');
    if (process.argv[2] === '--validate-request' && process.argv.length === 3) { validateRequest(process.env); process.stdout.write('Guarded node recovery request is valid.\n'); }
    else if (process.argv.length === 2) {
      const output = await recoverEmptyNodes({ env: process.env, run: executor(process.env) });
      process.stdout.write(JSON.stringify(output) + '\n');
      if (process.env.GITHUB_STEP_SUMMARY) await appendFile(process.env.GITHUB_STEP_SUMMARY, `### Empty nodegroup recovery\n- Result: ${output.status}\n- Cluster/nodegroup: ${output.cluster}/${output.nodegroup}\n- ASG: ${output.asg}\n- Ready nodes: ${output.readyNodes}\n- CoreDNS and metrics-server rollouts: verified\n`);
    } else fail('INVALID_ARGUMENTS');
  } catch (error) { process.stderr.write(`Node recovery failed (${error instanceof RecoveryError ? error.code : 'UNEXPECTED_ERROR'}); raw CLI output omitted.\n`); process.exitCode = 1; }
}
