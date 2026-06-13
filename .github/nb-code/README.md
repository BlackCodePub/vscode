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

## Regras criticas
- Nunca expor segredos, tokens ou credenciais.
- Nao aprovar merge automaticamente.
- Qualquer area sensivel (auth/crypto) exige alerta e supervisao.
- Entrega final deve ser clara para revisao humana.
