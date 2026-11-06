# Plano e aplicacao da plataforma

Toda criacao ou alteracao de recursos da plataforma e executada pelo workflow **Terraform deploy**. A validacao local usa fmt, init sem backend, validate, TFLint e testes; nao faz deploy. O workflow de PR **Terraform plan** preserva o check obrigatorio **Plan aws** com um plano AWS real apos suas proprias validacoes offline: somente PRs do proprio repositorio, sem apply, sem criar bucket ou alterar sua configuracao. Se o bucket nao existir, esse check falha ate o bootstrap por um plano explicitamente solicitado. O job offline **Plan controls** no CI testa os mecanismos e nao representa um plano AWS.

## Configuracao

Use o Environment `homolog` com as tres credenciais temporarias AWS Academy e as Variables documentadas em [configuracao da Fase 4](configuracao-fase4.md). Configure explicitamente `EXPECTED_AWS_ACCOUNT_ID`, `KUBERNETES_VERSION`, `CLUSTER_ROLE_ARN` e `NODE_ROLE_ARN`. O workflow verifica a conta e o suporte `STANDARD_SUPPORT` do minor EKS antes de planejar. O codigo Terraform suporta overrides separados para as roles e fallback para `lab_role_arn`; o acesso administrativo vazio deriva `arn:aws:iam::<conta-atual>:role/voclabs`, sem ID de conta fixo no codigo.

`DEPLOY_SOURCE_REF` e uma Repository Variable usada no evento de tag, com padrao `feature/phase4-distributed`. Credenciais e demais configuracoes de runtime ficam em `homolog`. Datadog permanece desabilitado por padrao; habilitar exige `DATADOG_ENABLED=true`, Secret AWS real contendo `api_key` e `app_key`, e a URL HTTPS real do Gateway para Synthetic. Ausencia de chave nao e convertida silenciosamente em uma solicitacao para remover um Agent ja existente: qualquer plano com delete/replace e bloqueado.

## Solicitar o plano

1. Publique a branch revisada e aguarde os checks `Validate aws`, `Validate observability` e `Plan controls` de uma unica execucao `ci.yml` bem-sucedida para o SHA atual. `Plan aws` continua sendo o plano real de PR, em workflow separado; ele nao entra no gate do proprio plano, evitando uma dependencia circular.
2. Execute `Terraform deploy` na mesma branch com `operation=plan`, `target_ref=<branch>` e `target_sha=<SHA completo>`. Se o GitHub ainda nao disponibilizar o formulario porque o workflow esta apenas na feature, uma tag `phase4/platform-plan-<identificador>` apontando para o HEAD da `DEPLOY_SOURCE_REF` dispara o mesmo plano. O push dessa tag inicia trabalho AWS.
3. Apos o gate CI, o workflow confere a conta e pode criar o bucket `oficina-tc3-tfstate-<conta>`, com AES256, versionamento e bloqueio de acesso publico. Essa preparacao do backend e a unica criacao permitida na operacao plan. Bucket existente com KMS conserva sua criptografia; apply exige backend existente e protegido. Terraform usa lockfile S3 e as keys `oficina/kubernetes/terraform.tfstate` e `oficina/observability/terraform.tfstate`.
4. Revise o artefato `platform-plan-<SHA>-<run-id>` e os custos/recursos. Contem `aws-plan.txt`, `aws-review.json` e `scope.json`; se Datadog estiver habilitado, inclui os equivalentes de observability. O texto vem de `terraform show -no-color` e preserva as marcacoes de valores sensitive. Binarios de plano, state e JSON bruto do Terraform nunca sao artifacts.

Nao sao criados EKS, nodes ou releases Helm na operacao plan. Remocoes ou substituicoes de recursos fazem o workflow falhar antes da publicacao de um plano aprovavel.

## Solicitar a aplicacao

1. Depois da revisao, configure `PLATFORM_APPROVED_PLAN_RUN_ID` em `homolog` com o ID da execucao de plano aprovada.
2. Solicite `operation=apply` com os mesmos SHA/branch, ou publique uma tag `phase4/platform-apply-<identificador>` para o mesmo HEAD da branch configurada. Nao e preciso alterar a branch padrao nem integrar a feature a `main`.
3. Antes de obter credenciais AWS, o workflow verifica novamente o CI e confirma pela API GitHub que o run aprovado pertence ao mesmo repositorio, SHA, workflow `deploy.yml`, operacao plan e branch/tag autorizada, foi bem-sucedido e tem artifact valido.
4. O workflow regenera os planos, compara todo texto e o hash canonico dos recursos/outputs e verifica o mesmo escopo Datadog. O hash inclui alteracoes em atributos sensitive sem publicar seus valores. Qualquer diferenca exige novo plano e revisao; todos os stacks sao comparados antes de aplicar qualquer um deles.
5. Apenas os planos binarios regenerados e verificados sao aplicados, com lock S3. A verificacao final usa kubectl no patch oficial do mesmo minor EKS, aguarda nodes Ready e publica os outputs nao sensiveis no log/resumo.

Troca de conta, roles, versao, configuracao de Datadog, fila ou alteracao real da infraestrutura pode invalidar o plano anterior. A aplicacao do stack AWS e do stack Datadog sao operacoes distintas do Terraform; uma falha no segundo exige analisar o estado e gerar/revisar novo plano para a recuperacao.

## Validacao local sem AWS

```text
node --test scripts/*.test.mjs
terraform -chdir=aws fmt -check -recursive
terraform -chdir=aws init -backend=false -input=false -lockfile=readonly
terraform -chdir=aws validate
terraform -chdir=observability fmt -check -recursive
terraform -chdir=observability init -backend=false -input=false -lockfile=readonly
terraform -chdir=observability validate
tflint --init --config=.tflint.hcl
tflint --chdir=aws --config=<caminho-absoluto>/.tflint.hcl
tflint --chdir=observability --config=<caminho-absoluto>/.tflint.hcl
```

Os testes incluem controle de origem/CI, aprovacao de run, alteracao sensitive, deletes/replaces e execucao do controlador de shell com Terraform simulado: plano nao aplica; drift de texto, hash ou escopo impede aplicar qualquer stack. Nenhum desses testes usa AWS real.

Referencias: [EKS describe-cluster-versions e versionStatus](https://docs.aws.amazon.com/cli/latest/reference/eks/describe-cluster-versions.html), [Terraform show e cuidados com JSON sensitive](https://developer.hashicorp.com/terraform/cli/commands/show).
