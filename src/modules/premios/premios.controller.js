import { Router } from 'express';
import { autenticar, exigirSetupCompleto } from '../../middlewares/auth.js';
import { soAdmin, soGerente } from '../../middlewares/roles.js';
import { comTenantHandler } from '../../middlewares/tenant.js';
import { validarBody } from '../../middlewares/validate.js';
import { criarPremioSchema, atualizarPremioSchema } from './premios.schema.js';
import * as service from './premios.service.js';

// ---- Vitrine (qualquer autenticado do tenant) ----
export const vitrineRouter = Router();
vitrineRouter.use(autenticar, exigirSetupCompleto());
vitrineRouter.get('/', comTenantHandler(async (req, res) => res.json(await service.vitrine(req.db))));

// ---- Admin: CRUD de prêmios (gerente) + baixa de voucher (recepção+gerente) ----
export const adminPremiosRouter = Router();
adminPremiosRouter.use(autenticar, exigirSetupCompleto());

adminPremiosRouter.get('/', soGerente, comTenantHandler(async (req, res) => res.json(await service.listarAdmin(req.db))));
adminPremiosRouter.post('/', soGerente, validarBody(criarPremioSchema), comTenantHandler(async (req, res) => res.status(201).json(await service.criar(req.db, req.usuario, req.body))));
adminPremiosRouter.put('/:id', soGerente, validarBody(atualizarPremioSchema), comTenantHandler(async (req, res) => res.json(await service.atualizar(req.db, req.params.id, req.body))));
adminPremiosRouter.delete('/:id', soGerente, comTenantHandler(async (req, res) => { await service.remover(req.db, req.params.id); res.json({ ok: true }); }));

// Recepção baixa o voucher quando o aluno retira o prêmio.
adminPremiosRouter.post('/resgates/:voucher/retirar', soAdmin, comTenantHandler(async (req, res) =>
  res.json(await service.retirar(req.db, req.usuario, req.params.voucher, req)),
));
