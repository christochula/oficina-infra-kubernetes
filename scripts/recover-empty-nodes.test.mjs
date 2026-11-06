import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { recoverEmptyNodes, validateRequest, cliFailureCode, SCOPE } from './recover-empty-nodes.mjs';

const role = `arn:aws:iam::${SCOPE.account}:role/LabEksNodeRole-fixture`;
const asgName = 'eks-oficina-homolog-ng-11111111-2222-3333-4444-555555555555';
const groupId = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
const ids = ['i-00000000000000001', 'i-00000000000000002'];
const env = { GITHUB_ACTIONS: 'true', AWS_REGION: SCOPE.region, EXPECTED_AWS_ACCOUNT_ID: SCOPE.account, NODE_ROLE_ARN: role, CONFIRM_NODE_RECOVERY: SCOPE.confirmation, RUNNER_TEMP: tmpdir() };
const readyNodes = () => ids.map((id, index) => ({ metadata: { name: `node-${index}`, labels: { 'eks.amazonaws.com/nodegroup': SCOPE.nodegroup } }, spec: { providerID: `aws:///us-east-1${index === 0 ? 'a' : 'b'}/${id}` }, status: { conditions: [{ type: 'Ready', status: 'True' }] } }));
const pod = (phase = 'Pending', extra = {}) => ({ metadata: { namespace: 'oficina-fase4' }, status: { phase }, spec: { ...extra } });
const apiError = classification => ({ code: 255, stderr: `An error occurred (${classification}) when calling the RebootInstances operation: private-fixture-do-not-emit`, stdout: 'private-output' });
function fixture() {
  const ownership = [{ Key: 'eks:cluster-name', Value: SCOPE.cluster }, { Key: 'eks:nodegroup-name', Value: SCOPE.nodegroup }, { Key: `kubernetes.io/cluster/${SCOPE.cluster}`, Value: 'owned' }];
  const data = {
    identity: { Account: SCOPE.account, Arn: `arn:aws:sts::${SCOPE.account}:assumed-role/voclabs/user=fixture` },
    cluster: { name: SCOPE.cluster, arn: `arn:aws:eks:${SCOPE.region}:${SCOPE.account}:cluster/${SCOPE.cluster}`, status: 'ACTIVE', endpoint: 'https://fixture.us-east-1.eks.amazonaws.com', resourcesVpcConfig: { vpcId: 'vpc-0123456789abcdef0' } },
    group: { clusterName: SCOPE.cluster, nodegroupName: SCOPE.nodegroup, nodegroupArn: `arn:aws:eks:${SCOPE.region}:${SCOPE.account}:nodegroup/${SCOPE.cluster}/${SCOPE.nodegroup}/${groupId}`, status: 'ACTIVE', nodeRole: role, scalingConfig: { desiredSize: 2, minSize: 2, maxSize: 4 }, resources: { autoScalingGroups: [{ name: asgName }] } },
    asg: { AutoScalingGroupName: asgName, AutoScalingGroupARN: `arn:aws:autoscaling:${SCOPE.region}:${SCOPE.account}:autoScalingGroup:${groupId}:autoScalingGroupName/${asgName}`, MinSize: 2, MaxSize: 4, DesiredCapacity: 2, DesiredCapacityType: 'units', Tags: structuredClone(ownership), Instances: ids.map(InstanceId => ({ InstanceId, LifecycleState: 'InService', HealthStatus: 'Healthy', ProtectedFromScaleIn: false, LaunchTemplate: { LaunchTemplateId: 'lt-0123456789abcdef0', Version: '1' } })) },
    ec2: ids.map((InstanceId, index) => ({ InstanceId, State: { Name: 'running' }, VpcId: 'vpc-0123456789abcdef0', SubnetId: `subnet-0000000${index}`, PrivateIpAddress: `10.0.${index}.10`, PublicIpAddress: `192.0.2.${index + 1}`, Placement: { AvailabilityZone: `us-east-1${index === 0 ? 'a' : 'b'}` }, Tags: [...structuredClone(ownership), { Key: 'aws:autoscaling:groupName', Value: asgName }] })),
    history: [], pods: [{ metadata: { namespace: 'kube-system' }, status: { phase: 'Pending' }, spec: {} }],
    nodes: undefined, actualAttempts: 0, reboots: 0, probes: 0, nodeReads: 0, ec2Reads: 0, groupReads: 0, historyReads: 0, dryRun: 'DryRunOperation', failRollout: false, deploymentReplicas: undefined,
  };
  const calls = []; let clock = 0;
  async function run(command, args, options) {
    calls.push({ command, args: [...args], options });
    if (command === 'aws') {
      const [service, operation] = args.slice(3, 5);
      if (service === 'sts' && operation === 'get-caller-identity') return JSON.stringify(data.identity);
      if (service === 'eks' && operation === 'describe-cluster') return JSON.stringify({ cluster: data.cluster });
      if (service === 'eks' && operation === 'describe-nodegroup') { data.groupReads++; data.onGroupRead?.(data.groupReads); return JSON.stringify({ nodegroup: data.group }); }
      if (service === 'autoscaling' && operation === 'describe-auto-scaling-groups') return JSON.stringify({ AutoScalingGroups: [data.asg] });
      if (service === 'autoscaling' && operation === 'describe-instance-refreshes') { data.historyReads++; return JSON.stringify({ InstanceRefreshes: typeof data.history === 'function' ? data.history(data.historyReads) : data.history }); }
      if (service === 'ec2' && operation === 'describe-instances') { data.ec2Reads++; data.onEc2Read?.(data.ec2Reads); return JSON.stringify({ Reservations: [{ OwnerId: data.owner ?? SCOPE.account, Instances: data.ec2 }] }); }
      if (service === 'ec2' && operation === 'reboot-instances') {
        if (args.includes('--dry-run')) { data.probes++; if (data.dryRun === 'exit-zero') return ''; if (data.dryRun === 'error-code-zero') throw { ...apiError('DryRunOperation'), code: 0 }; throw apiError(data.dryRun); }
        data.actualAttempts++; if (data.rebootError) throw apiError(data.rebootError); data.reboots++; return '';
      }
    }
    if (command === 'kubectl') {
      assert.equal(args[0], '--kubeconfig'); assert.equal(args[2], '--context'); assert.equal(args[3], SCOPE.context);
      if (args[4] === 'config' && args[5] === 'view') return JSON.stringify(data.config ?? { 'current-context': SCOPE.context, clusters: [{ cluster: { server: data.cluster.endpoint } }] });
      if (args[4] === 'get' && args[5] === 'nodes') { data.nodeReads++; return JSON.stringify({ items: typeof data.nodes === 'function' ? data.nodes(data.nodeReads, data.reboots) : data.nodes ?? (data.reboots ? readyNodes() : []) }); }
      if (args[4] === 'get' && args[5] === 'pods') return JSON.stringify({ items: typeof data.pods === 'function' ? data.pods(data.nodeReads) : data.pods });
      if (args[4] === 'rollout' && args[5] === 'status') { if (data.failRollout) throw new Error('private-cli-fixture'); return 'rollout verified'; }
      if (args[4] === 'get' && args[5] === 'deployment') { const name = args[6]; const replicas = data.deploymentReplicas ?? (name === 'coredns' ? 2 : 1); return JSON.stringify({ metadata: { name, namespace: 'kube-system' }, spec: { replicas }, status: { availableReplicas: replicas, updatedReplicas: replicas } }); }
    }
    throw new Error('unexpected CLI operation');
  }
  return { data, calls, execute: options => recoverEmptyNodes({ env, run, now: () => clock, sleep: async ms => { clock += ms; }, timeoutMs: 60000, ...options }), mutations: () => calls.filter(call => call.command === 'aws' && !['get-caller-identity', 'describe-cluster', 'describe-nodegroup', 'describe-auto-scaling-groups', 'describe-instance-refreshes', 'describe-instances'].includes(call.args[4]) && !call.args.includes('--dry-run')) };
}

test('rejects local invocation, missing reboot confirmation, wrong fixed scope and missing role before CLI', () => {
  for (const change of [{ GITHUB_ACTIONS: 'false' }, { CONFIRM_NODE_RECOVERY: '' }, { CONFIRM_NODE_RECOVERY: 'RECOVER_EMPTY_OFICINA_NODES' }, { EXPECTED_AWS_ACCOUNT_ID: '000000000000' }, { AWS_REGION: 'us-west-2' }, { NODE_ROLE_ARN: '' }, { NODE_ROLE_ARN: 'arn:aws:iam::000000000000:role/other' }, { RUNNER_TEMP: 'relative/path' }]) assert.throws(() => validateRequest({ ...env, ...change }));
  assert.ok(validateRequest(env).kubeconfig.endsWith('oficina-node-recovery.kubeconfig'));
});

test('two canonical Ready provider IDs are a no-op without even a reboot dry-run', async () => {
  const f = fixture(); f.data.nodes = readyNodes(); f.data.pods = [pod('Running', { nodeName: 'node-1' })];
  const result = await f.execute(); assert.equal(result.status, 'noop-already-ready'); assert.equal(result.readyNodes, 2); assert.equal(f.data.probes, 0); assert.equal(f.mutations().length, 0);
  assert.equal(f.calls.filter(call => call.command === 'kubectl' && call.args[4] === 'rollout').length, 2);
});

test('wrong caller, role, cluster, ASG graph, capacity or EC2 ownership/state prevents all mutation', async () => {
  const changes = [
    data => { data.identity.Account = '000000000000'; }, data => { data.identity.Arn = data.identity.Arn.replace('voclabs', 'another-role'); },
    data => { data.cluster.status = 'UPDATING'; }, data => { data.cluster.resourcesVpcConfig.vpcId = ''; }, data => { data.group.status = 'DEGRADED'; }, data => { data.group.nodeRole += '-wrong'; },
    data => { data.group.resources.autoScalingGroups = []; }, data => { data.group.resources.autoScalingGroups.push({ name: 'another-asg' }); },
    data => { data.asg.Tags[0].Value = 'another-cluster'; }, data => { data.asg.Tags.push({ ...data.asg.Tags[0] }); }, data => { data.asg.AutoScalingGroupARN = data.asg.AutoScalingGroupARN.replace(SCOPE.account, '000000000000'); },
    data => { data.group.scalingConfig.desiredSize = 3; }, data => { data.group.scalingConfig.maxSize = 3; }, data => { data.asg.DesiredCapacity = 3; }, data => { data.asg.MaxSize = 3; },
    data => { data.asg.Instances[0].LifecycleState = 'Pending'; }, data => { data.asg.Instances[0].HealthStatus = 'Unhealthy'; }, data => { data.asg.Instances[0].ProtectedFromScaleIn = true; },
    data => { data.asg.Instances[1].InstanceId = data.asg.Instances[0].InstanceId; }, data => { data.ec2.pop(); }, data => { data.ec2[1].InstanceId = 'i-00000000000000003'; },
    data => { data.owner = '000000000000'; }, data => { data.ec2[0].State.Name = 'stopped'; }, data => { data.ec2[0].VpcId = 'vpc-00000000'; },
    data => { data.ec2[0].Tags.pop(); }, data => { data.ec2[0].Tags[0].Value = 'another-cluster'; }, data => { data.asg.Instances[0].LaunchTemplate.Version = '$Latest'; },
  ];
  for (const change of changes) { const f = fixture(); change(f.data); await assert.rejects(f.execute()); assert.equal(f.data.probes, 0); assert.equal(f.mutations().length, 0); }
});

test('wrong kubeconfig, partial nodes, wrong provider IDs or absent provider IDs forbid reboot', async () => {
  for (const nodes of [readyNodes().slice(0, 1), readyNodes().map(node => ({ ...node, status: { conditions: [] } })), readyNodes().map(node => ({ ...node, spec: {} })), readyNodes().map(node => ({ ...node, spec: { providerID: 'aws:///us-east-1a/i-00000000000000003' } }))]) {
    const f = fixture(); f.data.nodes = nodes; await assert.rejects(f.execute(), /PARTIAL_OR_UNEXPECTED/); assert.equal(f.mutations().length, 0);
  }
  const f = fixture(); f.data.config = { 'current-context': SCOPE.context, clusters: [{ cluster: { server: 'https://other.example' } }] }; await assert.rejects(f.execute(), /CONTEXT_MISMATCH/); assert.equal(f.mutations().length, 0);
});

test('only unassigned Pending stateless application pods may coexist with zero nodes', async () => {
  const f = fixture(); f.data.pods = [pod('Pending', { volumes: [{ name: 'cache', emptyDir: {} }, { name: 'configuration', secret: { secretName: 'fixture' } }] })];
  const result = await f.execute(); assert.equal(result.pendingApplicationPods, 1); assert.equal(result.status, 'rebooted'); assert.equal(f.mutations().length, 1);
});

test('active, assigned or persistent-volume application pods forbid all reboot calls', async () => {
  const blocked = [pod('Running'), pod('Unknown'), pod('Succeeded'), pod('Pending', { nodeName: 'assigned-node' }), ...[{ hostPath: { path: '/data' } }, { persistentVolumeClaim: { claimName: 'data' } }, { ephemeral: { volumeClaimTemplate: {} } }, { csi: { driver: 'external' } }].map(source => pod('Pending', { volumes: [{ name: 'data', ...source }] }))];
  for (const item of blocked) { const f = fixture(); f.data.pods = [item]; await assert.rejects(f.execute()); assert.equal(f.data.probes, 0); assert.equal(f.mutations().length, 0); }
});

test('an existing active ASG refresh or unknown status stops recovery without another ASG operation', async () => {
  for (const Status of ['Pending', 'InProgress', 'Cancelling', 'RollbackInProgress', 'Baking', 'Unexpected']) { const f = fixture(); f.data.history = [{ AutoScalingGroupName: asgName, Status }]; await assert.rejects(f.execute()); assert.equal(f.mutations().length, 0); }
});

test('rechecks IDs, IPs, launch template, nodes and pods before the permission probe', async () => {
  for (const race of ['ip', 'template', 'node', 'pod', 'refresh']) {
    const f = fixture();
    if (race === 'ip') f.data.onEc2Read = count => { if (count === 2) f.data.ec2[0].PrivateIpAddress = '10.0.0.99'; };
    if (race === 'template') f.data.onGroupRead = count => { if (count === 2) f.data.asg.Instances[0].LaunchTemplate.Version = '2'; };
    if (race === 'node') f.data.nodes = count => count === 1 ? [] : readyNodes().slice(0, 1);
    if (race === 'pod') f.data.pods = count => count === 1 ? [] : [pod('Running')];
    if (race === 'refresh') f.data.history = count => count === 1 ? [] : [{ AutoScalingGroupName: asgName, Status: 'InProgress' }];
    await assert.rejects(f.execute()); assert.equal(f.data.probes, 0); assert.equal(f.mutations().length, 0);
  }
});

test('native dry-run must report nonzero DryRunOperation; denial or unexpected success never reboots', async () => {
  for (const mode of ['UnauthorizedOperation', 'AccessDenied', 'ValidationError', 'private-unrecognized-error', 'exit-zero', 'error-code-zero']) { const f = fixture(); f.data.dryRun = mode; await assert.rejects(f.execute()); assert.equal(f.data.probes, 1); assert.equal(f.data.actualAttempts, 0); assert.equal(f.mutations().length, 0); }
});

test('one permitted dry-run is immediately followed by one existing-ID batch reboot accepting empty stdout', async () => {
  const f = fixture(); const result = await f.execute(); assert.equal(result.status, 'rebooted'); assert.equal(result.readyNodes, 2); assert.deepEqual(result.instanceIds, ids);
  assert.equal(f.data.probes, 1); assert.equal(f.data.actualAttempts, 1); assert.equal(f.mutations().length, 1);
  const probeIndex = f.calls.findIndex(call => call.args.includes('--dry-run')); const actual = f.calls[probeIndex + 1];
  assert.equal(actual.command, 'aws'); assert.deepEqual(actual.args.slice(3, 5), ['ec2', 'reboot-instances']);
  assert.deepEqual(actual.args.slice(actual.args.indexOf('--instance-ids') + 1, actual.args.indexOf('--output')), ids);
  assert.equal(actual.args.includes('--dry-run'), false); assert.ok(f.calls.every(call => !call.args.includes('start-instance-refresh') && !call.args.includes('terminate-instances') && !call.args.includes('update-auto-scaling-group') && !call.args.includes('assume-role')));
});

test('API failure, readiness timeout, foreign instance or system rollout failure never retries mutation', async () => {
  for (const kind of ['api', 'timeout', 'foreign', 'rollout', 'scaled-zero']) { const f = fixture(); if (kind === 'api') f.data.rebootError = 'AccessDenied'; if (kind === 'timeout') f.data.nodes = () => []; if (kind === 'foreign') f.data.nodes = (_, rebooted) => rebooted ? readyNodes().map(node => ({ ...node, spec: { providerID: 'aws:///us-east-1a/i-00000000000000003' } })) : []; if (kind === 'rollout') f.data.failRollout = true; if (kind === 'scaled-zero') f.data.deploymentReplicas = 0; await assert.rejects(f.execute(), error => { assert.equal(error.message.includes('private-'), false); return true; }); assert.equal(f.data.actualAttempts, 1); assert.equal(f.mutations().length, 1); }
});

test('CLI errors expose only static operation and allowlisted error class, never raw data or arguments', () => {
  const sensitive = 'private-fixture-do-not-emit'; const args = ['--region', SCOPE.region, '--no-cli-pager', 'ec2', 'reboot-instances', '--instance-ids', sensitive];
  for (const code of ['AccessDenied', 'ValidationError']) { const result = cliFailureCode('aws', args, apiError(code)); assert.equal(result, `RECOVERY_CLI_FAILED_AWS_EC2_REBOOT_INSTANCES_${code}`); assert.equal(result.includes(sensitive), false); }
  assert.equal(cliFailureCode('aws', [...args, '--dry-run'], apiError('UnauthorizedOperation')), 'RECOVERY_CLI_FAILED_AWS_EC2_REBOOT_INSTANCES_DRY_RUN_UnauthorizedOperation');
  assert.equal(cliFailureCode('aws', args, apiError(sensitive)), 'RECOVERY_CLI_FAILED_AWS_EC2_REBOOT_INSTANCES_UNCLASSIFIED_CLI_ERROR');
  assert.equal(cliFailureCode('kubectl', ['--kubeconfig', sensitive, '--context', sensitive, 'get', 'deployment', sensitive], { stderr: sensitive }), 'RECOVERY_CLI_FAILED_UNKNOWN_KUBECTL_OPERATION_UNCLASSIFIED_CLI_ERROR');
});

test('the actual invoke catch sanitizes failures and local CLI invocation remains prohibited', async () => {
  const f = fixture(); await assert.rejects(f.execute({ run: async () => { throw apiError('AccessDenied'); } }), error => { assert.equal(error.code, 'RECOVERY_CLI_FAILED_AWS_STS_GET_CALLER_IDENTITY_AccessDenied'); assert.equal(error.message.includes('private-'), false); return true; }); assert.equal(f.mutations().length, 0);
  const result = spawnSync(process.execPath, [fileURLToPath(new URL('./recover-empty-nodes.mjs', import.meta.url))], { encoding: 'utf8', env: { ...process.env, GITHUB_ACTIONS: 'false', AWS_SECRET_ACCESS_KEY: 'private-fixture-never-used' } }); assert.equal(result.status, 1); assert.match(result.stderr, /ACTIONS_LINUX_ONLY/); assert.equal((result.stdout + result.stderr).includes('private-fixture-never-used'), false);
});
