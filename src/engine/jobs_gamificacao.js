// =====================================================================
// Jobs diários de gamificação (rodam em contexto de SISTEMA — cross-tenant).
// =====================================================================
import { db, comSistema } from '../config/db.js';
import * as ledger from './ledger.js';
import { avaliarSelos } from './selos.js';
import { notificar } from '../utils/notificacoes.js';

const PONTOS_ANIVERSARIO = 300;

/**
 * Zera o streak de quem NÃO fez check-in ontem nem hoje (quebrou a sequência).
 * Não mexe em pontos já creditados. Retorna quantos foram resetados.
 */
export async function resetarStreaksQuebrados() {
  const r = await comSistema((trx) =>
    trx('usuarios')
      .where('tipo', 'aluno')
      .andWhere('ativo', true)
      .andWhere('streak_atual', '>', 0)
      .andWhere((qb) =>
        qb
          .whereNull('ultimo_checkin_dia')
          .orWhereRaw(`ultimo_checkin_dia < (now() AT TIME ZONE 'America/Sao_Paulo')::date - 1`),
      )
      .update({ streak_atual: 0 }),
  );
  return r;
}

/**
 * Credita +300 para quem faz aniversário HOJE (fuso do negócio), 1x por ano.
 * Idempotência: checa se já houve lançamento 'aniversario' no ano corrente antes de creditar.
 * Retorna quantos foram creditados.
 */
export async function creditarAniversariantes() {
  const aniversariantes = await comSistema((trx) =>
    trx('usuarios')
      .where('tipo', 'aluno')
      .andWhere('ativo', true)
      .andWhereRaw(
        `to_char(data_nascimento, 'MM-DD') = to_char((now() AT TIME ZONE 'America/Sao_Paulo')::date, 'MM-DD')`,
      )
      .select('id', 'academia_id'),
  );

  let creditados = 0;
  for (const a of aniversariantes) {
    await db.transaction(async (trx) => {
      await trx.raw(`SELECT set_config('app.bypass', 'on', true)`);
      // Já creditou este ano? (idempotente contra reexecução do cron)
      const ja = await trx('pontos_ledger')
        .where({ aluno_id: a.id, tipo_evento: 'aniversario' })
        .andWhereRaw(
          `date_part('year', criado_em AT TIME ZONE 'America/Sao_Paulo') = date_part('year', now() AT TIME ZONE 'America/Sao_Paulo')`,
        )
        .first('id');
      if (ja) return;

      await ledger.creditar(trx, {
        alunoId: a.id,
        academiaId: a.academia_id,
        tipoEvento: 'aniversario',
        quantidade: PONTOS_ANIVERSARIO,
        descricao: 'Presente de aniversário 🎂',
        validado: true,
      });
      await avaliarSelos(trx, a.id);
      creditados++;
    });
  }
  return creditados;
}

/**
 * Conta clubes vencendo nos próximos 30 dias, por academia (alerta do dashboard/recepção).
 * Só leitura; não credita nada. Retorna [{ academia_id, vencendo_30d }].
 */
export async function alertasVencimento() {
  return comSistema((trx) =>
    trx('usuarios')
      .where('tipo', 'aluno')
      .andWhere('ativo', true)
      .andWhereRaw(`data_vencimento BETWEEN CURRENT_DATE AND CURRENT_DATE + 30`)
      .groupBy('academia_id')
      .select('academia_id')
      .count({ vencendo_30d: '*' }),
  );
}

/**
 * Notifica alunos cujo clube vence em EXATAMENTE 7 ou 3 dias (mural + push).
 * Escolher dias exatos evita spam diário. Retorna quantos foram avisados.
 */
export async function notificarVencimentos() {
  const alunos = await comSistema((trx) =>
    trx('usuarios')
      .where('tipo', 'aluno')
      .andWhere('ativo', true)
      .andWhereRaw(`data_vencimento IN (CURRENT_DATE + 7, CURRENT_DATE + 3)`)
      .select('id', 'academia_id', 'data_vencimento'),
  );

  for (const a of alunos) {
    const dias = Math.round((new Date(a.data_vencimento).getTime() - Date.now()) / 86_400_000);
    await comSistema((trx) =>
      notificar(trx, {
        usuarioId: a.id,
        academiaId: a.academia_id,
        tipo: 'vencimento',
        titulo: 'Seu clube está vencendo',
        corpo: `Seu plano vence em ${dias <= 3 ? 3 : 7} dias. Renove para não perder os benefícios.`,
        url: '/me/carteirinha',
      }),
    );
  }
  return alunos.length;
}
