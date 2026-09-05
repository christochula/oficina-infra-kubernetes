variable "project_name" {
  description = "Prefixo curto para nomes de recursos."
  type        = string
  default     = "oficina"

  validation {
    condition     = can(regex("^[a-z][a-z0-9-]{1,20}$", var.project_name))
    error_message = "project_name deve ter 2-21 caracteres minusculos, numeros ou hifens."
  }
}

variable "environment" {
  description = "Ambiente: dev, homolog ou production."
  type        = string
  default     = "homolog"

  validation {
    condition     = contains(["dev", "homolog", "production"], var.environment)
    error_message = "environment deve ser dev, homolog ou production."
  }
}

variable "aws_region" {
  description = "Regiao AWS."
  type        = string
  default     = "us-east-1"
}

# --- AWS Academy ---------------------------------------------------------------
# O Learner Lab nao permite criar IAM role/policy/OIDC. Toda role necessaria
# (EKS cluster, node group, add-ons) usa a LabRole pre-existente, e o acesso
# administrativo ao cluster vai para a role voclabs do usuario do lab.

variable "lab_role_arn" {
  description = "ARN da LabRole do AWS Academy usada como role do cluster e dos nodes. Vazio = deriva de account_id."
  type        = string
  default     = ""
}

variable "principal_arn" {
  description = "ARN da role principal (voclabs) que recebe acesso cluster-admin via EKS access entry. Vazio = deriva de account_id."
  type        = string
  default     = ""
}

variable "kubernetes_version" {
  description = "Minor do EKS."
  type        = string
  default     = "1.32"

  validation {
    condition     = can(regex("^1\\.[0-9]+$", var.kubernetes_version))
    error_message = "kubernetes_version deve ser um minor como 1.32."
  }
}

variable "instance_type" {
  description = "Tipo de instancia dos nodes do EKS."
  type        = string
  default     = "t3.medium"
}

variable "node_min_size" {
  description = "Minimo de nodes."
  type        = number
  default     = 2
}

variable "node_desired_size" {
  description = "Quantidade desejada de nodes."
  type        = number
  default     = 2
}

variable "node_max_size" {
  description = "Maximo de nodes (limite para o HPA/escala)."
  type        = number
  default     = 4
}

variable "node_disk_size" {
  description = "Disco (GiB) por node."
  type        = number
  default     = 50
}

variable "application_port" {
  description = "Porta do container da API e do Service."
  type        = number
  default     = 3000
}

variable "ecr_image_tag_mutability" {
  description = "Mutabilidade das tags do ECR."
  type        = string
  default     = "MUTABLE"

  validation {
    condition     = contains(["MUTABLE", "IMMUTABLE"], var.ecr_image_tag_mutability)
    error_message = "ecr_image_tag_mutability deve ser MUTABLE ou IMMUTABLE."
  }
}

variable "ecr_force_delete" {
  description = "Permite apagar repositorio ECR nao vazio (util para destroy no lab)."
  type        = bool
  default     = true
}

variable "ecr_untagged_retention_days" {
  description = "Dias ate imagens sem tag expirarem no ECR."
  type        = number
  default     = 7
}

# --- Datadog Agent (Helm) ----------------------------------------------------
# Chaves lidas do AWS Secrets Manager pelo pipeline e passadas como TF_VAR_*.
# Nunca vao para tfvars nem para o state em texto plano (marcadas sensitive).

variable "datadog_enabled" {
  description = "Instala o Datadog Agent via Helm no cluster."
  type        = bool
  default     = true
}

variable "datadog_api_key" {
  description = "Datadog API key (ingestao). Vem do Secrets Manager em runtime."
  type        = string
  default     = ""
  sensitive   = true
}

variable "datadog_app_key" {
  description = "Datadog APP key. Vem do Secrets Manager em runtime."
  type        = string
  default     = ""
  sensitive   = true
}

variable "datadog_site" {
  description = "Site Datadog, ex: datadoghq.com."
  type        = string
  default     = "datadoghq.com"
}

variable "metrics_server_enabled" {
  description = "Instala o metrics-server (necessario para HPA)."
  type        = bool
  default     = true
}

variable "tags" {
  description = "Tags adicionais aplicadas aos recursos AWS."
  type        = map(string)
  default     = {}
}
