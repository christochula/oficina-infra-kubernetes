# Validacao local da plataforma

Data: 2026-11-05. Estas evidencias sao locais; nao comprovam criacao de recursos ou execucao remota de Actions.

| Verificacao | Resultado |
| --- | --- |
| `node --test scripts/*.test.mjs` | 19 testes passaram |
| Terraform 1.16.0 fmt check, stacks aws/observability | Passou |
| init com `-backend=false -input=false -lockfile=readonly`, ambos os stacks | Passou, sem backend remoto |
| Terraform validate, ambos os stacks | Passou |
| TFLint 0.53.0 init + lint, ambos os stacks | Passou |
| actionlint 1.7.12, ci.yml/plan.yml/deploy.yml | Passou; validacao de YAML/expressoes, shellcheck/pyflakes opcionais desabilitados localmente |
| Bash syntax check em todos scripts .sh | Passou |
| git diff --check | Passou |

Os testes bloqueiam CI parcial ou de outro SHA/branch/repositorio, plano aprovado de outro workflow/operacao, artifact expirado, drift sensitive, delete/replace, divergencia de texto/fingerprint/escopo e criacao do bucket por PR/apply. O controlador foi exercitado com Terraform e AWS simulados, sem chamadas reais a esses servicos.

A leitura da configuracao remota de branch protection confirmou os contextos `Validate aws`, `Validate observability` e `Plan aws`; eles foram preservados. `Plan aws` continua sendo um plano AWS real de PR, enquanto o novo `Plan controls` testa a logica offline e integra o gate dos deploys por tag/manual.

Nenhum terraform plan/apply real, criacao S3, deploy EKS, commit ou push foi executado por esta validacao. Os planos reais, revisao e aplicacao deverao ocorrer exclusivamente nos GitHub Actions; links e outputs desses runs completarao a evidencia de deploy.
