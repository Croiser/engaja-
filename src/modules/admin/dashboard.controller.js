import { Router } from 'express';
import { autenticar, exigirSetupCompleto } from '../../middlewares/auth.js';
import { soGerente } from '../../middlewares/roles.js';
import { comTenantHandler } from '../../middlewares/tenant.js';
import { validarQuery } from '../../middlewares/validate.js';
import { z } from 'zod';
import * as service from './dashboard.service.js';

// Dashboard, relatórios e auditoria (gerente).
export const dashboardRouter = Router();
dashboardRouter.use(autenticar, exigirSetupCompleto(), soGerente);

dashboardRouter.get('/dashboard', comTenantHandler(async (req, res) => res.json(await service.dashboard(req.db))));
dashboardRouter.get('/relatorios/vencimentos', comTenantHandler(async (req, res) => res.json(await service.relVencimentos(req.db))));
dashboardRouter.get('/relatorios/parceiros', comTenantHandler(async (req, res) => res.json(await service.relParceiros(req.db))));

const auditoriaQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(30),
  acao: z.string().max(60).optional(),
});
dashboardRouter.get('/auditoria', validarQuery(auditoriaQuery), comTenantHandler(async (req, res) => res.json(await service.auditoria(req.db, req.q))));
