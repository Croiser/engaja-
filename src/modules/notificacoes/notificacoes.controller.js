import { Router } from 'express';
import { autenticar, exigirSetupCompleto } from '../../middlewares/auth.js';
import { comTenantHandler } from '../../middlewares/tenant.js';
import { validarQuery } from '../../middlewares/validate.js';
import { extratoQuerySchema } from '../aluno/aluno.schema.js';
import * as service from './notificacoes.service.js';

// Mural interno — disponível para QUALQUER papel autenticado (sem restrição de role).
export const notificacoesRouter = Router();
notificacoesRouter.use(autenticar, exigirSetupCompleto());

notificacoesRouter.get(
  '/',
  validarQuery(extratoQuerySchema),
  comTenantHandler(async (req, res) => res.json(await service.listar(req.db, req.usuario.id, req.q))),
);

notificacoesRouter.get(
  '/nao-lidas',
  comTenantHandler(async (req, res) => res.json(await service.contarNaoLidas(req.db, req.usuario.id))),
);

notificacoesRouter.post(
  '/:id/lida',
  comTenantHandler(async (req, res) => {
    await service.marcarLida(req.db, req.usuario.id, req.params.id);
    res.json({ ok: true });
  }),
);

notificacoesRouter.post(
  '/ler-todas',
  comTenantHandler(async (req, res) => {
    await service.marcarTodasLidas(req.db, req.usuario.id);
    res.json({ ok: true });
  }),
);
