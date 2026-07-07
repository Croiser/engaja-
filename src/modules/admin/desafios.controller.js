import { Router } from 'express';
import { autenticar, exigirSetupCompleto } from '../../middlewares/auth.js';
import { soGerente } from '../../middlewares/roles.js';
import { comTenantHandler } from '../../middlewares/tenant.js';
import { validarBody } from '../../middlewares/validate.js';
import { criarDesafioSchema, atualizarDesafioSchema } from './desafios.schema.js';
import * as service from './desafios.service.js';

// CRUD de desafios (gerente). Montado em /admin/desafios. Contexto de tenant (RLS).
export const adminDesafiosRouter = Router();
adminDesafiosRouter.use(autenticar, exigirSetupCompleto(), soGerente);

adminDesafiosRouter.get(
  '/',
  comTenantHandler(async (req, res) => res.json(await service.listar(req.db))),
);

adminDesafiosRouter.post(
  '/',
  validarBody(criarDesafioSchema),
  comTenantHandler(async (req, res) =>
    res.status(201).json(await service.criar(req.db, req.usuario, req.body, req)),
  ),
);

adminDesafiosRouter.put(
  '/:id',
  validarBody(atualizarDesafioSchema),
  comTenantHandler(async (req, res) =>
    res.json(await service.atualizar(req.db, req.usuario, req.params.id, req.body, req)),
  ),
);

adminDesafiosRouter.delete(
  '/:id',
  comTenantHandler(async (req, res) => {
    await service.remover(req.db, req.usuario, req.params.id, req);
    res.json({ ok: true });
  }),
);

// Concluir desafio para um aluno (ex.: avaliação física) → credita + audita.
adminDesafiosRouter.post(
  '/:id/concluir/:alunoId',
  comTenantHandler(async (req, res) =>
    res.json(
      await service.concluirParaAluno(
        req.db,
        req.usuario,
        { desafioId: req.params.id, alunoId: req.params.alunoId },
        req,
      ),
    ),
  ),
);
