import { concluirDesafio } from '../../engine/desafios.js';
import { registrar } from '../../utils/auditoria.js';
import { Erros } from '../../utils/errors.js';

// Todos recebem `dbh` = req.db (contexto de tenant). `ator` = req.usuario (quem faz).
// CRUD de desafios editáveis pela academia (reunião: nome/pontos/critério/meta livres).

export async function listar(dbh) {
  return dbh('desafios').orderBy('criado_em', 'desc');
}

export async function criar(dbh, ator, dados, req) {
  const [desafio] = await dbh('desafios')
    .insert({ ...dados, academia_id: ator.academia_id, criado_por: ator.id })
    .returning('*');
  await registrar(dbh, {
    academiaId: ator.academia_id,
    usuarioId: ator.id,
    acao: 'cria_desafio',
    entidade: 'desafio',
    entidadeId: desafio.id,
    detalhes: { nome: desafio.nome, pontos: desafio.pontos },
    req,
  });
  return desafio;
}

export async function atualizar(dbh, ator, id, dados, req) {
  const [desafio] = await dbh('desafios').where({ id }).update(dados).returning('*');
  if (!desafio) throw Erros.naoEncontrado('Desafio');
  await registrar(dbh, {
    academiaId: ator.academia_id,
    usuarioId: ator.id,
    acao: 'edita_desafio',
    entidade: 'desafio',
    entidadeId: id,
    detalhes: dados,
    req,
  });
  return desafio;
}

export async function remover(dbh, ator, id, req) {
  const n = await dbh('desafios').where({ id }).del();
  if (!n) throw Erros.naoEncontrado('Desafio');
  await registrar(dbh, {
    academiaId: ator.academia_id,
    usuarioId: ator.id,
    acao: 'remove_desafio',
    entidade: 'desafio',
    entidadeId: id,
    req,
  });
}

// Marca um desafio como concluído para um aluno (ex.: avaliação física feita → +pontos).
// Credita, concede selo e audita — tudo na transação do req.db.
export async function concluirParaAluno(dbh, ator, { alunoId, desafioId }, req) {
  const aluno = await dbh('usuarios').where({ id: alunoId, tipo: 'aluno' }).first('id', 'academia_id');
  if (!aluno) throw Erros.naoEncontrado('Aluno');
  const desafio = await dbh('desafios').where({ id: desafioId }).first();
  if (!desafio) throw Erros.naoEncontrado('Desafio');

  const r = await concluirDesafio(dbh, { aluno, desafio, auditadoPor: ator.id });

  if (r.concluido) {
    await registrar(dbh, {
      academiaId: ator.academia_id,
      usuarioId: ator.id,
      acao: 'conclui_desafio_aluno',
      entidade: 'desafio',
      entidadeId: desafioId,
      detalhes: { aluno_id: alunoId, pontos: r.pontos },
      req,
    });
  }
  return r;
}
