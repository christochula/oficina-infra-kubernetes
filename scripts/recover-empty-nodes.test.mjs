import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { recoverEmptyNodes, validateRequest, SCOPE, PREFERENCES } from './recover-empty-nodes.mjs';

const role = `arn:aws:iam::${SCOPE.account}:role/LabEksNodeRole-fixture`;
const asgName = 'eks-oficina-homolog-ng-11111111-2222-3333-4444-555555555555';
const refreshId = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
const env = { GITHUB_ACTIONS: 'true', AWS_REGION: SCOPE.region, EXPECTED_AWS_ACCOUNT_ID: SCOPE.account, NODE_ROLE_ARN: role, CONFIRM_NODE_RECOVERY: SCOPE.confirmation, RUNNER_TEMP: tmpdir() };
const readyNodes = () => [1, 2].map(id => ({ metadata: { name: `node-${id}`, labels: { 'eks.amazonaws.com/nodegroup': SCOPE.nodegroup } }, status: { conditions: [{ type: 'Ready', status: 'True' }] } }));
const pod = (phase = 'Pending', extra = {}) => ({ metadata: { namespace: 'oficina-fase4' }, status: { phase }, spec: { ...extra } });
function fixture() {
  const data = {
    identity: { Account: SCOPE.account },
    cluster: { name: SCOPE.cluster, arn: `arn:aws:eks:${SCOPE.region}:${SCOPE.account}:cluster/${SCOPE.cluster}`, status: 'ACTIVE', endpoint: 'https://fixture.us-east-1.eks.amazonaws.com' },
    group: { clusterName: SCOPE.cluster, nodegroupName: SCOPE.nodegroup, nodegroupArn: `arn:aws:eks:${SCOPE.region}:${SCOPE.account}:nodegroup/${SCOPE.cluster}/${SCOPE.nodegroup}/${refreshId}`, status: 'ACTIVE', nodeRole: role, scalingConfig: { desiredSize: 2, minSize: 2, maxSize: 4 }, resources: { autoScalingGroups: [{ name: asgName }] } },
    asg: { AutoScalingGroupName: asgName, AutoScalingGroupARN: `arn:aws:autoscaling:${SCOPE.region}:${SCOPE.account}:autoScalingGroup:${refreshId}:autoScalingGroupName/${asgName}`, MinSize: 2, MaxSize: 4, DesiredCapacity: 2, DesiredCapacityType: 'units', Tags: [{ Key: 'eks:cluster-name', Value: SCOPE.cluster }, { Key: 'eks:nodegroup-name', Value: SCOPE.nodegroup }, { Key: `kubernetes.io/cluster/${SCOPE.cluster}`, Value: 'owned' }], Instances: [1, 2].map(id => ({ InstanceId: `i-fixture${id}`, LifecycleState: 'InService', HealthStatus: 'Healthy', ProtectedFromScaleIn: false })) },
    history: [], pods: [{ metadata: { namespace: 'kube-system' }, status: { phase: 'Pending' }, spec: {} }],
    progress: ['Pending', 'InProgress', 'Successful'], nodes: undefined, starts: 0, nodeReads: 0, historyReads: 0, missingRefreshReads: 0, failRollout: false, deploymentReplicas: undefined,
  };
  const calls = []; let clock = 0;
  async function run(command, args, options) {
    calls.push({ command, args: [...args], options });
    if (command === 'aws') {
      const [service, operation] = args.slice(3, 5);
      if (service === 'sts' && operation === 'get-caller-identity') return JSON.stringify(data.identity);
      if (service === 'eks' && operation === 'describe-cluster') return JSON.stringify({ cluster: data.cluster });
      if (service === 'eks' && operation === 'describe-nodegroup') return JSON.stringify({ nodegroup: data.group });
      if (service === 'autoscaling' && operation === 'describe-auto-scaling-groups') return JSON.stringify({ AutoScalingGroups: [data.asg] });
      if (service === 'autoscaling' && operation === 'describe-instance-refreshes') {
        data.historyReads++;
        if (!args.includes('--instance-refresh-ids')) return JSON.stringify({ InstanceRefreshes: typeof data.history === 'function' ? data.history(data.historyReads) : data.history });
        if (data.missingRefreshReads > 0) { data.missingRefreshReads--; return JSON.stringify({ InstanceRefreshes: [] }); }
        const status = typeof data.progress === 'function' ? data.progress() : data.progress.shift() ?? 'Successful';
        return JSON.stringify({ InstanceRefreshes: [{ AutoScalingGroupName: asgName, InstanceRefreshId: refreshId, Status: status }] });
      }
      if (service === 'autoscaling' && operation === 'start-instance-refresh') { data.starts++; return JSON.stringify({ InstanceRefreshId: refreshId }); }
    }
    if (command === 'kubectl') {
      assert.equal(args[0], '--kubeconfig'); assert.equal(args[2], '--context'); assert.equal(args[3], SCOPE.context);
      if (args[4] === 'config' && args[5] === 'view') return JSON.stringify(data.config ?? { 'current-context': SCOPE.context, clusters: [{ cluster: { server: data.cluster.endpoint } }] });
      if (args[4] === 'get' && args[5] === 'nodes') {
        data.nodeReads++;
        const items = typeof data.nodes === 'function' ? data.nodes(data.nodeReads, data.starts) : data.nodes ?? (data.starts ? readyNodes() : []);
        return JSON.stringify({ items });
      }
      if (args[4] === 'get' && args[5] === 'pods') return JSON.stringify({ items: typeof data.pods === 'function' ? data.pods(data.nodeReads) : data.pods });
      if (args[4] === 'rollout' && args[5] === 'status') { if (data.failRollout) throw new Error('private-cli-fixture'); return 'rollout verified'; }
      if (args[4] === 'get' && args[5] === 'deployment') {
        const name = args[6]; const replicas = data.deploymentReplicas ?? (name === 'coredns' ? 2 : 1);
        return JSON.stringify({ metadata: { name, namespace: 'kube-system' }, spec: { replicas }, status: { availableReplicas: replicas, updatedReplicas: replicas } });
      }
    }
    throw new Error('unexpected CLI operation');
  }
  return { data, calls, execute: options => recoverEmptyNodes({ env, run, now: () => clock, sleep: async ms => { clock += ms; }, timeoutMs: 60000, ...options }), mutations: () => calls.filter(call => call.command === 'aws' && !['get-caller-identity', 'describe-cluster', 'describe-nodegroup', 'describe-auto-scaling-groups', 'describe-instance-refreshes'].includes(call.args[4])) };
}

test('rejects local invocation, missing confirmation, wrong fixed scope and missing expected role before CLI', () => {
  for (const change of [{ GITHUB_ACTIONS: 'false' }, { CONFIRM_NODE_RECOVERY: '' }, { EXPECTED_AWS_ACCOUNT_ID: '000000000000' }, { AWS_REGION: 'us-west-2' }, { NODE_ROLE_ARN: '' }, { NODE_ROLE_ARN: 'arn:aws:iam::000000000000:role/other' }, { RUNNER_TEMP: 'relative/path' }]) assert.throws(() => validateRequest({ ...env, ...change }));
  assert.ok(validateRequest(env).kubeconfig.endsWith('oficina-node-recovery.kubeconfig'));
});

test('two canonical Ready nodes are a no-op, with system rollouts required and no AWS mutation', async () => {
  const f = fixture(); f.data.nodes = readyNodes(); f.data.pods = [pod('Running', { nodeName: 'node-1' })];
  const result = await f.execute();
  assert.equal(result.status, 'noop-already-ready'); assert.equal(result.readyNodes, 2); assert.equal(f.mutations().length, 0);
  assert.equal(f.calls.filter(call => call.command === 'kubectl' && call.args[4] === 'rollout').length, 2);
});

test('wrong caller, cluster, role, group, ASG ownership or capacity never starts a refresh', async () => {
  const changes = [
    data => { data.identity.Account = '000000000000'; },
    data => { data.cluster.status = 'UPDATING'; },
    data => { data.cluster.arn = 'arn:aws:eks:us-east-1:000000000000:cluster/other'; },
    data => { data.group.status = 'DEGRADED'; },
    data => { data.group.nodeRole = role + '-wrong'; },
    data => { data.group.resources.autoScalingGroups = []; },
    data => { data.group.resources.autoScalingGroups.push({ name: 'another-asg' }); },
    data => { data.asg.Tags[0].Value = 'another-cluster'; },
    data => { data.asg.Tags.push({ ...data.asg.Tags[0] }); },
    data => { data.asg.AutoScalingGroupARN = data.asg.AutoScalingGroupARN.replace(SCOPE.account, '000000000000'); },
    data => { data.asg.AutoScalingGroupARN = data.asg.AutoScalingGroupARN.replace('autoScalingGroupName/', 'autoScalingGroupName:'); },
    data => { data.group.scalingConfig.desiredSize = 3; },
    data => { data.group.scalingConfig.maxSize = 3; },
    data => { data.asg.DesiredCapacity = 3; },
    data => { data.asg.MaxSize = 3; },
    data => { data.asg.DesiredCapacityType = 'vcpu'; },
    data => { data.asg.Instances[0].LifecycleState = 'Pending'; },
    data => { data.asg.Instances[0].HealthStatus = 'Unhealthy'; },
    data => { data.asg.Instances[0].ProtectedFromScaleIn = true; },
  ];
  for (const change of changes) { const f = fixture(); change(f.data); await assert.rejects(f.execute()); assert.equal(f.mutations().length, 0); }
});

test('a mismatched kubeconfig endpoint or partially registered nodes prevents all AWS writes', async () => {
  for (const nodes of [readyNodes().slice(0, 1), readyNodes().map(node => ({ ...node, status: { conditions: [] } })), readyNodes().map(node => ({ ...node, metadata: { labels: { 'eks.amazonaws.com/nodegroup': 'other' } } }))]) {
    const f = fixture(); f.data.nodes = nodes; await assert.rejects(f.execute(), /PARTIAL_OR_UNEXPECTED/); assert.equal(f.mutations().length, 0);
  }
  const f = fixture(); f.data.config = { 'current-context': SCOPE.context, clusters: [{ cluster: { server: 'https://other.example' } }] };
  await assert.rejects(f.execute(), /CONTEXT_MISMATCH/); assert.equal(f.mutations().length, 0);
});

test('only unassigned Pending stateless application pods may coexist with zero registered nodes', async () => {
  const f = fixture(); f.data.pods = [pod('Pending', { volumes: [{ name: 'cache', emptyDir: {} }, { name: 'configuration', secret: { secretName: 'fixture' } }] })];
  const result = await f.execute(); assert.equal(result.pendingApplicationPods, 1); assert.equal(result.status, 'refreshed'); assert.equal(f.mutations().length, 1);
});

test('Running, Unknown, completed or assigned application pods forbid replacement', async () => {
  for (const blocked of [pod('Running'), pod('Unknown'), pod('Succeeded'), pod('Pending', { nodeName: 'assigned-node' })]) {
    const f = fixture(); f.data.pods = [blocked]; await assert.rejects(f.execute(), /ACTIVE_OR_ASSIGNED/); assert.equal(f.mutations().length, 0);
  }
});

test('Pending pods with hostPath, PVC, ephemeral PVC or unapproved volume drivers forbid replacement', async () => {
  for (const volume of [{ name: 'host', hostPath: { path: '/data' } }, { name: 'claim', persistentVolumeClaim: { claimName: 'data' } }, { name: 'ephemeral', ephemeral: { volumeClaimTemplate: {} } }, { name: 'external', csi: { driver: 'external' } }]) {
    const f = fixture(); f.data.pods = [pod('Pending', { volumes: [volume] })]; await assert.rejects(f.execute(), /PERSISTENT_OR_HOST/); assert.equal(f.mutations().length, 0);
  }
});

test('all active refresh statuses and unknown status fail before starting another refresh', async () => {
  for (const Status of ['Pending', 'InProgress', 'Cancelling', 'RollbackInProgress', 'Baking', 'Unexpected']) {
    const f = fixture(); f.data.history = [{ AutoScalingGroupName: asgName, InstanceRefreshId: refreshId, Status }]; await assert.rejects(f.execute()); assert.equal(f.mutations().length, 0);
  }
});

test('rechecks scope, nodes, workloads and refresh activity immediately before the write', async () => {
  for (const race of ['node', 'pod', 'refresh']) {
    const f = fixture();
    if (race === 'node') f.data.nodes = count => count === 1 ? [] : readyNodes().slice(0, 1);
    if (race === 'pod') f.data.pods = count => count === 1 ? [] : [pod('Running')];
    if (race === 'refresh') f.data.history = count => count === 1 ? [] : [{ AutoScalingGroupName: asgName, InstanceRefreshId: refreshId, Status: 'InProgress' }];
    await assert.rejects(f.execute()); assert.equal(f.mutations().length, 0);
  }
});

test('the only mutation is one-at-a-time standard refresh on the derived ASG without capacity or IAM changes', async () => {
  const f = fixture(); const result = await f.execute();
  assert.equal(result.status, 'refreshed'); assert.equal(result.readyNodes, 2); assert.equal(result.refreshId, refreshId);
  assert.equal(f.mutations().length, 1);
  const args = f.mutations()[0].args;
  assert.equal(args[args.indexOf('--auto-scaling-group-name') + 1], asgName);
  assert.equal(args[args.indexOf('--strategy') + 1], 'Rolling');
  assert.deepEqual(JSON.parse(args[args.indexOf('--preferences') + 1]), PREFERENCES);
  assert.deepEqual(PREFERENCES, { MinHealthyPercentage: 50, MaxHealthyPercentage: 100, InstanceWarmup: 120, SkipMatching: false, AutoRollback: false });
  assert.equal(args.includes('--desired-configuration'), false);
  assert.ok(f.calls.filter(call => call.command === 'kubectl').every(call => ['config', 'get', 'rollout'].includes(call.args[4]) && (call.args[4] !== 'rollout' || call.args[5] === 'status')));
});

test('failed refreshes, readiness timeout and system rollout failures never trigger additional mutation', async () => {
  for (const kind of ['Failed', 'Cancelled', 'RollbackSuccessful', 'timeout', 'nodes-timeout', 'rollout', 'scaled-zero']) {
    const f = fixture();
    if (['Failed', 'Cancelled', 'RollbackSuccessful'].includes(kind)) f.data.progress = [kind];
    if (kind === 'timeout') f.data.progress = () => 'InProgress';
    if (kind === 'nodes-timeout') f.data.nodes = () => [];
    if (kind === 'rollout') f.data.failRollout = true;
    if (kind === 'scaled-zero') f.data.deploymentReplicas = 0;
    await assert.rejects(f.execute(), error => { assert.equal(error.message.includes('private-cli-fixture'), false); return true; });
    assert.equal(f.mutations().length, 1);
  }
});

test('waits for refresh read visibility without starting twice, but bounds missing-ID retries', async () => {
  const eventual = fixture(); eventual.data.missingRefreshReads = 1;
  assert.equal((await eventual.execute()).status, 'refreshed'); assert.equal(eventual.mutations().length, 1);
  const missing = fixture(); missing.data.missingRefreshReads = 100;
  await assert.rejects(missing.execute(), /STARTED_REFRESH_NOT_FOUND/); assert.equal(missing.mutations().length, 1);
});

test('CLI refuses local execution without printing supplied credential-like values', () => {
  const result = spawnSync(process.execPath, [fileURLToPath(new URL('./recover-empty-nodes.mjs', import.meta.url))], { encoding: 'utf8', env: { ...process.env, GITHUB_ACTIONS: 'false', AWS_SECRET_ACCESS_KEY: 'private-fixture-never-used' } });
  assert.equal(result.status, 1); assert.match(result.stderr, /ACTIONS_LINUX_ONLY/); assert.equal((result.stdout + result.stderr).includes('private-fixture-never-used'), false);
});
