import { Router } from 'express';
import { autenticar, exigirSetupCompleto } from '../../middlewares/auth.js';
import { soParceiro } from '../../middlewares/roles.js';
import { comTenantHandler } from '../../middlewares/tenant.js';
import { validarBody } from '../../middlewares/validate.js';
import { acaoRateLimit } from '../../middlewares/rateLimit.js';
import { codigoSchema } from './parceiros.schema.js';
import * as service from './lojista.service.js';

// Área do lojista (usuarios.tipo='parceiro'). Montada em /parceiro.
export const lojistaRouter = Router();
lojistaRouter.use(autenticar, exigirSetupCompleto(), soParceiro);

// POST /parceiro/validar — confere o código do aluno (não consome)
lojistaRouter.post(
  '/validar',
  acaoRateLimit,
  validarBody(codigoSchema),
  comTenantHandler(async (req, res) => res.json(await service.validar(req.db, req.usuario, req.body.codigo))),
);

// POST /parceiro/confirmar — confirma o uso do benefício (conta no relatório)
lojistaRouter.post(
  '/confirmar',
  acaoRateLimit,
  validarBody(codigoSchema),
  comTenantHandler(async (req, res) => res.json(await service.confirmar(req.db, req.usuario, req.body.codigo))),
);
