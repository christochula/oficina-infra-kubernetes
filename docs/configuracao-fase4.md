# Plataforma compartilhada e observabilidade Fase 4

O cluster EKS, node group, metrics-server e Datadog Agent sao compartilhados. OS (`oficina-api`), Billing e Producao tem releases/deploys independentes, recursos proprios e credenciais de banco proprias. Este repositorio nao cria os bancos ou filas dos novos servicos nem depende dos states deles.

## Configuracao pelo usuario

No GitHub deste repositorio, configurar no **Environment homolog** os Secrets `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_SESSION_TOKEN` da sessao Academy. O deploy ocorre exclusivamente via GitHub Actions; [procedimento de plano e aplicacao](platform-actions.md). Variables de homolog:

| Nome | Valor |
| --- | --- |
| `EXPECTED_AWS_ACCOUNT_ID` | ID de 12 digitos da conta autorizada; o workflow compara com STS antes de criar recursos |
| `KUBERNETES_VERSION` | Minor explicito do EKS, sem default; verificar `STANDARD_SUPPORT` na regiao (ex.: `1.35`) |
| `CLUSTER_ROLE_ARN` | ARN da role pre-existente para o control plane EKS |
| `NODE_ROLE_ARN` | ARN da role pre-existente dos nodes; pode diferir da role do cluster |
| `PRINCIPAL_ARN` | Opcional; vazio deriva a role `voclabs` da conta atual |
| `LAB_ROLE_ARN` | Opcional; fallback Terraform para cluster/nodes quando overrides estao vazios |
| `PLATFORM_APPROVED_PLAN_RUN_ID` | ID da execucao **plan** revisada; preencher antes de solicitar apply do mesmo SHA |
| `DATADOG_ENABLED` | `true` para instalar Agent/Cluster Agent; ownership de dashboards/monitores depende do modo abaixo |
| `DATADOG_OBSERVABILITY_MODE` | `agent-only` para AWS nova com organizacao existente, sem novo state externo; `manage` para o proprietario canonico revisado |
| `DATADOG_SECRET_ID` | Default `oficina/datadog`, secret AWS JSON `{"api_key":"REPLACE","app_key":"REPLACE"}` |
| `API_BASE_URL` | URL HTTPS do Gateway, ex. `https://REPLACE.execute-api.us-east-1.amazonaws.com` |
| `DD_SITE` | Site Datadog, default `datadoghq.com` |
| `DATADOG_API_URL` | Default `https://api.datadoghq.com/`; ajustar ao site da conta |
| `SAGA_QUEUE_NAMES_JSON` | Array JSON dos nomes reais de filas comandos/respostas, ex. `["REPLACE-billing-commands","REPLACE-production-commands","REPLACE-os-events"]` |
| `SAGA_DLQ_NAMES_JSON` | Array JSON dos nomes reais das DLQs |

Configure tambem a **Repository Variable** `DEPLOY_SOURCE_REF`, padrao `feature/phase4-distributed`, para vincular tags operacionais a uma branch revisada. O workflow exige o SHA da tag igual ao HEAD dessa branch. O formulario manual exige `target_ref`/`target_sha` iguais a branch/commit do proprio disparo.

`aws/terraform.tfvars.example` e `observability/terraform.tfvars.example` documentam os inputs; deploys reais sao solicitados nos Actions. Chaves Datadog sao carregadas do secret canonico para `DD_API_KEY` e `DD_APP_KEY` e para Secret Kubernetes, nunca para `TF_VAR`/tfvars/plano/state. Outros valores marcados `sensitive` podem existir no state, por isso o backend exige criptografia e acesso restrito. `business_services` permite ajustar DD_SERVICE; defaults `oficina-api`, `oficina-billing-service`, `oficina-production-service`.

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

CI exige `terraform fmt`, `init -backend=false`, `validate` e TFLint; falhas TFLint nao sao ignoradas. Os checks obrigatorios existentes sao preservados: `Validate aws`, `Validate observability` e **`Plan aws`**, que continua executando um plano AWS real nos PRs do proprio repositorio depois das validacoes offline, sem apply e sem criar/alterar o bucket de backend. Se o bucket ainda nao existir, solicite primeiro um plano explicito por tag/manual no workflow `Terraform deploy`. O job adicional `Plan controls` testa offline os mecanismos de CI/plano/aprovacao/fingerprint e nao substitui o check `Plan aws`. Deploy exige os dois Validate e Plan controls verdes no mesmo CI; a aplicacao exige ainda um plano explicito revisado e identico. Nenhum recurso foi aplicado pela validacao local.

Apos usuario preencher as chaves e executar os deploys: gerar trafego de OS completo, simular falha de consumer/compensacao, consultar Saga e traces e conferir dashboard/monitores. Capturar evidencia real de logs, trace e DLQ para README/video. Os backends fornecem as filas e respectivos nomes/ARNs; copiar outputs para as Variables acima.
