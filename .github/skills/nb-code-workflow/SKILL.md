---
name: nb-code-workflow
description: 'Fluxo completo para planejar, implementar, validar e preparar entregas no projeto NB-Code. Use para tarefas de codigo, documentacao tecnica, revisao de seguranca, execucao de testes e preparacao de draft PR.'
argument-hint: 'Qual mudanca voce quer entregar no projeto?'
user-invocable: true
disable-model-invocation: false
---

# Fluxo de Entrega NB-Code

## Objetivo
Padronizar um fluxo seguro e repetivel para transformar um pedido em mudancas verificadas e prontas para revisao humana.

## Quando usar
- Implementacao de funcionalidades novas.
- Correcao de bugs ou regressao.
- Atualizacao de documentacao tecnica do projeto.
- Tarefas que exigem validacao de qualidade e seguranca antes da entrega.

## Resultado esperado
- Mudancas pequenas, focadas e rastreaveis.
- Checklist de qualidade concluido.
- Validacoes estritas executadas e registradas.
- Resumo final pronto para abrir draft PR com contexto claro.

## Procedimento
1. Entender o pedido e o contexto.
- Ler AGENTS.md e .github/copilot-instructions.md.
- Ler o arquivo alvo e documentos relacionados (README.md, SKILLS.md).
- Confirmar escopo, restricoes e criterio de pronto.

2. Classificar o tipo de mudanca.
- Documentacao: textos, guias, arquitetura, processos.
- Codigo: logica, scripts, componentes, integracoes.
- Sensivel: autenticacao, criptografia, segredos, permissao.

3. Planejar a execucao em passos curtos.
- Definir menor conjunto de alteracoes necessario.
- Evitar refatoracoes paralelas sem necessidade.
- Definir quais validacoes serao executadas.

4. Implementar de forma incremental.
- Aplicar alteracoes pequenas e verificaveis.
- Preservar estilo existente e APIs publicas.
- Nao introduzir segredos hardcoded.

5. Seguir ramificacoes de decisao.
- Se tocar autenticacao ou criptografia: pausar e solicitar supervisao senior antes de continuar.
- Executar validacao estrita em toda entrega: testes automatizados, analise estatica (lint/tsc quando houver) e verificacao de seguranca (CodeQL/SAST quando aplicavel).
- Se for apenas documentacao e parte das validacoes nao existir no projeto, registrar explicitamente a ausencia e executar todas as verificacoes disponiveis.
- Se qualquer validacao falhar: corrigir e repetir validacao ate 3 ciclos; depois registrar bloqueio.

6. Validar qualidade e seguranca.
- Confirmar conformidade com convencoes do projeto (TypeScript estrito, aspas simples, sem ponto-e-virgula extra quando aplicavel).
- Garantir ausencia de credenciais, tokens e dados sensiveis no codigo.
- Revisar impactos colaterais e risco de regressao.

7. Preparar entrega.
- Resumir problema, causa e solucao.
- Listar validacoes executadas e resultados.
- Registrar riscos residuais e proximos passos.
- Preparar conteudo para abrir draft PR (problema + mudancas propostas).

## Criterios de conclusao
- Escopo solicitado atendido sem alterar modulos fora do necessario.
- Validacoes obrigatorias executadas com resultado satisfatorio e evidenciadas no resumo final.
- Nenhum segredo exposto.
- Saida final pronta para revisao humana.

## Exemplo de invocacao
/nb-code-workflow Implementar melhoria no SKILLS.md para explicitar decisoes de seguranca por skill

## Prompt de saida sugerido
Produza:
1. Plano de implementacao em passos.
2. Patch proposto.
3. Resultado das validacoes.
4. Resumo pronto para draft PR com problema e mudancas.
