# Datadog por GitHub Actions

O primeiro plano com Datadog habilitado valida o par de chaves na API oficial e inicializa somente o secret AWS `oficina/datadog`, se ainda nao houver valores. Essa inicializacao e uma escrita explicita por Actions, anterior ao plano Terraform. Credenciais existentes iguais sao preservadas; divergencia exige revisao separada, sem rotacao automatica.

No Environment `homolog` deste repositorio, configurar:

| Entrada | Valor ou finalidade |
| --- | --- |
| Secrets `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_SESSION_TOKEN` | Sessao Academy renovada |
| Secrets `DATADOG_API_KEY`, `DATADOG_APP_KEY` | Par ativo da organizacao US1; formatos atuais `ddapp_` sao aceitos |
| `EXPECTED_AWS_ACCOUNT_ID` | Conta Academy revisada |
| `DATADOG_ENABLED` | `true` |
| `DATADOG_SECRET_ID` | `oficina/datadog` |
| `DD_SITE` | `datadoghq.com` |
| `DATADOG_API_URL` | `https://api.datadoghq.com/` |
| `API_BASE_URL` | Gateway HTTPS real, sem barra final |
| `SAGA_QUEUE_NAMES_JSON`, `SAGA_DLQ_NAMES_JSON` | Nomes das filas, se a integracao AWS Datadog estiver disponivel |
| `ADDON_VERSIONS_JSON` | Mapa opcional de versoes revisadas para `coredns`, `kube-proxy`, `vpc-cni`; validar compatibilidade com o minor EKS |
| `MANAGE_METRIC_TAG_CONFIGURATION` | `false`; flag global para cinco metricas, incluindo counts que precisam existir antes de habilitar |
| `ENABLE_DISTRIBUTION_PERCENTILES` | `false` inicialmente; `true` habilita apenas os percentis das duas distributions ja existentes |

As Variables de Environment prevalecem sobre as do repositorio. O workflow ja passa `TF_VAR_kubernetes_namespace=oficina-fase4`; o Agent tem namespace separado `datadog`, sem renomear o namespace legado.

O chart Agent esta fixado em `3.270.0`. Antes de habilitar Datadog numa plataforma existente, preencher `ADDON_VERSIONS_JSON` com as versoes instaladas observadas para manter a instalacao de telemetria separada de upgrades de rede/DNS. Actions verifica cada versao solicitada em `DescribeAddonVersions` para o EKS selecionado; entradas omitidas usam o fallback compativel mais recente do provider.

Depois do CI completo no novo HEAD, solicitar `Terraform deploy` com `operation=plan`, `target_ref=feature/phase4-distributed` e `target_sha` completo. A alternativa por tag e `phase4/platform-plan-*`. Revisar o texto e fingerprint dos dois stacks, `aws` e `observability`: nenhum delete/replace e aceito. Configurar `PLATFORM_APPROVED_PLAN_RUN_ID` com o novo run revisado e solicitar `apply` no mesmo SHA/ref e escopo Datadog. O plano antigo com Datadog desabilitado nao pode aprovar esse apply.

O apply requer o EKS base ja existente e ACTIVE. Depois de comparar texto/fingerprint de todos os stacks, o Actions copia o par canonico para `datadog/datadog-credentials` com arquivos temporarios privados e kubeconfig isolado. Helm recebe apenas `apiKeyExistingSecret`/`appKeyExistingSecret`; o provider Datadog usa variaveis de ambiente, sem chaves em `TF_VAR`, plano ou state. Nenhum JSON de segredo, state ou plano binario e publicado em artifacts.

Os tres aplicativos enviam APM TCP8126 e DogStatsD UDP8125 ao IP do node; o Agent habilita ambas as portas host. No OS, configurar `DD_ENABLED=true` antes do deploy. Billing ja habilita trace/metricas no chart; Production tambem deve manter as flags explicitas. Renovar os tres Secrets AWS de `homolog` e redeployar cada aplicativo por seu workflow para recarregar as credenciais.

Verificacoes de leitura apos apply:

```sh
kubectl -n datadog get daemonsets,deployments,pods
kubectl -n datadog rollout status daemonset/datadog --timeout=5m
kubectl -n datadog rollout status deployment/datadog-cluster-agent --timeout=5m
kubectl get deployments -n oficina-fase4
kubectl top nodes
kubectl top pods -A
```

Confirmar no Datadog hosts, logs e traces dos tres services com `env:homolog`, apos gerar trafego na aplicacao. Dois nodes t3.medium atendem atualmente seis pods de aplicacao; conferir requests/limites e consumo do Agent/Cluster Agent nos comandos acima antes de gravar. Presenca de pods nao comprova ingestao externa.

O dashboard usa gauges customizadas `oficina.messaging.queue.visible/inflight/delayed`, coletadas pelo OS a cada 30s para inbox e DLQ com tags `queue`/`role`. As consultas usam `max` por fila para nao somar amostras de replicas. Monitores SQS nativos opcionais ainda dependem da integracao AWS Datadog; os nomes de filas nao configuram essa integracao. Depois da ingestao de `oficina.api.request.duration_ms` e `oficina.service_orders.status_duration_ms`, manter `MANAGE_METRIC_TAG_CONFIGURATION=false` e configurar `ENABLE_DISTRIBUTION_PERCENTILES=true` para habilitar somente essas duas distributions. Revisar novo plano antes do apply; nao habilitar a flag global enquanto as tres metricas count ainda nao existirem.

Referencias oficiais: [validacao API/App](https://docs.datadoghq.com/api/latest/key-management/validate-api-and-application-keys/), [Secret existente no chart Datadog](https://github.com/DataDog/helm-charts/blob/main/charts/datadog/values.yaml).
