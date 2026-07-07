import { Router } from 'express';
import { asyncHandler } from '../../middlewares/errorHandler.js';
import { autenticar } from '../../middlewares/auth.js';
import { validarBody } from '../../middlewares/validate.js';
import { loginRateLimit } from '../../middlewares/rateLimit.js';
import { loginSchema, trocarSenhaSchema } from './auth.schema.js';
import * as service from './auth.service.js';

export const authRouter = Router();

// POST /auth/login
authRouter.post(
  '/login',
  loginRateLimit,
  validarBody(loginSchema),
  asyncHandler(async (req, res) => {
    const r = await service.login({
      identificador: req.body.identificador,
      senha: req.body.senha,
      manterConectado: req.body.manter_conectado,
    });
    res.json(r);
  }),
);

// POST /auth/trocar-senha (autenticado; permitido durante o setup)
authRouter.post(
  '/trocar-senha',
  autenticar,
  validarBody(trocarSenhaSchema),
  asyncHandler(async (req, res) => {
    await service.trocarSenha(req.usuario.id, {
      senhaAtual: req.body.senha_atual,
      novaSenha: req.body.nova_senha,
    });
    res.json({ ok: true });
  }),
);

// POST /auth/aceitar-termos (autenticado; permitido durante o setup)
authRouter.post(
  '/aceitar-termos',
  autenticar,
  asyncHandler(async (req, res) => {
    await service.aceitarTermos(req.usuario.id);
    res.json({ ok: true });
  }),
);

// GET /auth/me
authRouter.get(
  '/me',
  autenticar,
  asyncHandler(async (req, res) => {
    res.json(await service.me(req.usuario.id));
  }),
);

// POST /auth/logout (client apaga o JWT; sem estado no servidor por ora)
authRouter.post('/logout', autenticar, (_req, res) => res.json({ ok: true }));
