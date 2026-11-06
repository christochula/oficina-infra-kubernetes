import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { appendFile } from 'node:fs/promises';
import { isAbsolute, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import process from 'node:process';

export const SCOPE = Object.freeze({ account: '810704675829', region: 'us-east-1', cluster: 'oficina-homolog-eks', nodegroup: 'oficina-homolog-ng', context: 'oficina-homolog-eks-recovery', confirmation: 'REBOOT_EMPTY_OFICINA_NODES' });
const active = new Set(['Pending', 'InProgress', 'Cancelling', 'RollbackInProgress', 'Baking']);
const terminal = new Set(['Successful', 'Failed', 'Cancelled', 'RollbackFailed', 'RollbackSuccessful']);
const systemNamespaces = new Set(['kube-system', 'kube-public', 'kube-node-lease']);
const awsOperations = new Map([
  ['sts:get-caller-identity', 'AWS_STS_GET_CALLER_IDENTITY'], ['eks:describe-cluster', 'AWS_EKS_DESCRIBE_CLUSTER'],
  ['eks:describe-nodegroup', 'AWS_EKS_DESCRIBE_NODEGROUP'], ['autoscaling:describe-auto-scaling-groups', 'AWS_AUTOSCALING_DESCRIBE_GROUPS'],
  ['autoscaling:describe-instance-refreshes', 'AWS_AUTOSCALING_DESCRIBE_REFRESHES'],
  ['ec2:describe-instances', 'AWS_EC2_DESCRIBE_INSTANCES'], ['ec2:reboot-instances', 'AWS_EC2_REBOOT_INSTANCES'],
]);
const kubernetesOperations = new Map([
  ['config:view', 'KUBECTL_CONFIG_VIEW'], ['get:nodes', 'KUBECTL_GET_NODES'], ['get:pods', 'KUBECTL_GET_PODS'],
  ['get:deployment:coredns', 'KUBECTL_GET_DEPLOYMENT_COREDNS'], ['get:deployment:metrics-server', 'KUBECTL_GET_DEPLOYMENT_METRICS_SERVER'],
  ['rollout:status:deployment/coredns', 'KUBECTL_ROLLOUT_STATUS_COREDNS'], ['rollout:status:deployment/metrics-server', 'KUBECTL_ROLLOUT_STATUS_METRICS_SERVER'],
]);
const allowedAwsErrors = new Set(['DryRunOperation', 'AccessDenied', 'AccessDeniedException', 'UnauthorizedOperation', 'ValidationError', 'ValidationException', 'ExpiredToken', 'ExpiredTokenException', 'InvalidClientTokenId', 'UnrecognizedClientException', 'RequestExpired', 'ResourceNotFound', 'ResourceNotFoundException', 'InstanceRefreshInProgress', 'LimitExceeded', 'LimitExceededException', 'Throttling', 'ThrottlingException', 'RequestLimitExceeded', 'ResourceContention', 'ServiceUnavailable', 'InternalError', 'InternalFailure']);
export class RecoveryError extends Error { constructor(code) { super(code); this.code = code; } }
const fail = code => { throw new RecoveryError(code); };
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const escape = value => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const instanceId = value => /^i-(?:[a-f0-9]{8}|[a-f0-9]{17})$/.test(value ?? '');
const same = (left, right) => JSON.stringify(left) === JSON.stringify(right);
function awsErrorClass(error) {
  const candidate = typeof error?.stderr === 'string' ? error.stderr.match(/\bAn error occurred \(([A-Za-z][A-Za-z0-9]{0,63})\) when calling\b/)?.[1] : undefined;
  return allowedAwsErrors.has(candidate) ? candidate : 'UNCLASSIFIED_CLI_ERROR';
}
export function cliFailureCode(command, args, error) {
  let operation = 'UNKNOWN_CLI_OPERATION';
  if (command === 'aws') {
    operation = awsOperations.get(`${args[3]}:${args[4]}`) ?? 'UNKNOWN_AWS_OPERATION';
    if (operation === 'AWS_EC2_REBOOT_INSTANCES' && args.includes('--dry-run')) operation += '_DRY_RUN';
  }
  if (command === 'kubectl') operation = kubernetesOperations.get(`${args[4]}:${args[5]}:${args[6]}`) ?? kubernetesOperations.get(`${args[4]}:${args[5]}`) ?? 'UNKNOWN_KUBECTL_OPERATION';
  return `RECOVERY_CLI_FAILED_${operation}_${awsErrorClass(error)}`;
}

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
  async function invoke(command, args, options) { try { return await run(command, args, options); } catch (error) { fail(cliFailureCode(command, args, error)); } }
  async function json(command, args) {
    const text = await invoke(command, args);
    try { const value = JSON.parse(text); if (!object(value)) fail('INVALID_CLI_JSON'); return value; } catch { fail('INVALID_CLI_JSON'); }
  }
  const awsArgs = (...args) => ['--region', SCOPE.region, '--no-cli-pager', ...args, '--output', 'json'];
  const aws = (...args) => json('aws', awsArgs(...args));
  const kubeArgs = (...args) => ['--kubeconfig', kubeconfig, '--context', SCOPE.context, ...args];
  const kube = (...args) => json('kubectl', kubeArgs(...args, '-o', 'json'));
  const identity = await aws('sts', 'get-caller-identity');
  if (identity.Account !== SCOPE.account) fail('WRONG_CALLER_ACCOUNT');
  if (!new RegExp(`^arn:aws:sts::${SCOPE.account}:assumed-role/voclabs/[A-Za-z0-9+=,.@_-]+$`).test(identity.Arn ?? '')) fail('EXPECTED_VOCLABS_CALLER_REQUIRED');
  function requireTags(tags, expected, code) {
    if (!Array.isArray(tags)) fail(code);
    for (const [key, value] of expected) { const matches = tags.filter(tag => tag.Key === key); if (matches.length !== 1 || matches[0].Value !== value) fail(code); }
  }
  const ownershipTags = [['eks:cluster-name', SCOPE.cluster], ['eks:nodegroup-name', SCOPE.nodegroup], [`kubernetes.io/cluster/${SCOPE.cluster}`, 'owned']];
  async function readOwnedSnapshot() {
    const cluster = (await aws('eks', 'describe-cluster', '--name', SCOPE.cluster)).cluster;
    if (!object(cluster) || cluster.name !== SCOPE.cluster || cluster.arn !== `arn:aws:eks:${SCOPE.region}:${SCOPE.account}:cluster/${SCOPE.cluster}` || cluster.status !== 'ACTIVE' || typeof cluster.endpoint !== 'string' || !/^vpc-[a-f0-9]{8,17}$/.test(cluster.resourcesVpcConfig?.vpcId ?? '')) fail('CLUSTER_SCOPE_OR_STATUS_INVALID');
    const group = (await aws('eks', 'describe-nodegroup', '--cluster-name', SCOPE.cluster, '--nodegroup-name', SCOPE.nodegroup)).nodegroup;
    if (!object(group) || group.clusterName !== SCOPE.cluster || group.nodegroupName !== SCOPE.nodegroup || !new RegExp(`^arn:aws:eks:${SCOPE.region}:${SCOPE.account}:nodegroup/${SCOPE.cluster}/${SCOPE.nodegroup}/[a-f0-9-]+$`).test(group.nodegroupArn ?? '') || group.status !== 'ACTIVE') fail('NODEGROUP_SCOPE_OR_STATUS_INVALID');
    if (group.nodeRole !== env.NODE_ROLE_ARN) fail('NODE_ROLE_MISMATCH');
    if (group.scalingConfig?.desiredSize !== 2 || !Number.isInteger(group.scalingConfig?.maxSize) || group.scalingConfig.maxSize < 4) fail('NODEGROUP_CAPACITY_INVALID');
    const groups = group.resources?.autoScalingGroups;
    if (!Array.isArray(groups) || groups.length !== 1 || !/^eks-oficina-homolog-ng-[A-Za-z0-9-]+$/.test(groups[0]?.name ?? '')) fail('NODEGROUP_ASG_OWNERSHIP_INVALID');
    const asgName = groups[0].name;
    const response = await aws('autoscaling', 'describe-auto-scaling-groups', '--auto-scaling-group-names', asgName);
    if (!Array.isArray(response.AutoScalingGroups) || response.AutoScalingGroups.length !== 1) fail('ASG_SCOPE_INVALID');
    const asg = response.AutoScalingGroups[0];
    if (asg.AutoScalingGroupName !== asgName || !new RegExp(`^arn:aws:autoscaling:${SCOPE.region}:${SCOPE.account}:autoScalingGroup:[^:]+:autoScalingGroupName/${escape(asgName)}$`).test(asg.AutoScalingGroupARN ?? '')) fail('ASG_SCOPE_INVALID');
    requireTags(asg.Tags, ownershipTags, 'ASG_OWNERSHIP_TAGS_INVALID');
    if (asg.DesiredCapacity !== 2 || !Number.isInteger(asg.MaxSize) || asg.MaxSize < 4 || (asg.DesiredCapacityType && asg.DesiredCapacityType !== 'units')) fail('ASG_CAPACITY_INVALID');
    if (!Array.isArray(asg.Instances) || asg.Instances.length !== 2 || asg.Instances.some(instance => !instanceId(instance.InstanceId) || instance.LifecycleState !== 'InService' || instance.HealthStatus !== 'Healthy' || instance.ProtectedFromScaleIn === true || instance.WeightedCapacity && instance.WeightedCapacity !== '1')) fail('ASG_INSTANCES_NOT_STABLE');
    const ids = asg.Instances.map(instance => instance.InstanceId).sort();
    if (new Set(ids).size !== 2) fail('DUPLICATE_ASG_INSTANCE_IDS');
    const ec2 = await aws('ec2', 'describe-instances', '--instance-ids', ...ids);
    if (!Array.isArray(ec2.Reservations) || ec2.Reservations.some(reservation => reservation.OwnerId !== SCOPE.account || !Array.isArray(reservation.Instances))) fail('EC2_OWNERSHIP_INVALID');
    const instances = ec2.Reservations.flatMap(reservation => reservation.Instances).sort((a, b) => String(a.InstanceId).localeCompare(String(b.InstanceId)));
    if (instances.length !== 2 || !same(instances.map(instance => instance.InstanceId), ids)) fail('EC2_INSTANCE_IDS_MISMATCH');
    const targets = instances.map(instance => {
      if (instance.State?.Name !== 'running' || instance.VpcId !== cluster.resourcesVpcConfig.vpcId || typeof instance.PrivateIpAddress !== 'string' || !instance.PrivateIpAddress || typeof instance.Placement?.AvailabilityZone !== 'string') fail('EC2_STATE_OR_VPC_INVALID');
      requireTags(instance.Tags, [...ownershipTags, ['aws:autoscaling:groupName', asgName]], 'EC2_OWNERSHIP_TAGS_INVALID');
      const template = asg.Instances.find(item => item.InstanceId === instance.InstanceId).LaunchTemplate;
      if (!/^lt-[a-f0-9]{8,17}$/.test(template?.LaunchTemplateId ?? '') || !/^[1-9][0-9]*$/.test(template?.Version ?? '')) fail('INSTANCE_LAUNCH_TEMPLATE_REQUIRED');
      return { id: instance.InstanceId, privateIp: instance.PrivateIpAddress, publicIp: instance.PublicIpAddress ?? null, subnet: instance.SubnetId ?? null, zone: instance.Placement.AvailabilityZone, launchTemplate: { id: template.LaunchTemplateId, version: template.Version } };
    });
    return { asgName, endpoint: cluster.endpoint, vpc: cluster.resourcesVpcConfig.vpcId, desired: asg.DesiredCapacity, minimum: asg.MinSize, maximum: asg.MaxSize, groupScaling: { desired: group.scalingConfig.desiredSize, minimum: group.scalingConfig.minSize, maximum: group.scalingConfig.maxSize }, targets };
  }
  const snapshot = await readOwnedSnapshot();
  const config = await kube('config', 'view', '--minify');
  if (config['current-context'] !== SCOPE.context || config.clusters?.length !== 1 || config.clusters[0]?.cluster?.server !== snapshot.endpoint) fail('KUBERNETES_CONTEXT_MISMATCH');
  async function ensureNoActiveRefresh() {
    const response = await aws('autoscaling', 'describe-instance-refreshes', '--auto-scaling-group-name', snapshot.asgName);
    if (!Array.isArray(response.InstanceRefreshes)) fail('INVALID_REFRESH_LIST');
    for (const item of response.InstanceRefreshes) if (item.AutoScalingGroupName !== snapshot.asgName || !active.has(item.Status) && !terminal.has(item.Status)) fail('INVALID_REFRESH_SCOPE_OR_STATUS');
    if (response.InstanceRefreshes.some(item => active.has(item.Status))) fail('REFRESH_ALREADY_ACTIVE');
  }
  function ready(node) {
    const provider = /^aws:\/\/\/([^/]+)\/(i-[a-f0-9]+)$/.exec(node.spec?.providerID ?? '');
    return node.metadata?.labels?.['eks.amazonaws.com/nodegroup'] === SCOPE.nodegroup && node.status?.conditions?.some(condition => condition.type === 'Ready' && condition.status === 'True') && snapshot.targets.some(target => target.id === provider?.[2] && target.zone === provider?.[1]);
  }
  async function nodes() { const list = await kube('get', 'nodes'); if (!Array.isArray(list.items)) fail('INVALID_NODE_LIST'); return list.items; }
  function readyCount(items) { return new Set(items.filter(ready).map(node => node.spec.providerID)).size; }
  async function emptyOrReady() { const items = await nodes(); if (items.length === 0) return false; if (items.length === 2 && readyCount(items) === 2) return true; fail('PARTIAL_OR_UNEXPECTED_REGISTERED_NODES'); }
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
    if (readyCount(items) < 2) fail('READY_NODES_LOST_AFTER_ROLLOUT');
    return readyCount(items);
  }
  const result = (status, readyNodes) => ({ status, account: SCOPE.account, cluster: SCOPE.cluster, nodegroup: SCOPE.nodegroup, asg: snapshot.asgName, instanceIds: snapshot.targets.map(target => target.id), readyNodes, pendingApplicationPods, systemRollouts: ['coredns', 'metrics-server'] });
  await ensureNoActiveRefresh();
  if (await emptyOrReady()) return result('noop-already-ready', await verifySystemRollouts());
  await noActiveOrPersistentApplicationPods();
  if (!same(snapshot, await readOwnedSnapshot())) fail('OWNED_INSTANCE_SCOPE_CHANGED');
  await ensureNoActiveRefresh();
  if (await emptyOrReady()) return result('noop-already-ready', await verifySystemRollouts());
  await noActiveOrPersistentApplicationPods();
  const reboot = awsArgs('ec2', 'reboot-instances', '--instance-ids', ...snapshot.targets.map(target => target.id));
  // Permission-only native dry-run must fail specifically with DryRunOperation.
  try { await run('aws', [...reboot, '--dry-run']); fail('REBOOT_DRY_RUN_UNEXPECTED_SUCCESS'); }
  catch (error) {
    if (error instanceof RecoveryError) throw error;
    if (!Number.isInteger(error?.code) || error.code === 0 || awsErrorClass(error) !== 'DryRunOperation') fail(cliFailureCode('aws', [...reboot, '--dry-run'], error));
  }
  // RebootInstances normally returns empty stdout. Never parse it as JSON.
  await invoke('aws', reboot);
  const deadline = now() + timeoutMs;
  for (;;) {
    const items = await nodes();
    if (items.some(node => node.metadata?.labels?.['eks.amazonaws.com/nodegroup'] !== SCOPE.nodegroup || node.spec?.providerID && !snapshot.targets.some(target => node.spec.providerID === `aws:///${target.zone}/${target.id}`))) fail('UNEXPECTED_INSTANCE_REGISTERED');
    if (readyCount(items) >= 2) break;
    if (now() >= deadline) fail('READY_NODES_TIMEOUT');
    await sleep(intervalMs);
  }
  const readyNodes = await verifySystemRollouts();
  if (!same(snapshot, await readOwnedSnapshot())) fail('OWNED_INSTANCE_SCOPE_CHANGED');
  return result('rebooted', readyNodes);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    if (process.platform !== 'linux' || process.env.GITHUB_ACTIONS !== 'true') fail('ACTIONS_LINUX_ONLY');
    if (process.argv[2] === '--validate-request' && process.argv.length === 3) { validateRequest(process.env); process.stdout.write('Guarded node reboot request is valid.\n'); }
    else if (process.argv.length === 2) {
      const output = await recoverEmptyNodes({ env: process.env, run: executor(process.env) });
      process.stdout.write(JSON.stringify(output) + '\n');
      if (process.env.GITHUB_STEP_SUMMARY) await appendFile(process.env.GITHUB_STEP_SUMMARY, `### Existing node instance reboot\n- Result: ${output.status}\n- Cluster/nodegroup: ${output.cluster}/${output.nodegroup}\n- ASG: ${output.asg}\n- Existing instances: ${output.instanceIds.join(', ')}\n- Ready nodes: ${output.readyNodes}\n- CoreDNS and metrics-server rollouts: verified\n`);
    } else fail('INVALID_ARGUMENTS');
  } catch (error) { process.stderr.write(`Node recovery failed (${error instanceof RecoveryError ? error.code : 'UNEXPECTED_ERROR'}); raw CLI output omitted.\n`); process.exitCode = 1; }
}
