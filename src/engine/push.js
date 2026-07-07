// =====================================================================
// Web Push (VAPID) — entrega de notificações no dispositivo ("chama os tokens").
// Best-effort: se as chaves VAPID não estiverem setadas, o push é NO-OP e o
// mural interno (tabela notificacoes) continua sendo a fonte confiável.
//
// Assinaturas mortas (410 Gone / 404) são desativadas para não acumular lixo.
// =====================================================================
import webpush from 'web-push';
import { env } from '../config/env.js';
import { comSistema } from '../config/db.js';

const habilitado = !!(env.VAPID_PUBLIC && env.VAPID_PRIVATE);
if (habilitado) {
  webpush.setVapidDetails(env.VAPID_SUBJECT, env.VAPID_PUBLIC, env.VAPID_PRIVATE);
}

export const pushHabilitado = habilitado;

/**
 * Envia uma notificação push para todos os dispositivos ativos de um usuário.
 * `dbh` opcional: se vier (contexto de tenant), usa-o; senão abre contexto de sistema.
 * Nunca lança — falha de push não pode quebrar o fluxo principal.
 */
export async function enviarPush(usuarioId, payload, dbh = null) {
  if (!habilitado) return { enviados: 0, push: 'desligado' };

  const buscar = (t) => t('push_subscriptions').where({ usuario_id: usuarioId, ativo: true });
  const subs = dbh ? await buscar(dbh) : await comSistema(buscar);
  if (subs.length === 0) return { enviados: 0 };

  const corpo = JSON.stringify(payload);
  let enviados = 0;
  const mortos = [];

  await Promise.all(
    subs.map(async (s) => {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          corpo,
        );
        enviados++;
      } catch (err) {
        // 410/404 = assinatura expirada/removida no navegador.
        if (err.statusCode === 410 || err.statusCode === 404) mortos.push(s.id);
      }
    }),
  );

  if (mortos.length) {
    const desativar = (t) => t('push_subscriptions').whereIn('id', mortos).update({ ativo: false });
    await (dbh ? desativar(dbh) : comSistema(desativar));
  }
  return { enviados, desativados: mortos.length };
}
