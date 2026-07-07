import { Router } from 'express';
import { z } from 'zod';
import { autenticar, exigirSetupCompleto } from '../../middlewares/auth.js';
import { comTenantHandler } from '../../middlewares/tenant.js';
import { validarBody } from '../../middlewares/validate.js';
import { Erros } from '../../utils/errors.js';

// Formato padrão de uma PushSubscription do navegador.
const subscribeSchema = z.object({
  endpoint: z.string().url(),
  keys: z.object({ p256dh: z.string().min(1), auth: z.string().min(1) }),
  user_agent: z.string().optional(),
});

// Registro/remoção de tokens de Web Push. Disponível para qualquer papel autenticado.
export const pushRouter = Router();
pushRouter.use(autenticar, exigirSetupCompleto());

// POST /me/push/subscribe — registra o dispositivo (idempotente por endpoint).
pushRouter.post(
  '/subscribe',
  validarBody(subscribeSchema),
  comTenantHandler(async (req, res) => {
    const { endpoint, keys, user_agent } = req.body;
    await req.db('push_subscriptions')
      .insert({
        usuario_id: req.usuario.id,
        academia_id: req.tenantId,
        endpoint,
        p256dh: keys.p256dh,
        auth: keys.auth,
        user_agent: user_agent ?? req.headers['user-agent'] ?? null,
        ativo: true,
      })
      .onConflict('endpoint')
      .merge({ usuario_id: req.usuario.id, p256dh: keys.p256dh, auth: keys.auth, ativo: true });
    res.status(201).json({ ok: true });
  }),
);

// DELETE /me/push/subscribe — remove o dispositivo (logout / desativar notificações).
pushRouter.delete(
  '/subscribe',
  validarBody(z.object({ endpoint: z.string().url() })),
  comTenantHandler(async (req, res) => {
    const n = await req.db('push_subscriptions')
      .where({ endpoint: req.body.endpoint, usuario_id: req.usuario.id })
      .del();
    if (!n) throw Erros.naoEncontrado('Assinatura');
    res.json({ ok: true });
  }),
);
