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

Comando de teste automatizado do modo NDJSON:

```bash
npm --prefix .github/nb-code run pipeline:test-ndjson
```
