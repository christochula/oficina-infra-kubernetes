resource "aws_lb" "application" {
  name                       = substr("${local.name}-api", 0, 32)
  internal                   = true
  load_balancer_type         = "application"
  security_groups            = [aws_security_group.internal_alb.id]
  subnets                    = module.vpc.private_subnets
  enable_deletion_protection = var.alb_deletion_protection
  drop_invalid_header_fields = true
  idle_timeout               = 60
}

resource "aws_lb_target_group" "application" {
  name_prefix = substr("${var.project_name}-", 0, 6)
  port        = var.application_port
  protocol    = "HTTP"
  target_type = "ip"
  vpc_id      = module.vpc.vpc_id

  deregistration_delay = 30

  health_check {
    enabled             = true
    healthy_threshold   = 2
    unhealthy_threshold = 3
    interval            = 30
    timeout             = 5
    path                = var.health_check_path
    protocol            = "HTTP"
    matcher             = "200-399"
  }

  lifecycle {
    create_before_destroy = true
  }
}

resource "aws_lb_listener" "application" {
  load_balancer_arn = aws_lb.application.arn
  port              = local.listener_port
  protocol          = local.listener_protocol
  certificate_arn   = var.alb_certificate_arn
  ssl_policy        = var.alb_certificate_arn == null ? null : var.alb_ssl_policy

  default_action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.application.arn
  }
}
