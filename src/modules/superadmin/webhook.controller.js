import { Router } from 'express';
import { env } from '../../config/env.js';
import { comSistemaHandler } from '../../middlewares/tenant.js';
import { processarWebhook } from './webhook.service.js';

// Endpoint PÚBLICO que o Asaas chama (não tem JWT — é servidor-a-servidor). A proteção
// é um token compartilhado no header `asaas-access-token`, configurado no painel do Asaas
// e em ASAAS_WEBHOOK_TOKEN. Fail-closed: sem token configurado, recusa tudo.
export const webhookRouter = Router();

webhookRouter.post(
  '/asaas',
  (req, res, next) => {
    const enviado = req.get('asaas-access-token');
    if (!env.ASAAS_WEBHOOK_TOKEN || enviado !== env.ASAAS_WEBHOOK_TOKEN) {
      return res.status(401).json({ erro: { codigo: 'WEBHOOK_NAO_AUTORIZADO' } });
    }
    next();
  },
  comSistemaHandler(async (req, res) => {
    const r = await processarWebhook(req.db, req.body);
    // Sempre 200 quando processou/ignorou de propósito — senão o Asaas fica reentregando.
    res.json({ ok: true, ...r });
  }),
);
