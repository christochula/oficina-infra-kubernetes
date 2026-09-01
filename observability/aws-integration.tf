data "aws_caller_identity" "current" {
  count = var.enable_aws_integration ? 1 : 0
}

data "aws_partition" "current" {
  count = var.enable_aws_integration ? 1 : 0
}

resource "datadog_integration_aws_external_id" "oficina" {
  count = var.enable_aws_integration ? 1 : 0
}

resource "datadog_integration_aws_account" "oficina" {
  count = var.enable_aws_integration ? 1 : 0

  account_tags   = local.aws_account_tags
  aws_account_id = data.aws_caller_identity.current[0].account_id
  aws_partition  = data.aws_partition.current[0].partition

  aws_regions {
    include_only = [var.aws_region]
  }

  auth_config {
    aws_auth_config_role {
      role_name   = var.aws_integration_role_name
      external_id = datadog_integration_aws_external_id.oficina[0].id
    }
  }

  # Container logs and application traces are collected by the Datadog Agent;
  # no Lambda Forwarder or X-Ray crawler is enabled by this account integration.
  logs_config {
    lambda_forwarder {}
  }

  metrics_config {
    automute_enabled          = false
    collect_cloudwatch_alarms = true
    collect_custom_metrics    = false
    enabled                   = true

    namespace_filters {
      include_only = var.aws_integration_namespaces
    }
  }

  resources_config {
    cloud_security_posture_management_collection = false
    extended_collection                          = false
  }

  traces_config {
    xray_services {
      include_only = []
    }
  }

  depends_on = [aws_iam_role_policy_attachment.datadog_integration]
}

data "aws_iam_policy_document" "datadog_assume_role" {
  count = var.enable_aws_integration ? 1 : 0

  statement {
    sid     = "DatadogAssumeRole"
    effect  = "Allow"
    actions = ["sts:AssumeRole"]

    principals {
      type        = "AWS"
      identifiers = [var.datadog_aws_principal_arn]
    }

    condition {
      test     = "StringEquals"
      variable = "sts:ExternalId"
      values = [
        datadog_integration_aws_external_id.oficina[0].id
      ]
    }
  }
}

resource "aws_iam_role" "datadog_integration" {
  count = var.enable_aws_integration ? 1 : 0

  name                 = var.aws_integration_role_name
  description          = "Read-only role assumed by Datadog for Oficina CloudWatch metrics."
  assume_role_policy   = data.aws_iam_policy_document.datadog_assume_role[0].json
  max_session_duration = 3600
}

data "aws_iam_policy_document" "datadog_integration" {
  count = var.enable_aws_integration ? 1 : 0

  statement {
    sid    = "ReadCloudWatchMetricsAndAlarms"
    effect = "Allow"
    actions = [
      "cloudwatch:DescribeAlarms",
      "cloudwatch:GetMetricData",
      "cloudwatch:GetMetricStatistics",
      "cloudwatch:ListMetrics",
    ]
    # These read/list APIs do not support resource-level IAM permissions.
    resources = ["*"]
  }

  statement {
    sid    = "ReadOficinaServiceMetadata"
    effect = "Allow"
    actions = [
      "apigateway:GET",
      "cloudtrail:LookupEvents",
      "ec2:DescribeRegions",
      "lambda:List*",
      "rds:DescribeDBClusters",
      "rds:DescribeDBInstances",
      "rds:DescribeDBProxies",
      "rds:DescribeDBProxyEndpoints",
      "rds:DescribeDBProxyTargetGroups",
      "rds:DescribeDBProxyTargets",
      "rds:DescribeEvents",
      "rds:ListTagsForResource",
      "tag:GetResources",
      "tag:GetTagKeys",
      "tag:GetTagValues",
    ]
    # The documented metadata APIs are account-level read/list operations.
    resources = ["*"]
  }
}

resource "aws_iam_policy" "datadog_integration" {
  count = var.enable_aws_integration ? 1 : 0

  name        = "${var.aws_integration_role_name}Policy"
  description = "Minimum read-only permissions for API Gateway, Lambda, RDS and CloudWatch metrics."
  policy      = data.aws_iam_policy_document.datadog_integration[0].json
}

resource "aws_iam_role_policy_attachment" "datadog_integration" {
  count = var.enable_aws_integration ? 1 : 0

  role       = aws_iam_role.datadog_integration[0].name
  policy_arn = aws_iam_policy.datadog_integration[0].arn
}
