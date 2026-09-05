terraform {
  required_version = ">= 1.10.0, < 2.0.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = ">= 6.42.0, < 7.0.0"
    }
    helm = {
      source  = "hashicorp/helm"
      version = "~> 2.17"
    }
    kubernetes = {
      source  = "hashicorp/kubernetes"
      version = "~> 3.2"
    }
  }

  # Configurado no CI:
  #   terraform init \
  #     -backend-config="bucket=oficina-tc3-tfstate-<accountId>" \
  #     -backend-config="key=oficina/kubernetes/terraform.tfstate" \
  #     -backend-config="region=us-east-1"
  backend "s3" {}
}
