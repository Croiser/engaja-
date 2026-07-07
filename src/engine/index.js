// Fachada pública do motor de gamificação. Os módulos importam daqui, não dos arquivos internos.
import { db } from '../config/db.js';
import * as ledger from './ledger.js';
import * as selos from './selos.js';

export { ledger, selos };

/**
 * Executa um evento de pontos de forma atômica: credita (ou debita) e reavalia selos
 * na MESMA transação. Se qualquer passo falhar, nada é aplicado (rollback).
 *
 * Uso típico:
 *   const { lancamento, novosSelos } = await aplicarEvento(async (trx) =>
 *     ledger.creditar(trx, { alunoId, academiaId, tipoEvento: 'aniversario', quantidade: 300 }),
 *   , alunoId);
 */
export async function aplicarEvento(operacao, alunoId) {
  return db.transaction(async (trx) => {
    const lancamento = await operacao(trx);
    const novosSelos = await selos.avaliarSelos(trx, alunoId);
    return { lancamento, novosSelos };
  });
}
