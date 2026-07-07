import * as ledger from '../../engine/ledger.js';
import { gerarCodigoCurto } from '../../utils/crypto.js';
import { notificar } from '../../utils/notificacoes.js';
import { registrar } from '../../utils/auditoria.js';
import { Erros } from '../../utils/errors.js';

// ===================== ADMIN (gerente) =====================
export const listarAdmin = (dbh) => dbh('premios').orderBy('nome', 'asc');

export async function criar(dbh, ator, dados) {
  const [p] = await dbh('premios').insert({ ...dados, academia_id: ator.academia_id }).returning('*');
  return p;
}

export async function atualizar(dbh, id, dados) {
  const [p] = await dbh('premios').where({ id }).update(dados).returning('*');
  if (!p) throw Erros.naoEncontrado('Prêmio');
  return p;
}

export async function remover(dbh, id) {
  const n = await dbh('premios').where({ id }).del();
  if (!n) throw Erros.naoEncontrado('Prêmio');
}

// ===================== VITRINE (aluno) =====================
export const vitrine = (dbh) =>
  dbh('premios')
    .where({ ativo: true })
    .orderBy('custo_pontos', 'asc')
    .select('id', 'nome', 'imagem_url', 'custo_pontos', 'estoque');

// ===================== RESGATE (aluno) — ponto crítico de concorrência =====================
// Roda dentro da transação do req.db. Dois guards atômicos:
//   1) estoque:  UPDATE ... WHERE estoque > 0 RETURNING  (elimina corrida no último item)
//   2) saldo:    ledger.debitar usa UPDATE ... WHERE saldo_atual >= custo  (não fica negativo)
// Se qualquer um falhar, a transação inteira faz rollback — nada é aplicado pela metade.
export async function resgatar(dbh, aluno, premioId) {
  const premio = await dbh('premios').where({ id: premioId, ativo: true }).first('id', 'nome', 'custo_pontos');
  if (!premio) throw Erros.naoEncontrado('Prêmio');

  // 1) Baixa de estoque atômica.
  const baixou = await dbh('premios')
    .where('id', premioId)
    .andWhere('estoque', '>', 0)
    .decrement('estoque', 1);
  if (baixou === 0) throw Erros.semEstoque();

  // 2) Débito de saldo atômico (lança SALDO_INSUFICIENTE → rollback desfaz o estoque).
  await ledger.debitar(dbh, {
    alunoId: aluno.id,
    academiaId: aluno.academia_id,
    tipoEvento: 'resgate',
    quantidade: premio.custo_pontos,
    descricao: `Resgate: ${premio.nome}`,
    refId: premioId,
  });

  // 3) Voucher único para apresentar na recepção.
  let resgate;
  for (let i = 0; i < 5; i++) {
    const voucher = gerarCodigoCurto(8);
    try {
      [resgate] = await dbh('resgates')
        .insert({
          aluno_id: aluno.id,
          premio_id: premioId,
          academia_id: aluno.academia_id,
          custo_pontos: premio.custo_pontos,
          voucher_codigo: voucher,
          status: 'pendente',
        })
        .returning(['id', 'voucher_codigo', 'status']);
      break;
    } catch (e) {
      if (e.code === '23505' && i < 4) continue;
      throw e;
    }
  }

  await notificar(dbh, {
    usuarioId: aluno.id,
    academiaId: aluno.academia_id,
    tipo: 'resgate',
    titulo: 'Resgate confirmado 🎁',
    corpo: `Apresente o voucher ${resgate.voucher_codigo} na recepção para retirar: ${premio.nome}.`,
    url: '/me/resgates',
  });

  return { voucher: resgate.voucher_codigo, premio: premio.nome, custo: premio.custo_pontos };
}

export const meusResgates = (dbh, alunoId) =>
  dbh('resgates as r')
    .join('premios as p', 'p.id', 'r.premio_id')
    .where('r.aluno_id', alunoId)
    .orderBy('r.criado_em', 'desc')
    .select('r.id', 'p.nome as premio', 'r.custo_pontos', 'r.voucher_codigo', 'r.status', 'r.criado_em');

// ===================== RECEPÇÃO: baixa do voucher na retirada =====================
export async function retirar(dbh, ator, voucher, req) {
  const r = await dbh('resgates').where({ voucher_codigo: voucher }).forUpdate().first();
  if (!r) throw Erros.naoEncontrado('Voucher');
  if (r.status !== 'pendente') throw Erros.codigoInvalido();

  await dbh('resgates').where({ id: r.id }).update({ status: 'retirado', retirado_em: dbh.fn.now() });
  await registrar(dbh, {
    academiaId: ator.academia_id,
    usuarioId: ator.id,
    acao: 'retira_resgate',
    entidade: 'resgate',
    entidadeId: r.id,
    detalhes: { voucher },
    req,
  });
  return { ok: true };
}
