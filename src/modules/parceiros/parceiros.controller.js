import { Router } from 'express';
import { autenticar, exigirSetupCompleto } from '../../middlewares/auth.js';
import { soGerente } from '../../middlewares/roles.js';
import { comTenantHandler } from '../../middlewares/tenant.js';
import { validarBody } from '../../middlewares/validate.js';
import { categoriaSchema, criarParceiroSchema, atualizarParceiroSchema } from './parceiros.schema.js';
import * as service from './parceiros.service.js';

// ---- Admin: CRUD de categorias e parceiros (gerente) ----
export const adminParceirosRouter = Router();
adminParceirosRouter.use(autenticar, exigirSetupCompleto(), soGerente);

adminParceirosRouter.get('/categorias', comTenantHandler(async (req, res) => res.json(await service.listarCategorias(req.db))));
adminParceirosRouter.post('/categorias', validarBody(categoriaSchema), comTenantHandler(async (req, res) => res.status(201).json(await service.criarCategoria(req.db, req.usuario, req.body))));
adminParceirosRouter.put('/categorias/:id', validarBody(categoriaSchema.partial()), comTenantHandler(async (req, res) => res.json(await service.atualizarCategoria(req.db, req.params.id, req.body))));
adminParceirosRouter.delete('/categorias/:id', comTenantHandler(async (req, res) => { await service.removerCategoria(req.db, req.params.id); res.json({ ok: true }); }));

adminParceirosRouter.get('/', comTenantHandler(async (req, res) => res.json(await service.listarParceirosAdmin(req.db))));
adminParceirosRouter.post('/', validarBody(criarParceiroSchema), comTenantHandler(async (req, res) => res.status(201).json(await service.criarParceiro(req.db, req.usuario, req.body, req))));
adminParceirosRouter.put('/:id', validarBody(atualizarParceiroSchema), comTenantHandler(async (req, res) => res.json(await service.atualizarParceiro(req.db, req.params.id, req.body))));
adminParceirosRouter.delete('/:id', comTenantHandler(async (req, res) => { await service.removerParceiro(req.db, req.params.id); res.json({ ok: true }); }));

// ---- Catálogo (qualquer autenticado do tenant: aluno navega, lojista/staff também) ----
export const catalogoRouter = Router();
catalogoRouter.use(autenticar, exigirSetupCompleto());

catalogoRouter.get('/', comTenantHandler(async (req, res) => res.json(await service.listarCatalogo(req.db, { categoria: req.query.categoria }))));
catalogoRouter.get('/categorias', comTenantHandler(async (req, res) => res.json(await service.listarCategorias(req.db))));
catalogoRouter.get('/:id', comTenantHandler(async (req, res) => res.json(await service.detalheParceiro(req.db, req.params.id))));
