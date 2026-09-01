check "production_internal_alb_uses_tls" {
  assert {
    condition     = var.environment != "production" || var.alb_certificate_arn != null
    error_message = "production requires alb_certificate_arn so API Gateway to ALB uses TLS."
  }
}
