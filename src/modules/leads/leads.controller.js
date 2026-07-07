import { Router } from 'express';
import { autenticar, exigirSetupCompleto } from '../../middlewares/auth.js';
import { soAdmin } from '../../middlewares/roles.js';
import { comTenantHandler } from '../../middlewares/tenant.js';
import { validarBody } from '../../middlewares/validate.js';
import { atualizarLeadSchema, interacaoSchema, converterLeadSchema } from './leads.schema.js';
import * as service from './leads.service.js';

// CRM de leads (recepção + gerente). Montado em /admin/leads. Contexto de tenant (RLS).
export const leadsRouter = Router();
leadsRouter.use(autenticar, exigirSetupCompleto(), soAdmin);

// GET /admin/leads?status=novo — pipeline (kanban)
leadsRouter.get(
  '/',
  comTenantHandler(async (req, res) => res.json(await service.listarLeads(req.db, { status: req.query.status }))),
);

// GET /admin/leads/:id — lead + timeline de interações
leadsRouter.get(
  '/:id',
  comTenantHandler(async (req, res) => res.json(await service.obterLead(req.db, req.params.id))),
);

// PUT /admin/leads/:id — move no pipeline / agenda follow-up / assume responsável
leadsRouter.put(
  '/:id',
  validarBody(atualizarLeadSchema),
  comTenantHandler(async (req, res) =>
    res.json(await service.atualizarLead(req.db, req.usuario, req.params.id, req.body, req)),
  ),
);

// POST /admin/leads/:id/interacoes — registra contato (ligação/visita/nota)
leadsRouter.post(
  '/:id/interacoes',
  validarBody(interacaoSchema),
  comTenantHandler(async (req, res) =>
    res.status(201).json(await service.adicionarInteracao(req.db, req.usuario, req.params.id, req.body)),
  ),
);

// POST /admin/leads/:id/converter — cria o aluno e credita +500 ao indicador
leadsRouter.post(
  '/:id/converter',
  validarBody(converterLeadSchema),
  comTenantHandler(async (req, res) =>
    res.json(await service.converterLead(req.db, req.usuario, req.params.id, req.body, req)),
  ),
);
