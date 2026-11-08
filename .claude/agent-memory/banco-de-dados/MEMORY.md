# Memória do DBA do Rede Acolher (uma linha por aprendizado)

- 2026-11-08 fase 287: ROLLBACK TO SAVEPOINT desfaz o set_config('app.user_id',…,true) feito depois do savepoint; redeclare a identidade depois de cada volta, senão o teste roda como a pessoa anterior.
- 2026-11-08 fase 287: a semente do rede_auditoria é mínima (22 pessoas; nenhum shift, ata, activity, health_encounter); cria-se o registro como dono dentro do BEGIN e age-se como rede_app depois.
- 2026-11-08 fase 287: pg_stat_user_tables vem zerado no banco à parte (sem ANALYZE); contar linhas com query_to_xml('select count(*) …').
- 2026-11-08 fase 287: app_casa_da_conta_no_alcance devolve tem_casa=false para conta transversal (enfermagem): as 5 funções que leem staff_role_grant (create, reset, set_active, update, issue_invite) pulam a conferência de casa nesse caso.
- 2026-11-08 fase 287: a suíte o-banco-com-as-duas-travas só reprova with_check='true' literal; política que confere só o autor e esquece a casa passa. Consulta: pg_policies cmd IN (INSERT,UPDATE) AND coalesce(with_check,qual) !~* 'casas_no_alcance|pessoas_no_alcance|in_scope|EXISTS|app_can_|app_le_|app_pode'.
- 2026-11-08 fase 287: rede_app tem UPDATE em todas as 14 colunas de app_user e SELECT em password_hash; user_update_self só confere id=self (o próprio cargo se troca no banco).
- 2026-11-08 fase 287: rede_admin nasce SUPERUSER no preparar-ambiente.sh:61; nenhuma tabela tem FORCE RLS; nenhuma função usa EXECUTE dinâmico (medido).
- 2026-11-08 fase 287: backup.sh e restaurar.sh usam --no-privileges: o dump sai com 0 GRANT/REVOKE (687 com privilégios); o --ensaio só conta linhas como dono.
- 2026-11-08 fase 287: 32 tabelas aceitam UPDATE de todas as colunas sem gatilho de guarda (lista pela junção role_table_grants x pg_trigger tgtype&16).
- 2026-11-08 fase 287: o sigilo de saúde (1678) não tem política nem visão; nenhuma função do banco devolve conteúdo de health_encounter/evolution, o filtro mora no nursing.service.ts e no followups.service.ts.
