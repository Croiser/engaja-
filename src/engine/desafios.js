// =====================================================================
// Motor de desafios/atividades (editáveis pelo admin).
// Tipos: check_in_consecutivo, indicacao, atividade, livre.
//
// Concluir um desafio: credita os pontos do desafio + concede o selo vinculado
// (se houver) + reavalia selos — tudo na MESMA transação. Idempotente: se já
// concluído, não credita de novo.
// =====================================================================
import * as ledger from './ledger.js';
import { avaliarSelos, concederSelo } from './selos.js';

/**
 * Marca um desafio como concluído para um aluno e aplica as recompensas.
 * Deve rodar dentro de `trx` (contexto de tenant ou sistema conforme o chamador).
 * Retorna { concluido, pontos, novosSelos } ou { jaConcluido: true }.
 */
export async function concluirDesafio(trx, { aluno, desafio, auditadoPor = null, incremento = null }) {
  // Estado atual do progresso (trava a linha para evitar conclusão dupla concorrente).
  const prog = await trx('desafios_progresso')
    .where({ aluno_id: aluno.id, desafio_id: desafio.id })
    .forUpdate()
    .first();

  if (prog?.concluido) return { jaConcluido: true };

  // Atualiza/insere progresso. Para 'atividade'/'livre' a conclusão é direta;
  // para metas (check_in_consecutivo/indicacao) respeita `meta` se `incremento` vier.
  const novoProgresso = incremento != null ? (prog?.progresso ?? 0) + incremento : desafio.meta ?? 1;
  const atingiu = desafio.meta == null ? true : novoProgresso >= desafio.meta;

  await trx('desafios_progresso')
    .insert({
      aluno_id: aluno.id,
      desafio_id: desafio.id,
      progresso: novoProgresso,
      concluido: atingiu,
      concluido_em: atingiu ? trx.fn.now() : null,
    })
    .onConflict(['aluno_id', 'desafio_id'])
    .merge({
      progresso: novoProgresso,
      concluido: atingiu,
      concluido_em: atingiu ? trx.fn.now() : null,
    });

  if (!atingiu) return { concluido: false, progresso: novoProgresso, meta: desafio.meta };

  // Recompensa: credita pontos do desafio.
  await ledger.creditar(trx, {
    alunoId: aluno.id,
    academiaId: aluno.academia_id ?? desafio.academia_id,
    tipoEvento: 'desafio',
    quantidade: desafio.pontos,
    descricao: `Desafio concluído: ${desafio.nome}`,
    refId: desafio.id,
    auditadoPor,
    validado: true,
  });

  // Selo vinculado ao desafio (ex.: Embaixador), se houver.
  if (desafio.selo_id) await concederSelo(trx, aluno.id, desafio.selo_id);

  // Reavalia selos por critério (pode ter cruzado um limiar com os novos pontos).
  const novosSelos = await avaliarSelos(trx, aluno.id);

  return { concluido: true, pontos: desafio.pontos, novosSelos };
}
