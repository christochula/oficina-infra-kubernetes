# ECR com criptografia AES256 gerenciada pela AWS (sem CMK: CreateKey/PutKeyPolicy
# nao sao confiaveis no AWS Academy).

resource "aws_ecr_repository" "application" {
  name                 = "${local.name}-api"
  image_tag_mutability = var.ecr_image_tag_mutability
  force_delete         = var.ecr_force_delete

  encryption_configuration {
    encryption_type = "AES256"
  }

  image_scanning_configuration {
    scan_on_push = true
  }

  tags = local.common_tags
}

resource "aws_ecr_lifecycle_policy" "application" {
  repository = aws_ecr_repository.application.name

  policy = jsonencode({
    rules = [
      {
        rulePriority = 1
        description  = "Expira imagens sem tag apos o periodo configurado"
        selection = {
          tagStatus   = "untagged"
          countType   = "sinceImagePushed"
          countUnit   = "days"
          countNumber = var.ecr_untagged_retention_days
        }
        action = { type = "expire" }
      }
    ]
  })
}
