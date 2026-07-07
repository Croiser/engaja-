import { comTenant, comSistema } from '../config/db.js';

// Envolve um handler de rota autenticada num contexto de TENANT (RLS).
// Injeta `req.db` = transação com `app.tenant_id` setado. Os services devem usar
// `req.db` (não o `db` global) para que o isolamento por academia valha.
//
// Commit só no sucesso: se o handler lançar, a transação faz rollback e o erro
// segue para o errorHandler. Substitui o asyncHandler nas rotas com tenant.
export const comTenantHandler = (fn) => (req, res, next) =>
  comTenant(req.tenantId, async (trx) => {
    req.db = trx;
    await fn(req, res, next);
  }).catch(next);

// Mesma ideia, mas em contexto de SISTEMA (bypass do RLS) — para rotas cross-tenant
// de propósito, como o painel super-admin (vê/edita todas as academias).
export const comSistemaHandler = (fn) => (req, res, next) =>
  comSistema(async (trx) => {
    req.db = trx;
    await fn(req, res, next);
  }).catch(next);
