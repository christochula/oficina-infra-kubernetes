mock_provider "aws" {
  mock_data "aws_caller_identity" {
    defaults = { account_id = "111111111111" }
  }
  mock_data "aws_partition" {
    defaults = { partition = "aws" }
  }
  mock_data "aws_subnets" {
    defaults = { ids = ["subnet-00000001", "subnet-00000002", "subnet-00000003"] }
  }
  mock_data "aws_eks_addon_version" {
    defaults = { version = "v1.0.0-eksbuild.1" }
  }
}
mock_provider "kubernetes" {}
mock_provider "helm" {}

variables {
  kubernetes_version     = "1.35"
  metrics_server_enabled = false
  datadog_enabled        = false
}

override_data {
  target = data.aws_subnet.each["subnet-00000001"]
  values = { id = "subnet-00000001", availability_zone = "us-east-1a", availability_zone_id = "use1-az3" }
}
override_data {
  target = data.aws_subnet.each["subnet-00000002"]
  values = { id = "subnet-00000002", availability_zone = "us-east-1e", availability_zone_id = "use1-az1" }
}
override_data {
  target = data.aws_subnet.each["subnet-00000003"]
  values = { id = "subnet-00000003", availability_zone = "us-east-1b", availability_zone_id = "use1-az2" }
}

run "exclude_physical_zone_even_when_letter_changes" {
  command = plan
  assert {
    condition     = toset(output.subnet_ids) == toset(["subnet-00000002", "subnet-00000003"])
    error_message = "A new account must exclude use1-az3 and retain supported zones, including a zone named us-east-1e."
  }
  assert {
    condition     = toset(aws_eks_cluster.this.vpc_config[0].subnet_ids) == toset(output.subnet_ids) && toset(aws_eks_node_group.this.subnet_ids) == toset(output.subnet_ids)
    error_message = "Cluster and nodes must use the same supported subnet selection."
  }
}
