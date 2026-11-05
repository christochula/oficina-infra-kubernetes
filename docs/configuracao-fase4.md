# Plataforma compartilhada e observabilidade Fase 4

O cluster EKS, node group, metrics-server e Datadog Agent sao compartilhados. OS (`oficina-api`), Billing e Producao tem releases/deploys independentes, recursos proprios e credenciais de banco proprias. Este repositorio nao cria os bancos ou filas dos novos servicos nem depende dos states deles.

## Configuracao pelo usuario

No GitHub deste repositorio, configurar Secrets `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_SESSION_TOKEN` da sessao Academy. Variables:

| Nome | Valor |
| --- | --- |
| `DATADOG_ENABLED` | `true` para instalar Agent/Cluster Agent e aplicar dashboards/monitores |
| `DATADOG_SECRET_ID` | Default `oficina/datadog`, secret AWS JSON `{"api_key":"REPLACE","app_key":"REPLACE"}` |
| `API_BASE_URL` | URL HTTPS do Gateway, ex. `https://REPLACE.execute-api.us-east-1.amazonaws.com` |
| `DD_SITE` | Site Datadog, default `datadoghq.com` |
| `DATADOG_API_URL` | Default `https://api.datadoghq.com/`; ajustar ao site da conta |
| `SAGA_QUEUE_NAMES_JSON` | Array JSON dos nomes reais de filas comandos/respostas, ex. `["REPLACE-billing-commands","REPLACE-production-commands","REPLACE-os-events"]` |
| `SAGA_DLQ_NAMES_JSON` | Array JSON dos nomes reais das DLQs |

Copiar `aws/terraform.tfvars.example` e `observability/terraform.tfvars.example` para arquivos ignorados ao executar localmente. Chaves Datadog vem do ambiente `TF_VAR_datadog_api_key`, `TF_VAR_datadog_app_key` / `DD_API_KEY`, `DD_APP_KEY`, nunca de tfvars versionado. `business_services` permite ajustar DD_SERVICE; defaults `oficina-api`, `oficina-billing-service`, `oficina-production-service`.

State AWS: `oficina/kubernetes/terraform.tfstate`; state Datadog: `oficina/observability/terraform.tfstate`; bucket de lab `oficina-tc3-tfstate-REPLACE_ACCOUNT_ID`. States dos servicos nao devem apontar para essas keys.

## Contrato de telemetria

Todos os servicos emitem `env`, `service`, `version`. Logs estruturados carregam `correlation_id`, `saga_id`, `event_id`, `step` e resultado. Propagar contexto de trace nas chamadas HTTP e atributos de mensagens; correlacao por ID sozinha nao cria automaticamente spans distribuidos.

| Metrica | Tipo e tags |
| --- | --- |
| `oficina.api.request.duration_ms` | Distribution ms; `service`, `method`, `status_code` |
| `oficina.saga.transitions` | Count; `step`, `status` |
| `oficina.saga.compensations` | Count; `step`, `status` |
| `oficina.saga.pending_age_seconds` | Gauge; `step`; idade somente de trabalho automatico pendente, excluindo espera por aprovacao e pagamento humanos |
| `oficina.messaging.processed`, `oficina.messaging.failed` | Count; `service`, `queue` |

O dashboard mostra os tres servicos, transicoes/compensacoes e filas. Monitores adicionais: latencia por servico, etapa automatica parada por mais de 300 segundos, falhas de consumer, idade das mensagens e DLQs nao vazias. Monitores de filas so sao criados quando os nomes forem preenchidos.

Metricas `aws.sqs.approximate_age_of_oldest_message` e `aws.sqs.approximate_number_of_messages_visible` exigem a [integracao AWS/SQS do Datadog](https://docs.datadoghq.com/integrations/amazon-sqs/), habilitada pelo usuario com coleta SQS/CloudWatch. O Agent no Kubernetes sozinho nao coleta metricas AWS SQS. Tags de fila usam `queuename`; recursos AWS devem ter tag `env=homolog` para o filtro do dashboard. Caso as permissoes do Academy impecam essa integracao, usar CloudWatch/SQS console como evidencia das filas e manter telemetria customizada dos consumers no Datadog; nao declarar integracao ativa sem dados.

## Verificacao e entrega

CI exige `terraform fmt`, `init -backend=false`, `validate` e TFLint; falhas TFLint nao sao mais ignoradas. Checks a configurar como obrigatorios: `Validate aws` e `Validate observability`, mais `Plan aws` conforme o nome publicado pelo workflow de plan. Deploy valida configuracao antes de aplicar. Nenhum recurso foi aplicado por esta implementacao.

Apos usuario preencher as chaves e executar os deploys: gerar trafego de OS completo, simular falha de consumer/compensacao, consultar Saga e traces e conferir dashboard/monitores. Capturar evidencia real de logs, trace e DLQ para README/video. Os backends fornecem as filas e respectivos nomes/ARNs; copiar outputs para as Variables acima.
