terraform {
  required_version = ">= 1.10.0, < 2.0.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = ">= 6.0.0, < 7.0.0"
    }
    datadog = {
      source  = "DataDog/datadog"
      version = ">= 4.18.0, < 5.0.0"
    }
  }

  # Datadog resources intentionally use their own state and lifecycle.
  backend "s3" {}
}
