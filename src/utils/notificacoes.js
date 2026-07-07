// Serviço de notificação: grava no MURAL interno (fonte confiável) e dispara o
// Web Push (best-effort) por cima. Chamado pelos módulos (leads, pontos, vencimento…).
//
// `dbh` = handle com contexto do tenant do DESTINATÁRIO (req.db ou trx de sistema).
import { enviarPush } from '../engine/push.js';

/**
 * Cria uma notificação para um usuário (mural) e tenta entregar via push.
 * O insert no mural é aguardado; o push roda em background (não bloqueia a resposta).
 */
export async function notificar(dbh, { usuarioId, academiaId, tipo, titulo, corpo = null, url = null }) {
  const [notif] = await dbh('notificacoes')
    .insert({ usuario_id: usuarioId, academia_id: academiaId, tipo, titulo, corpo, url })
    .returning('id');

  // Push é best-effort: não esperar nem deixar falhar o fluxo principal.
  enviarPush(usuarioId, { titulo, corpo, url, tipo }).catch(() => {});

  return notif;
}

/**
 * Notifica vários usuários (ex.: toda a recepção/gerência sobre um lead novo).
 */
export async function notificarVarios(dbh, usuarioIds, dados) {
  await Promise.all(usuarioIds.map((id) => notificar(dbh, { ...dados, usuarioId: id })));
}
