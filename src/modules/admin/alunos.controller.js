import { Router } from 'express';
import { autenticar, exigirSetupCompleto } from '../../middlewares/auth.js';
import { soAdmin } from '../../middlewares/roles.js';
import { comTenantHandler } from '../../middlewares/tenant.js';
import { validarBody, validarQuery } from '../../middlewares/validate.js';
import { listaAlunosQuery, criarAlunoSchema, atualizarAlunoSchema, ajustePontosSchema } from './alunos.schema.js';
import * as service from './alunos.service.js';

// CRUD de alunos (recepção + gerente). Ações destrutivas/pontuais são auditadas.
export const adminAlunosRouter = Router();
adminAlunosRouter.use(autenticar, exigirSetupCompleto(), soAdmin);

adminAlunosRouter.get('/', validarQuery(listaAlunosQuery), comTenantHandler(async (req, res) => res.json(await service.listar(req.db, req.q))));
adminAlunosRouter.get('/:id', comTenantHandler(async (req, res) => res.json(await service.obter(req.db, req.params.id))));
adminAlunosRouter.post('/', validarBody(criarAlunoSchema), comTenantHandler(async (req, res) => res.status(201).json(await service.criar(req.db, req.usuario, req.body, req))));
adminAlunosRouter.put('/:id', validarBody(atualizarAlunoSchema), comTenantHandler(async (req, res) => res.json(await service.atualizar(req.db, req.usuario, req.params.id, req.body, req))));
adminAlunosRouter.post('/:id/cancelar', comTenantHandler(async (req, res) => res.json(await service.cancelar(req.db, req.usuario, req.params.id, req))));
adminAlunosRouter.post('/:id/pontos', validarBody(ajustePontosSchema), comTenantHandler(async (req, res) => res.json(await service.ajustarPontos(req.db, req.usuario, req.params.id, req.body, req))));
