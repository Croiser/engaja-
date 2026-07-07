import { Erros } from '../../utils/errors.js';

// Mural interno do usuário logado. `dbh` = req.db (contexto de tenant).
export async function listar(dbh, usuarioId, { page = 1, limit = 20 }) {
  const offset = (page - 1) * limit;
  const [{ total }] = await dbh('notificacoes').where({ usuario_id: usuarioId }).count({ total: '*' });
  const itens = await dbh('notificacoes')
    .where({ usuario_id: usuarioId })
    .orderBy('criado_em', 'desc')
    .limit(limit)
    .offset(offset)
    .select('id', 'tipo', 'titulo', 'corpo', 'url', 'lida', 'criado_em');
  return { itens, total: Number(total), page, limit };
}

export async function contarNaoLidas(dbh, usuarioId) {
  const [{ n }] = await dbh('notificacoes').where({ usuario_id: usuarioId, lida: false }).count({ n: '*' });
  return { nao_lidas: Number(n) };
}

export async function marcarLida(dbh, usuarioId, id) {
  const n = await dbh('notificacoes')
    .where({ id, usuario_id: usuarioId })
    .update({ lida: true, lida_em: dbh.fn.now() });
  if (!n) throw Erros.naoEncontrado('Notificação');
}

export async function marcarTodasLidas(dbh, usuarioId) {
  await dbh('notificacoes')
    .where({ usuario_id: usuarioId, lida: false })
    .update({ lida: true, lida_em: dbh.fn.now() });
}
