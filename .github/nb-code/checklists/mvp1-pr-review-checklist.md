# MVP1 PR Review Checklist

## Escopo e Contexto
- [ ] O objetivo da entrega esta claro e alinhado ao MVP1.
- [ ] O escopo ficou restrito ao necessario, sem mudancas paralelas.
- [ ] O resumo da PR explica problema, solucao e impacto.

## Qualidade Tecnica
- [ ] A suite `npm --prefix .github/nb-code run pipeline:test` foi executada com sucesso.
- [ ] O release-check `npm --prefix .github/nb-code run pipeline:release-check` foi executado.
- [ ] O resultado do release-check foi anexado na descricao da PR.

## Seguranca e Governanca
- [ ] Nao ha segredos hardcoded em codigo, logs ou docs.
- [ ] Alteracoes sensiveis (auth/crypto) foram sinalizadas, se aplicavel.
- [ ] A estrategia de gate de status em CI esta configurada para o contexto da PR.

## Entrega e Merge Readiness
- [ ] Existem proximos passos e riscos residuais documentados.
- [ ] A PR esta pronta para revisao humana e decisao de merge.
