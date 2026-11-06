# Reboot the fixed existing Academy node pair

The workflow `Reboot existing empty EKS nodes` recovers account `810704675829`, region `us-east-1`, cluster `oficina-homolog-eks`, nodegroup `oficina-homolog-ng`, using the same `voclabs` caller and the same two existing EC2 instances owned by its canonical ASG. Its only actual AWS mutation is one batch `ec2 reboot-instances` with those two IDs. It does not resize, replace or terminate instances, change IAM, change launch templates, or apply Terraform.

Use after reviewing the bootstrap cause and confirming the Lab is active. The observed `nodeadm-config` timeout occurred while the Lab was inactive; kubelet never started. The official AMI boot units run config/run on normal boot, so this operation repeats normal bootstrap without invoking nodeadm manually. Permission was established by the native EC2 dry-run; the unsupported ASG refresh operation is not retained as another mode.

## Scope and permission checks

- Source SHA must remain HEAD of the selected branch and pass `Validate aws`, `Validate observability` and `Plan controls` in one complete CI execution.
- `EXPECTED_AWS_ACCOUNT_ID` and `NODE_ROLE_ARN` are read from `homolog` inside executing steps. Fresh session credentials are the three Environment Secrets; no alternative role is assumed.
- Cluster and nodegroup must be ACTIVE with the expected node role and desired size 2/max at least 4. The nodegroup must reference exactly one ASG with matching account/region/ownership tags and two distinct, healthy InService instances.
- DescribeInstances must return exactly those two IDs, owned by this account, both running in the cluster VPC with ASG/cluster/nodegroup ownership tags. IDs, IPs, launch-template ID/version and capacity are snapshotted and rechecked before the write.
- Kubeconfig context/endpoint must match the fixed cluster. Two canonical Ready nodes with provider IDs matching the existing pair cause a no-op. Every other nonzero registered-node state is refused.
- With zero registered nodes, non-system pods may exist only if strictly Pending, unassigned and stateless. Active, Unknown, completed or assigned pods and hostPath/PVC/ephemeral PVC/external CSI volumes are refused.
- An active ASG refresh is refused to avoid concurrency. Scope, node count and workload checks are repeated immediately before permission checking.

The native `reboot-instances --dry-run` must return a nonzero CLI exit with exactly the AWS error class `DryRunOperation`. AccessDenied, UnauthorizedOperation, unrecognized failure or an unexpected exit zero stops the workflow with no actual reboot. That permission-only call is immediately followed by one actual batch reboot, whose normally empty stdout is not parsed as JSON.

After reboot, success requires at least two canonical Ready nodes whose provider IDs identify the same EC2 IDs/AZs, available CoreDNS and metrics-server rollouts, and a final unchanged owned-instance snapshot. A timeout or refusal never triggers a retry, replacement, resizing or another mutation. CLI errors expose only static operation names and allowlisted error classes; raw output and arguments are not logged.

## Request only after review and green CI

Dispatch requires the selected branch, exact 40-character SHA and confirmation `REBOOT_EMPTY_OFICINA_NODES`. When the workflow is not dispatchable from the default branch, a tag `phase4/platform-reboot-nodes-<unique-id>` on that reviewed SHA provides the explicit reboot request. Repository Variable `DEPLOY_SOURCE_REF` identifies its source branch (default `feature/phase4-distributed`). Old recovery/refresh tags do not request this operation.

The source and tests must first be reviewed, committed and pass CI. The workflow shares platform deployment concurrency. It writes a separate temporary kubeconfig and removes it afterwards. Local CLI execution is rejected; tests use mocked CLIs with no network or AWS operations.

Primary reference: [EC2 RebootInstances and DryRun behavior](https://docs.aws.amazon.com/AWSEC2/latest/APIReference/API_RebootInstances.html).
