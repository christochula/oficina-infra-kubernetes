provider "datadog" {
  api_url = var.datadog_api_url

  # Autenticacao vem de DD_API_KEY e DD_APP_KEY (env do pipeline, lidas do
  # AWS Secrets Manager). Nunca em tfvars, provider config ou state.
}
