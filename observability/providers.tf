provider "aws" {
  region = var.aws_region

  default_tags {
    tags = {
      Project     = "oficina"
      Environment = var.environment
      ManagedBy   = "Terraform"
      Repository  = "oficina-infra-kubernetes"
      Stack       = "observability"
    }
  }
}

provider "datadog" {
  api_url = var.datadog_api_url

  # Authentication is read from DD_API_KEY and DD_APP_KEY. Do not put keys in
  # tfvars, provider configuration or Terraform state.
}
