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
