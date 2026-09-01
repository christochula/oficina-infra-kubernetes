data "terraform_remote_state" "aws" {
  backend = "s3"

  config = {
    bucket = var.aws_state_bucket
    key    = var.aws_state_key
    region = var.aws_state_region
  }
}

data "aws_eks_addon_version" "ebs_csi" {
  addon_name         = "aws-ebs-csi-driver"
  kubernetes_version = data.terraform_remote_state.aws.outputs.cluster_version
  most_recent        = true
}
