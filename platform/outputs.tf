output "irsa_contract" {
  description = "IAM role and Kubernetes service-account contract for controllers and the application."
  value = {
    aws_load_balancer_controller = {
      namespace       = local.namespaces.load_balancer
      service_account = local.service_accounts.load_balancer
      role_arn        = module.load_balancer_controller_irsa.arn
    }
    cluster_autoscaler = {
      namespace       = local.namespaces.autoscaler
      service_account = local.service_accounts.autoscaler
      role_arn        = module.cluster_autoscaler_irsa.arn
    }
    external_secrets = {
      namespace       = local.namespaces.external
      service_account = local.service_accounts.external
      role_arn        = module.external_secrets_irsa.arn
    }
    ebs_csi = {
      namespace       = local.namespaces.ebs_csi
      service_account = local.service_accounts.ebs_csi
      role_arn        = module.ebs_csi_irsa.arn
    }
    application_notifications = {
      namespace       = local.namespaces.application
      service_account = local.service_accounts.application
      role_arn        = module.application_notifications_irsa.arn
      queue_arn       = var.notification_queue_arn
    }
  }
}

output "application_notification_contract" {
  description = "IRSA contract consumed by the oficina-api Helm release to publish SQS notification events."
  value = {
    namespace       = local.namespaces.application
    service_account = local.service_accounts.application
    role_arn        = module.application_notifications_irsa.arn
    queue_arn       = var.notification_queue_arn
  }
}

output "external_secrets_contract" {
  description = "Non-secret contract consumed by application manifests and operational checks."
  value = {
    cluster_secret_store      = "aws-secrets-manager"
    allowed_secret_arns       = local.external_secret_arns
    database_secret_arn       = var.database_secret_arn
    jwt_secret_arn            = var.jwt_secret_arn
    application_secret_owner  = "oficina-api Helm release"
    datadog_namespace         = var.datadog_namespace
    datadog_kubernetes_secret = var.datadog_kubernetes_secret_name
    refresh_interval          = var.external_secret_refresh_interval
  }
}

output "datadog_agent_name" {
  description = "DatadogAgent custom-resource name."
  value       = "oficina"
}
