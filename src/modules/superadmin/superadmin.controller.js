import { Router } from 'express';
import { autenticar, exigirSetupCompleto } from '../../middlewares/auth.js';
import { soSuperadmin } from '../../middlewares/roles.js';
import { comSistemaHandler } from '../../middlewares/tenant.js';
import { validarBody } from '../../middlewares/validate.js';
import { criarAcademiaSchema, atualizarAcademiaSchema } from './superadmin.schema.js';
import * as service from './superadmin.service.js';

// Painel do dono da plataforma (tipo='superadmin'). Cross-tenant de propósito — usa
// comSistemaHandler (bypass do RLS), nunca comTenantHandler. Montado em /superadmin.
export const superadminRouter = Router();
superadminRouter.use(autenticar, exigirSetupCompleto(), soSuperadmin);

superadminRouter.get('/dashboard', comSistemaHandler(async (req, res) => res.json(await service.dashboard(req.db))));

superadminRouter.get('/academias', comSistemaHandler(async (req, res) => res.json(await service.listarAcademias(req.db))));
superadminRouter.get('/academias/:id', comSistemaHandler(async (req, res) => res.json(await service.obterAcademia(req.db, req.params.id))));
superadminRouter.post(
  '/academias',
  validarBody(criarAcademiaSchema),
  comSistemaHandler(async (req, res) => res.status(201).json(await service.criarAcademia(req.db, req.usuario, req.body, req))),
);
superadminRouter.put(
  '/academias/:id',
  validarBody(atualizarAcademiaSchema),
  comSistemaHandler(async (req, res) => res.json(await service.atualizarAcademia(req.db, req.usuario, req.params.id, req.body, req))),
);
superadminRouter.post(
  '/academias/:id/suspender',
  comSistemaHandler(async (req, res) => {
    await service.suspenderAcademia(req.db, req.usuario, req.params.id, req);
    res.json({ ok: true });
  }),
);
superadminRouter.post(
  '/academias/:id/reativar',
  comSistemaHandler(async (req, res) => {
    await service.reativarAcademia(req.db, req.usuario, req.params.id, req);
    res.json({ ok: true });
  }),
);
