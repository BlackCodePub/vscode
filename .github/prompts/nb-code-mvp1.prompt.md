---
agent: agent
description: 'NB-Code MVP1: executa entrega com contrato de entrada/saida, checklist de validacao e foco em seguranca.'
tools: ['search', 'edit', 'runCommands', 'problems', 'todos']
---

Use o fluxo MVP1 do NB-Code para implementar a solicitacao do usuario com seguranca, rastreabilidade e saida estruturada.

## Contratos
- Entrada: `../nb-code/contracts/request.schema.json`
- Saida: `../nb-code/contracts/response.schema.json`

## Checklist obrigatorio
Siga o checklist em `../nb-code/checklists/mvp1-delivery-checklist.md`.

## Processo
1. Reescreva o pedido em um objeto de entrada compativel com o contrato.
2. Colete contexto minimo (arquivo atual, selecao, hints do workspace).
3. Execute a mudanca no menor numero de alteracoes possivel.
4. Rode validacoes aplicaveis e capture resultado.
5. Produza saida final em JSON compativel com o contrato de resposta.

## Regras de seguranca
- Nunca incluir segredos em codigo ou logs.
- Se tocar auth/crypto, marcar `sensitiveAreaTouched=true` e explicar no campo `security.notes`.
- Se validacao falhar e nao houver correcao imediata, retornar `status=blocked`.

## Formato de saida esperado
Retorne uma secao `Response JSON` com um bloco `json` valido e completo segundo o contrato de resposta.
