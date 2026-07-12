import { Router } from 'express';
import { autenticar, exigirSetupCompleto } from '../../middlewares/auth.js';
import { soGerente } from '../../middlewares/roles.js';
import { comTenantHandler } from '../../middlewares/tenant.js';
import { validarBody } from '../../middlewares/validate.js';
import { uploadLogo, urlPublicaLogo } from '../../utils/upload.js';
import { atualizarMarcaSchema } from './marca.schema.js';
import * as service from './marca.service.js';

// Autoatendimento do gerente pra editar a própria marca (nome/cores/logo) sem depender
// do superadmin. Sempre a PRÓPRIA academia — nunca recebe :id, RLS que garante o escopo.
export const adminMarcaRouter = Router();
adminMarcaRouter.use(autenticar, exigirSetupCompleto(), soGerente);

adminMarcaRouter.get('/', comTenantHandler(async (req, res) => res.json(await service.obterMinhaAcademia(req.db))));

adminMarcaRouter.put(
  '/',
  validarBody(atualizarMarcaSchema),
  comTenantHandler(async (req, res) => res.json(await service.atualizarMinhaMarca(req.db, req.usuario, req.body, req))),
);

adminMarcaRouter.post(
  '/logo',
  uploadLogo,
  comTenantHandler(async (req, res) => {
    const logoUrl = urlPublicaLogo(req.file.filename);
    res.json(await service.atualizarMinhaLogo(req.db, req.usuario, logoUrl, req));
  }),
);
