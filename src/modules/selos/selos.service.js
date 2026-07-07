import { Erros } from '../../utils/errors.js';

// ===================== ADMIN (gerente) — CRUD do catálogo de selos =====================
export const listarAdmin = (dbh) => dbh('selos').orderBy('meta', 'asc');

export async function criar(dbh, ator, dados) {
  const [s] = await dbh('selos').insert({ ...dados, academia_id: ator.academia_id }).returning('*');
  return s;
}

export async function atualizar(dbh, id, dados) {
  const [s] = await dbh('selos').where({ id }).update(dados).returning('*');
  if (!s) throw Erros.naoEncontrado('Selo');
  return s;
}

export async function remover(dbh, id) {
  // Selos já conquistados (alunos_selos) referenciam o id — apagar quebraria o histórico
  // do aluno. Em vez de DELETE, desativa (mesmo padrão de "soft delete" via ativo=false
  // usado pra prêmios não se aplica aqui por causa da FK; então bloqueia se já concedido).
  const concedido = await dbh('alunos_selos').where({ selo_id: id }).first('selo_id');
  if (concedido) {
    await dbh('selos').where({ id }).update({ ativo: false });
    return;
  }
  const n = await dbh('selos').where({ id }).del();
  if (!n) throw Erros.naoEncontrado('Selo');
}
