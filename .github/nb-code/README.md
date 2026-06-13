# NB-Code MVP1 Base

Este diretorio define a base operacional do MVP1 para o fluxo do agente NB-Code.

## Objetivo
Padronizar entrada, saida e validacoes minimas para as primeiras entregas do projeto.

## Arquivos
- `contracts/request.schema.json`: contrato minimo de entrada do pedido.
- `contracts/response.schema.json`: contrato minimo de saida do agente.
- `checklists/mvp1-delivery-checklist.md`: checklist de qualidade e seguranca.

## Fluxo MVP1
1. Receber um pedido no formato do contrato de entrada.
2. Coletar contexto minimo: arquivo atual, selecao e hints do workspace.
3. Executar alteracoes incrementais (ou analise), com rastreabilidade por acao.
4. Registrar validacoes obrigatorias e resultado.
5. Retornar resposta estruturada conforme contrato de saida.

## Pipeline Simples (Bloco 2)
Script: `scripts/mvp1-pipeline.ts`

Executa um fluxo ponta a ponta com validacao de schema usando AJV para request e response.

Setup local:

```bash
npm --prefix .github/nb-code install
```

Exemplo:

```bash
node --experimental-strip-types .github/nb-code/scripts/mvp1-pipeline.ts --request .github/nb-code/examples/request.sample.json --output .github/nb-code/examples/response.sample.json
```

Exemplo com relatorio para CI:

```bash
node --experimental-strip-types .github/nb-code/scripts/mvp1-pipeline.ts --request .github/nb-code/examples/request.sample.json --report .github/nb-code/examples/report.sample.json
```

Exemplo em modo validate-only (sem output completo de response):

```bash
node --experimental-strip-types .github/nb-code/scripts/mvp1-pipeline.ts --request .github/nb-code/examples/request.sample.json --validate-only
```

Exemplo em modo NDJSON (logs estruturados para pipeline):

```bash
node --experimental-strip-types .github/nb-code/scripts/mvp1-pipeline.ts --request .github/nb-code/examples/request.sample.json --ndjson
```

Exemplo com filtro de eventos NDJSON:

```bash
node --experimental-strip-types .github/nb-code/scripts/mvp1-pipeline.ts --request .github/nb-code/examples/request.sample.json --ndjson --events execution-report,response
```

Exemplo com preset de eventos NDJSON:

```bash
node --experimental-strip-types .github/nb-code/scripts/mvp1-pipeline.ts --request .github/nb-code/examples/request.sample.json --ndjson --events-preset ci-minimal
```

Exemplo com preset de auditoria NDJSON:

```bash
node --experimental-strip-types .github/nb-code/scripts/mvp1-pipeline.ts --request .github/nb-code/examples/request.sample.json --output .github/nb-code/examples/response.sample.json --ndjson --events-preset ci-audit
```

Exemplo com hints NDJSON silenciados:

```bash
node --experimental-strip-types .github/nb-code/scripts/mvp1-pipeline.ts --request .github/nb-code/examples/request.sample.json --ndjson --no-ndjson-hints
```

Exemplo com gate de status para CI (falha se status for blocked ou needs-input):

```bash
node --experimental-strip-types .github/nb-code/scripts/mvp1-pipeline.ts --request .github/nb-code/examples/request.sample.json --fail-on-status blocked,needs-input
```

Exemplo com preset de gate de status para CI:

```bash
node --experimental-strip-types .github/nb-code/scripts/mvp1-pipeline.ts --request .github/nb-code/examples/request.sample.json --fail-on-status-preset strict
```

Resultado:
- Valida request e response pelos schemas em `contracts/*.schema.json`.
- Aplica gate basico de seguranca (segredos e area sensivel).
- Retorna response padronizado com actions, validations e security.
- Opcionalmente gera relatorio JSON de execucao para uso em CI (`--report`).
- Opcionalmente roda em modo enxuto para CI com `--validate-only`.
- Opcionalmente emite eventos estruturados em NDJSON com `--ndjson`.
- No modo NDJSON, permite filtrar eventos com `--events` (lista separada por virgula).
- No modo NDJSON, permite presets de eventos com `--events-preset` (`ci-minimal`, `ci-audit` ou `ci-debug`).
- Se `--ndjson` for usado sem `--events`/`--events-preset`, o pipeline emite recomendacao automatica em `stderr`.
- Combinacoes subotimas (ex.: `--output` sem `output-written`) geram aviso em `stderr`.
- Use `--no-ndjson-hints` para silenciar recomendacoes e avisos NDJSON em `stderr`.
- Use `--fail-on-status` para transformar status de response em falha de pipeline (exit code `4`).
- Use `--fail-on-status-preset` para gate rapido por politica (`strict` ou `security`).

## Presets NDJSON Recomendados

| Preset | Eventos emitidos | Quando usar |
|---|---|---|
| `ci-minimal` | `execution-report`, `response` (ou `validate-only-result`) | Pipelines com necessidade de sinal claro de sucesso/falha e payload resumido |
| `ci-audit` | `execution-report`, `output-written` | Pipelines de auditoria/rastreabilidade com artefato salvo em arquivo via `--output` |
| `ci-debug` | Todos (`execution-report`, `response`/`validate-only-result`, `output-written`) | Diagnostico completo e troubleshooting de integrações |

Teste negativo (request invalido):

```bash
npm --prefix .github/nb-code run pipeline:test-negative
```

Suite completa de regressao do pipeline:

```bash
npm --prefix .github/nb-code run pipeline:test
```

## Regras criticas
- Nunca expor segredos, tokens ou credenciais.
- Nao aprovar merge automaticamente.
- Qualquer area sensivel (auth/crypto) exige alerta e supervisao.
- Entrega final deve ser clara para revisao humana.
