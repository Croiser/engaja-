// =====================================================================
// Motor de pontos — carteira via ledger imutável.
//
// REGRAS TRAVADAS (reunião 03/07 + revisão de arquitetura):
//  - pontos_ledger é append-only: NUNCA UPDATE/DELETE. Toda correção é um novo lançamento.
//  - usuarios.saldo_atual e pontos_acumulados_vida são CACHES atualizados na MESMA transação.
//  - Débito é atômico via UPDATE ... WHERE saldo_atual >= q RETURNING (guard anti-corrida).
//  - Só lançamento validado entra no saldo. Check-in vira validado após 48h (job).
//
// Todas as funções recebem `trx` (transação Knex). O chamador abre a transação e,
// na sequência, chama selos.avaliarSelos(trx, ...). Ver src/engine/index.js.
// =====================================================================
import { Erros } from '../utils/errors.js';

/**
 * Credita pontos (quantidade > 0). Se validado=true, reflete nos caches na hora.
 * Check-in entra com validado=false (não mexe no saldo até o job de 48h validar).
 */
export async function creditar(
  trx,
  { alunoId, academiaId, tipoEvento, quantidade, descricao = null, refId = null, auditadoPor = null, validado = true },
) {
  if (quantidade <= 0) throw new Error('creditar() exige quantidade > 0');

  const [lancamento] = await trx('pontos_ledger')
    .insert({
      aluno_id: alunoId,
      academia_id: academiaId,
      tipo_evento: tipoEvento,
      quantidade,
      descricao,
      validado,
      ref_id: refId,
      auditado_por: auditadoPor,
    })
    .returning('*');

  if (validado) {
    // Crédito positivo alimenta saldo E o acumulado-vida (base dos níveis, só cresce).
    await trx('usuarios')
      .where({ id: alunoId })
      .increment('saldo_atual', quantidade)
      .increment('pontos_acumulados_vida', quantidade);
  }

  return lancamento;
}

/**
 * Debita pontos (resgate, ajuste manual negativo). `quantidade` positiva; grava negativo.
 * Guard atômico: só debita se saldo_atual >= quantidade. Nunca deixa saldo negativo.
 * NÃO mexe em pontos_acumulados_vida (resgatar não rebaixa nível).
 */
export async function debitar(
  trx,
  { alunoId, academiaId, tipoEvento, quantidade, descricao = null, refId = null, auditadoPor = null },
) {
  if (quantidade <= 0) throw new Error('debitar() exige quantidade > 0');

  const linhas = await trx('usuarios')
    .where('id', alunoId)
    .andWhere('saldo_atual', '>=', quantidade)
    .decrement('saldo_atual', quantidade);

  if (linhas === 0) throw Erros.saldoInsuficiente();

  const [lancamento] = await trx('pontos_ledger')
    .insert({
      aluno_id: alunoId,
      academia_id: academiaId,
      tipo_evento: tipoEvento,
      quantidade: -quantidade,
      descricao,
      validado: true,
      ref_id: refId,
      auditado_por: auditadoPor,
    })
    .returning('*');

  return lancamento;
}

/**
 * Zera o saldo ao cancelar/inativar aluno, preservando o histórico do ledger
 * (lançamento negativo explícito, nunca DELETE). pontos_acumulados_vida NÃO é tocado.
 */
export async function zerarSaldo(trx, { alunoId, academiaId, auditadoPor = null }) {
  const aluno = await trx('usuarios').where({ id: alunoId }).first('saldo_atual');
  if (!aluno || aluno.saldo_atual <= 0) return null;

  return debitar(trx, {
    alunoId,
    academiaId,
    tipoEvento: 'cancelamento_zera_saldo',
    quantidade: aluno.saldo_atual,
    descricao: 'Saldo zerado por cancelamento/inativação da matrícula',
    auditadoPor,
  });
}

// Leituras usam os caches (rápido). O SUM sobre o ledger fica para reconciliação/auditoria.
export async function obterSaldo(alunoId, conn) {
  const u = await conn('usuarios').where({ id: alunoId }).first('saldo_atual');
  return u?.saldo_atual ?? 0;
}

export async function obterAcumuladoVida(alunoId, conn) {
  const u = await conn('usuarios').where({ id: alunoId }).first('pontos_acumulados_vida');
  return u?.pontos_acumulados_vida ?? 0;
}
