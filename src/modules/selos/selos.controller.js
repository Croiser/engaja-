import { Router } from 'express';
import { autenticar, exigirSetupCompleto } from '../../middlewares/auth.js';
import { soGerente } from '../../middlewares/roles.js';
import { comTenantHandler } from '../../middlewares/tenant.js';
import { validarBody } from '../../middlewares/validate.js';
import { criarSeloSchema, atualizarSeloSchema } from './selos.schema.js';
import * as service from './selos.service.js';

// ---- Admin: CRUD de selos/níveis (só gerente — igual prêmios/desafios) ----
export const adminSelosRouter = Router();
adminSelosRouter.use(autenticar, exigirSetupCompleto(), soGerente);

adminSelosRouter.get('/', comTenantHandler(async (req, res) => res.json(await service.listarAdmin(req.db))));
adminSelosRouter.post('/', validarBody(criarSeloSchema), comTenantHandler(async (req, res) => res.status(201).json(await service.criar(req.db, req.usuario, req.body))));
adminSelosRouter.put('/:id', validarBody(atualizarSeloSchema), comTenantHandler(async (req, res) => res.json(await service.atualizar(req.db, req.params.id, req.body))));
adminSelosRouter.delete('/:id', comTenantHandler(async (req, res) => { await service.remover(req.db, req.params.id); res.json({ ok: true }); }));
