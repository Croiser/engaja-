import { Router } from 'express';
import { autenticar, exigirSetupCompleto } from '../../middlewares/auth.js';
import { soSuperadmin } from '../../middlewares/roles.js';
import { comSistemaHandler } from '../../middlewares/tenant.js';
import { validarBody } from '../../middlewares/validate.js';
import {
  criarAcademiaSchema,
  atualizarAcademiaSchema,
  criarPlanoSchema,
  atualizarPlanoSchema,
  definirAssinaturaSchema,
  registrarPagamentoSchema,
  ativarCobrancaSchema,
} from './superadmin.schema.js';
import * as service from './superadmin.service.js';
import * as cobranca from './cobranca.service.js';

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

// ---- Planos (catálogo da plataforma) ----
superadminRouter.get('/planos', comSistemaHandler(async (req, res) => res.json(await service.listarPlanos(req.db))));
superadminRouter.post(
  '/planos',
  validarBody(criarPlanoSchema),
  comSistemaHandler(async (req, res) => res.status(201).json(await service.criarPlano(req.db, req.usuario, req.body, req))),
);
superadminRouter.put(
  '/planos/:id',
  validarBody(atualizarPlanoSchema),
  comSistemaHandler(async (req, res) => res.json(await service.atualizarPlano(req.db, req.usuario, req.params.id, req.body, req))),
);
superadminRouter.delete(
  '/planos/:id',
  comSistemaHandler(async (req, res) => res.json(await service.removerPlano(req.db, req.usuario, req.params.id, req))),
);

// ---- Assinatura + pagamentos da academia ----
superadminRouter.put(
  '/academias/:id/assinatura',
  validarBody(definirAssinaturaSchema),
  comSistemaHandler(async (req, res) => res.json(await service.definirAssinatura(req.db, req.usuario, req.params.id, req.body, req))),
);
superadminRouter.get(
  '/academias/:id/pagamentos',
  comSistemaHandler(async (req, res) => res.json(await service.listarPagamentos(req.db, req.params.id))),
);
superadminRouter.post(
  '/academias/:id/pagamentos',
  validarBody(registrarPagamentoSchema),
  comSistemaHandler(async (req, res) => res.status(201).json(await service.registrarPagamento(req.db, req.usuario, req.params.id, req.body, req))),
);

// ---- Ativar cobrança recorrente no Asaas (Fase 1) ----
superadminRouter.post(
  '/academias/:id/cobranca/ativar',
  validarBody(ativarCobrancaSchema),
  comSistemaHandler(async (req, res) => res.json(await cobranca.ativarCobranca(req.db, req.usuario, req.params.id, req.body, req))),
);
