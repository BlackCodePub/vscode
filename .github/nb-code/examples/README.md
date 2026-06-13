# Exemplos MVP1

## Request de exemplo
Arquivo: `request.sample.json`

Uso:

```bash
node --experimental-strip-types .github/nb-code/scripts/mvp1-pipeline.ts --request .github/nb-code/examples/request.sample.json --output .github/nb-code/examples/response.sample.json
```

## Observacoes
- O response de exemplo e gerado em runtime para refletir as regras de seguranca e validacao do pipeline.
- O comando pode ser usado em CI para validar rapidamente o contrato minimo de entrada e saida.

## Request invalido de exemplo
Arquivo: `request.invalid.sample.json`

Comando para validar a rejeicao:

```bash
npm --prefix .github/nb-code run pipeline:test-negative
```

## Requests de regressao
- `request.sensitive.sample.json`: deve retornar `status=needs-input` e `sensitiveAreaTouched=true`.
- `request.secret.sample.json`: deve retornar `status=blocked` e `secretsExposed=true`.

Comando para validar a suite completa:

```bash
npm --prefix .github/nb-code run pipeline:test
```

## Relatorio de CI
Exemplo de geracao de relatorio:

```bash
node --experimental-strip-types .github/nb-code/scripts/mvp1-pipeline.ts --request .github/nb-code/examples/request.sample.json --report .github/nb-code/examples/report.sample.json
```

Comando de teste automatizado do relatorio:

```bash
npm --prefix .github/nb-code run pipeline:test-ci-report
```

## Modo Validate-Only
Exemplo de execucao enxuta:

```bash
node --experimental-strip-types .github/nb-code/scripts/mvp1-pipeline.ts --request .github/nb-code/examples/request.sample.json --validate-only
```

Comando de teste automatizado do modo validate-only:

```bash
npm --prefix .github/nb-code run pipeline:test-validate-only
```

## Modo NDJSON
Exemplo de execucao com eventos estruturados:

```bash
node --experimental-strip-types .github/nb-code/scripts/mvp1-pipeline.ts --request .github/nb-code/examples/request.sample.json --ndjson
```

Exemplo de filtro de eventos NDJSON:

```bash
node --experimental-strip-types .github/nb-code/scripts/mvp1-pipeline.ts --request .github/nb-code/examples/request.sample.json --ndjson --events execution-report,response
```

Exemplo de preset de eventos NDJSON:

```bash
node --experimental-strip-types .github/nb-code/scripts/mvp1-pipeline.ts --request .github/nb-code/examples/request.sample.json --ndjson --events-preset ci-minimal
```

Exemplo de preset de auditoria NDJSON:

```bash
node --experimental-strip-types .github/nb-code/scripts/mvp1-pipeline.ts --request .github/nb-code/examples/request.sample.json --output .github/nb-code/examples/response.sample.json --ndjson --events-preset ci-audit
```

Exemplo com hints NDJSON silenciados:

```bash
node --experimental-strip-types .github/nb-code/scripts/mvp1-pipeline.ts --request .github/nb-code/examples/request.sample.json --ndjson --no-ndjson-hints
```

Exemplo de gate de status (falha no CI quando response ficar em blocked ou needs-input):

```bash
node --experimental-strip-types .github/nb-code/scripts/mvp1-pipeline.ts --request .github/nb-code/examples/request.secret.sample.json --fail-on-status blocked,needs-input
```

Exemplo com preset de gate de status:

```bash
node --experimental-strip-types .github/nb-code/scripts/mvp1-pipeline.ts --request .github/nb-code/examples/request.secret.sample.json --fail-on-status-preset security
```

Exemplo de finalizacao com release-check e relatorio:

```bash
npm --prefix .github/nb-code run pipeline:release-check -- --output .github/nb-code/examples/release-check.sample.json
```

Resumo rápido de presets:
- `ci-minimal`: fluxo leve para CI geral.
- `ci-audit`: rastreia execucao e escrita de artefato.
- `ci-debug`: visao completa para diagnostico.

Observacoes:
- Sem `--events`/`--events-preset`, o pipeline sugere preset recomendado em `stderr`.
- Em combinacoes subotimas, o pipeline emite aviso em `stderr` com sugestao de ajuste.
- Use `--no-ndjson-hints` para silenciar esses avisos/recomendacoes.
- Use `--fail-on-status` para forcar falha de processo (exit code `4`) quando o status retornado estiver na lista configurada.
- Use `--fail-on-status-preset` para aplicar gate por politica pronta: `strict` (needs-input + blocked) ou `security` (apenas blocked).
- Use o release-check para executar validacoes finais e produzir um relatorio unico de prontidao (`ready`/`blocked`).

Comando de teste automatizado do modo NDJSON:

```bash
npm --prefix .github/nb-code run pipeline:test-ndjson
```
