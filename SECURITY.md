# 🔒 Regras de segurança — leitura obrigatória antes de criar módulo novo

Blindagem já implementada e testada (04/07/2026). **Todo módulo novo precisa seguir isto**,
senão abre brecha de vazamento entre academias ou de auth.

## 1. Isolamento multi-tenant (RLS) — a regra de ouro
- **Rotas autenticadas usam `req.db`, NUNCA o `db` global.** O `req.db` é uma transação com
  `app.tenant_id` setado (via `comTenantHandler`); o `db` global não tem tenant → RLS devolve
  **0 linhas** (fail-closed). Service novo → recebe `dbh`/`req.db` como parâmetro.
- **Contexto de sistema** (login, autenticação, jobs, superadmin, seed) usa `comSistema` /
  `app.bypass='on'`. Só para operações inerentemente cross-tenant. Nunca em rota de aluno/parceiro.
- **App conecta como `clube_app` (NOSUPERUSER)** via `APP_DATABASE_URL`. NUNCA apontar a API
  para o superusuário — superusuário IGNORA RLS. Migrations/seed usam `DATABASE_URL` (superuser).
- Tabela nova com dados de tenant → adicionar `academia_id` + política RLS na migration
  (espelhar `db/migrations/0002_rls.js`).

## 2. Auth
- JWT: algoritmo fixo HS256 + issuer `clube-boa-forma` (ver `utils/jwt.js`). Nunca afrouxar.
- Rota autenticada: `autenticar` + (`exigirSetupCompleto()` se for pós-setup) + `exigirRole(...)`.
- Ação manual de admin (ajuste de pontos, exclusão, CRUD sensível) → registrar em `auditoria_logs`
  DENTRO da mesma transação do efeito (ver `utils/auditoria.js`).

## 3. Entrada e limites
- Todo body/query passa por Zod (`validarBody`/`validarQuery`).
- Endpoints sensíveis (escrita, geração de código) → `acaoRateLimit`.

## 4. Pontos (nunca burlar o engine)
- Crédito/débito SEMPRE via `engine/ledger.js` dentro de transação; débito é atômico
  (guard `saldo_atual >= x`). Nunca `UPDATE` direto em saldo. Ledger é append-only.

## Checklist de PR de módulo novo
- [ ] Service recebe `req.db` (não importa `db` global) nas rotas autenticadas
- [ ] Rotas com `autenticar` + role correto + Zod
- [ ] Ação manual gera auditoria na mesma transação
- [ ] Se criou tabela com dado de tenant: RLS na migration
- [ ] Testado com 2 academias (uma não enxerga a outra)
