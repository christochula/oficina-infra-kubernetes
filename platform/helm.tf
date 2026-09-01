resource "helm_release" "aws_load_balancer_controller" {
  name       = "aws-load-balancer-controller"
  namespace  = local.namespaces.load_balancer
  repository = "https://aws.github.io/eks-charts"
  chart      = "aws-load-balancer-controller"
  version    = var.aws_load_balancer_controller_chart_version

  atomic          = true
  cleanup_on_fail = true
  timeout         = 900
  wait            = true

  values = [yamlencode({
    clusterName  = local.cluster_name
    region       = var.aws_region
    vpcId        = data.terraform_remote_state.aws.outputs.vpc_id
    replicaCount = 2
    serviceAccount = {
      create = true
      name   = local.service_accounts.load_balancer
      annotations = {
        "eks.amazonaws.com/role-arn" = module.load_balancer_controller_irsa.arn
      }
    }
    enableShield = false
    resources = {
      requests = {
        cpu    = "100m"
        memory = "128Mi"
      }
      limits = {
        memory = "512Mi"
      }
    }
    podDisruptionBudget = {
      maxUnavailable = 1
    }
  })]
}

resource "helm_release" "metrics_server" {
  name       = "metrics-server"
  namespace  = "kube-system"
  repository = "https://kubernetes-sigs.github.io/metrics-server/"
  chart      = "metrics-server"
  version    = var.metrics_server_chart_version

  atomic          = true
  cleanup_on_fail = true
  timeout         = 600
  wait            = true

  values = [yamlencode({
    replicas = 2
    podDisruptionBudget = {
      enabled      = true
      minAvailable = 1
    }
    resources = {
      requests = {
        cpu    = "100m"
        memory = "200Mi"
      }
      limits = {
        memory = "400Mi"
      }
    }
  })]
}

resource "helm_release" "cluster_autoscaler" {
  name       = "cluster-autoscaler"
  namespace  = local.namespaces.autoscaler
  repository = "https://kubernetes.github.io/autoscaler"
  chart      = "cluster-autoscaler"
  version    = var.cluster_autoscaler_chart_version

  atomic          = true
  cleanup_on_fail = true
  timeout         = 600
  wait            = true

  values = [yamlencode({
    cloudProvider = "aws"
    awsRegion     = var.aws_region
    autoDiscovery = {
      clusterName = local.cluster_name
    }
    image = {
      tag = var.cluster_autoscaler_image_tag
    }
    serviceAccount = {
      create = true
      name   = local.service_accounts.autoscaler
      annotations = {
        "eks.amazonaws.com/role-arn" = module.cluster_autoscaler_irsa.arn
      }
    }
    extraArgs = {
      "balance-similar-node-groups"   = "true"
      "skip-nodes-with-local-storage" = "false"
      "skip-nodes-with-system-pods"   = "false"
      "scale-down-unneeded-time"      = "5m"
      "scale-down-delay-after-add"    = "5m"
    }
    replicaCount = 2
    podDisruptionBudget = {
      maxUnavailable = 1
    }
    resources = {
      requests = {
        cpu    = "100m"
        memory = "300Mi"
      }
      limits = {
        memory = "600Mi"
      }
    }
  })]
}

resource "helm_release" "external_secrets" {
  name             = "external-secrets"
  namespace        = local.namespaces.external
  create_namespace = true
  repository       = "https://charts.external-secrets.io"
  chart            = "external-secrets"
  version          = var.external_secrets_chart_version

  atomic          = true
  cleanup_on_fail = true
  timeout         = 900
  wait            = true

  values = [yamlencode({
    installCRDs  = true
    replicaCount = 2
    serviceAccount = {
      create = true
      name   = local.service_accounts.external
      annotations = {
        "eks.amazonaws.com/role-arn" = module.external_secrets_irsa.arn
      }
    }
    webhook = {
      replicaCount = 2
    }
    certController = {
      replicaCount = 2
    }
    resources = {
      requests = {
        cpu    = "50m"
        memory = "128Mi"
      }
      limits = {
        memory = "256Mi"
      }
    }
  })]
}

resource "helm_release" "datadog_operator" {
  name             = "datadog-operator"
  namespace        = var.datadog_namespace
  create_namespace = true
  repository       = "https://helm.datadoghq.com"
  chart            = "datadog-operator"
  version          = var.datadog_operator_chart_version

  atomic          = true
  cleanup_on_fail = true
  timeout         = 900
  wait            = true

  values = [yamlencode({
    installCRDs  = true
    replicaCount = 2
    resources = {
      requests = {
        cpu    = "100m"
        memory = "128Mi"
      }
      limits = {
        memory = "512Mi"
      }
    }
  })]
}

resource "helm_release" "platform_resources" {
  name      = "oficina-platform-resources"
  namespace = "default"
  chart     = "${path.module}/charts/platform-resources"

  atomic          = true
  cleanup_on_fail = true
  timeout         = 900
  wait            = true

  values = [yamlencode({
    environment = var.environment
    awsRegion   = var.aws_region

    externalSecrets = {
      namespace          = local.namespaces.external
      serviceAccountName = local.service_accounts.external
      refreshInterval    = var.external_secret_refresh_interval
      datadogSecretArn   = var.datadog_secret_arn
      datadogNamespace   = var.datadog_namespace
      datadogSecretName  = var.datadog_kubernetes_secret_name
    }

    datadog = {
      site                    = var.datadog_site
      namespace               = var.datadog_namespace
      secretName              = var.datadog_kubernetes_secret_name
      clusterName             = local.cluster_name
      collectAllContainerLogs = var.datadog_collect_all_container_logs
      tolerateAllNodes        = var.datadog_agent_tolerate_all_nodes
    }
  })]

  depends_on = [
    helm_release.external_secrets,
    helm_release.datadog_operator,
  ]
}
