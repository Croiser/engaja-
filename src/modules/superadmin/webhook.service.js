// Processa os webhooks do Asaas. Roda SEMPRE em comSistema (cross-tenant, sem JWT).
// Idempotente: cada evento tem `id` único do Asaas; se já registramos, ignora.
//
// Eventos que importam pra recorrência:
//   PAYMENT_CONFIRMED / PAYMENT_RECEIVED → pagamento entrou: marca pago, quita, reativa.
//   PAYMENT_OVERDUE                        → venceu sem pagar: marca inadimplente_desde.
// (demais eventos são só logados e ignorados.)
import { registrar } from '../../utils/auditoria.js';

// Retorna { ignorado } ou { processado, tipo }. Nunca lança por evento desconhecido —
// só por erro real (o Asaas reentrega se receber !=200, então erro real = reentrega).
export async function processarWebhook(dbh, evento) {
  const eventoId = evento?.id || evento?.payment?.id && `${evento.event}:${evento.payment.id}`;
  if (!eventoId) return { ignorado: 'sem_id' };

  // Idempotência: grava o evento; se já existe (UNIQUE), não reprocessa.
  try {
    await dbh('webhook_eventos').insert({
      provedor: 'asaas',
      evento_id: eventoId,
      tipo: evento.event,
      payload: JSON.stringify(evento),
    });
  } catch (e) {
    if (e.code === '23505') return { ignorado: 'duplicado' };
    throw e;
  }

  const pagamento = evento.payment;
  if (!pagamento) return { processado: false, tipo: evento.event, motivo: 'sem_payment' };

  const academiaId = pagamento.externalReference || null;
  const assinaturaAsaasId = pagamento.subscription || null;

  // Localiza a assinatura pelo id do Asaas (recorrência) ou pela academia (avulsa).
  const assinatura = assinaturaAsaasId
    ? await dbh('assinaturas').where({ asaas_subscription_id: assinaturaAsaasId }).first()
    : academiaId
      ? await dbh('assinaturas').where({ academia_id: academiaId }).first()
      : null;

  if (evento.event === 'PAYMENT_CONFIRMED' || evento.event === 'PAYMENT_RECEIVED') {
    return confirmarPagamento(dbh, evento, pagamento, assinatura);
  }
  if (evento.event === 'PAYMENT_OVERDUE') {
    return marcarVencido(dbh, evento, pagamento, assinatura);
  }
  return { processado: false, tipo: evento.event, motivo: 'evento_ignorado' };
}

async function confirmarPagamento(dbh, evento, pagamento, assinatura) {
  const dadosPag = {
    status: 'confirmado',
    pago_em: pagamento.paymentDate || pagamento.confirmedDate || new Date().toISOString().slice(0, 10),
    forma: mapearForma(pagamento.billingType),
    valor_centavos: Math.round((pagamento.value ?? 0) * 100),
  };

  // Se já criamos a linha (ex.: implantação), atualiza; senão, insere (mensalidade nova).
  const existente = await dbh('pagamentos').where({ asaas_payment_id: pagamento.id }).first('id');
  if (existente) {
    await dbh('pagamentos').where({ id: existente.id }).update(dadosPag);
  } else if (assinatura) {
    await dbh('pagamentos').insert({
      assinatura_id: assinatura.id,
      academia_id: assinatura.academia_id,
      referente_a: pagamento.description || 'Mensalidade',
      vencimento: pagamento.dueDate || null,
      asaas_payment_id: pagamento.id,
      ...dadosPag,
    });
  }

  // Pagamento entrou → assinatura quite e ativa (limpa inadimplência).
  if (assinatura) {
    await dbh('assinaturas').where({ id: assinatura.id }).update({
      status: 'ativa',
      pago_ate: pagamento.dueDate || dadosPag.pago_em,
      inadimplente_desde: null,
      atualizado_em: dbh.fn.now(),
    });
    // Reativa a academia se estava suspensa por inadimplência.
    await dbh('academias').where({ id: assinatura.academia_id, ativo: false }).update({ ativo: true });
    await registrar(dbh, {
      academiaId: assinatura.academia_id,
      acao: 'pagamento_confirmado_asaas',
      entidade: 'assinatura',
      entidadeId: assinatura.id,
      detalhes: { asaas_payment_id: pagamento.id, valor: pagamento.value },
    });
  }
  return { processado: true, tipo: evento.event };
}

async function marcarVencido(dbh, evento, pagamento, assinatura) {
  await dbh('pagamentos').where({ asaas_payment_id: pagamento.id }).update({ status: 'vencido' });
  if (assinatura && !assinatura.inadimplente_desde) {
    // Marca o início da carência. A suspensão de fato acontece no job diário, depois
    // de `dias_carencia` — não corta na hora (evita derrubar por atraso de 1 dia).
    await dbh('assinaturas').where({ id: assinatura.id }).update({
      status: 'inadimplente',
      inadimplente_desde: pagamento.dueDate || new Date().toISOString().slice(0, 10),
      atualizado_em: dbh.fn.now(),
    });
    await registrar(dbh, {
      academiaId: assinatura.academia_id,
      acao: 'pagamento_vencido_asaas',
      entidade: 'assinatura',
      entidadeId: assinatura.id,
      detalhes: { asaas_payment_id: pagamento.id, vencimento: pagamento.dueDate },
    });
  }
  return { processado: true, tipo: evento.event };
}

function mapearForma(billingType) {
  const mapa = { PIX: 'pix', BOLETO: 'boleto', CREDIT_CARD: 'cartao' };
  return mapa[billingType] || 'manual';
}

// Job diário: suspende academias inadimplentes que passaram da carência.
// Roda em comSistema. Retorna quantas foram suspensas.
export async function suspenderInadimplentesVencidos(dbh) {
  // inadimplente_desde + dias_carencia < hoje → suspende.
  const vencidas = await dbh('assinaturas as s')
    .join('academias as a', 'a.id', 's.academia_id')
    .where('s.status', 'inadimplente')
    .whereNotNull('s.inadimplente_desde')
    .andWhere('a.ativo', true)
    .whereRaw(`s.inadimplente_desde + (s.dias_carencia || ' days')::interval < now()`)
    .select('s.id', 's.academia_id');

  for (const v of vencidas) {
    await dbh('academias').where({ id: v.academia_id }).update({ ativo: false });
    await registrar(dbh, {
      academiaId: v.academia_id,
      acao: 'suspende_inadimplente',
      entidade: 'assinatura',
      entidadeId: v.id,
      detalhes: { motivo: 'carencia_expirada' },
    });
  }
  return vencidas.length;
}
