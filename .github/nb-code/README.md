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

Resultado:
- Valida request e response pelos schemas em `contracts/*.schema.json`.
- Aplica gate basico de seguranca (segredos e area sensivel).
- Retorna response padronizado com actions, validations e security.
- Opcionalmente gera relatorio JSON de execucao para uso em CI (`--report`).

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
