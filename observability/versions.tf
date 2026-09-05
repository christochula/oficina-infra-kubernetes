terraform {
  required_version = ">= 1.10.0, < 2.0.0"

  required_providers {
    datadog = {
      source  = "DataDog/datadog"
      version = ">= 3.40.0, < 5.0.0"
    }
  }

  backend "s3" {}
}
