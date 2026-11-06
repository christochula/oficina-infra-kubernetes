# Recovery of the fixed empty Academy nodegroup

The workflow `Recover empty EKS nodegroup` is an operational recovery for account `810704675829`, region `us-east-1`, cluster `oficina-homolog-eks` and nodegroup `oficina-homolog-ng`. It does not change Terraform, IAM, launch templates or desired capacity. Its only AWS mutation is one `autoscaling start-instance-refresh` on the single ASG returned by that nodegroup.

Use only after reviewing the bootstrap cause and confirming the Academy Lab is active. The observed incident was `nodeadm-config` timing out while the Lab was inactive; instances remained EC2-healthy but kubelet never started. This workflow replaces those instances so the same managed bootstrap runs again during the active Lab session.

## Controls

- Exact source SHA must still be HEAD of the reviewed source branch and pass `Validate aws`, `Validate observability` and `Plan controls` in one complete CI run.
- `EXPECTED_AWS_ACCOUNT_ID` and `NODE_ROLE_ARN` are read from the `homolog` Environment inside the executing steps; temporary AWS credentials are the three Environment Secrets.
- Cluster and nodegroup must be ACTIVE, with the expected node role, desired capacity 2 and maximum at least 4. The ASG must be the only canonical group, have matching account/region and all three EKS ownership tags, and contain exactly two healthy InService instances without scale-in protection.
- Kubeconfig context and endpoint must match the fixed cluster. Two canonical Ready nodes cause a no-op; every other nonzero registered-node state is refused.
- Before replacement there must be zero registered nodes. Non-system pods are allowed only if strictly Pending, unassigned, and using no persistent/host/unknown volume types. Running, Unknown, completed, assigned, hostPath, PVC, ephemeral PVC and external CSI workloads are refused.
- Existing active refreshes are refused. Scope, node count, workloads and refresh state are rechecked immediately before the single mutation.

The fixed rolling preferences are `MinHealthyPercentage=50`, `MaxHealthyPercentage=100`, `InstanceWarmup=120`, `SkipMatching=false`, `AutoRollback=false`. Desired capacity is exactly two, so a replacement can terminate one instance before launching one replacement; the request does not ask for surge capacity. No desired-configuration, ASG resizing, manual termination, cancellation or rollback command is issued.

Success requires the refresh to become Successful, at least two canonical Ready nodes, and successful read-only rollout checks for `kube-system/deployment/coredns` and `metrics-server`, with nonzero available replicas. A timeout or failure is reported without issuing another mutation. The workflow shares platform deployment concurrency and never overlaps a Terraform deployment in that group.

## Request after source review and successful CI

Manual dispatch requires the selected branch, its exact 40-character SHA, and confirmation `RECOVER_EMPTY_OFICINA_NODES`. When the new workflow is not yet dispatchable from the default branch, a reviewed tag `phase4/platform-recover-nodes-<unique-id>` on that same SHA expresses the same operational confirmation. Tags derive the source branch from Repository Variable `DEPLOY_SOURCE_REF` (default `feature/phase4-distributed`).

The source and tests must be reviewed, committed and pass CI before publishing a recovery tag. No action is authorized merely by this document. The runner keeps a separate temporary kubeconfig, removes it afterwards and logs only public scope/readiness metadata.

Validation uses `node --test scripts/recover-empty-nodes.test.mjs` with mocked CLI calls and no network. The platform CI wildcard includes these tests. Local CLI execution is rejected.

Primary references: [StartInstanceRefresh](https://docs.aws.amazon.com/autoscaling/ec2/APIReference/API_StartInstanceRefresh.html), [refresh preferences](https://docs.aws.amazon.com/autoscaling/ec2/APIReference/API_RefreshPreferences.html), [refresh statuses](https://docs.aws.amazon.com/autoscaling/ec2/APIReference/API_InstanceRefresh.html).
