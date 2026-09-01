data "aws_availability_zones" "available" {
  state = "available"

  filter {
    name   = "opt-in-status"
    values = ["opt-in-not-required"]
  }
}

data "aws_caller_identity" "current" {}

data "aws_partition" "current" {}

# checkov:skip=CKV_AWS_109:The administrative statement is limited to this account root in a KMS key policy.
# checkov:skip=CKV_AWS_111:ECR write cryptographic actions are constrained by caller account and ViaService.
# checkov:skip=CKV_AWS_356:In an attached KMS key policy Resource * means only the key carrying this policy.
data "aws_iam_policy_document" "ecr_kms" {
  statement {
    sid    = "EnableAccountAdministration"
    effect = "Allow"

    principals {
      type        = "AWS"
      identifiers = ["arn:${data.aws_partition.current.partition}:iam::${data.aws_caller_identity.current.account_id}:root"]
    }

    actions   = ["kms:*"]
    resources = ["*"]
  }

  statement {
    sid    = "AllowECRUseWithinAccount"
    effect = "Allow"

    principals {
      type        = "Service"
      identifiers = ["ecr.amazonaws.com"]
    }

    actions = [
      "kms:Decrypt",
      "kms:DescribeKey",
      "kms:Encrypt",
      "kms:GenerateDataKey*",
      "kms:ReEncrypt*",
    ]
    resources = ["*"]

    condition {
      test     = "StringEquals"
      variable = "kms:CallerAccount"
      values   = [data.aws_caller_identity.current.account_id]
    }

    condition {
      test     = "StringEquals"
      variable = "kms:ViaService"
      values   = ["ecr.${var.aws_region}.${data.aws_partition.current.dns_suffix}"]
    }
  }
}
