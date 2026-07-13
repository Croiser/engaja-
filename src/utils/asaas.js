// Cliente fino da API do Asaas (Fase 1 — cobrança). Usa fetch nativo (Node 20+).
// Sem a chave (ASAAS_API_KEY), TODAS as funções lançam — o chamador decide se a
// integração está ligada (ver asaasLigado()).
import { env } from '../config/env.js';
import { AppError } from './errors.js';

export const asaasLigado = () => !!env.ASAAS_API_KEY;

async function chamar(caminho, { metodo = 'GET', corpo } = {}) {
  if (!asaasLigado()) {
    throw new AppError('ASAAS_DESLIGADO', 'Integração de cobrança não configurada.', 503);
  }
  const resp = await fetch(`${env.ASAAS_BASE_URL}${caminho}`, {
    method: metodo,
    headers: {
      'Content-Type': 'application/json',
      access_token: env.ASAAS_API_KEY,
      // O Asaas pede um User-Agent identificável; sem ele algumas contas dão 403.
      'User-Agent': 'Engaja+/1.0',
    },
    body: corpo ? JSON.stringify(corpo) : undefined,
  });

  const texto = await resp.text();
  const dados = texto ? JSON.parse(texto) : {};
  if (!resp.ok) {
    // Asaas devolve { errors: [{ code, description }] }.
    const desc = dados?.errors?.[0]?.description || `Erro Asaas (${resp.status}).`;
    throw new AppError('ASAAS_ERRO', desc, 502, dados?.errors ?? null);
  }
  return dados;
}

// Cria (ou reidentifica) o cliente da academia no Asaas.
export function criarCliente({ nome, cpfCnpj, email, telefone, referenciaExterna }) {
  return chamar('/customers', {
    metodo: 'POST',
    corpo: {
      name: nome,
      cpfCnpj: cpfCnpj || undefined,
      email: email || undefined,
      mobilePhone: telefone || undefined,
      externalReference: referenciaExterna, // academia_id, pra reconciliar
    },
  });
}

// Cria a assinatura recorrente mensal. valorCentavos → reais (Asaas usa float).
export function criarAssinatura({ clienteId, valorCentavos, diaVencimento, descricao, formaPagamento = 'UNDEFINED', referenciaExterna }) {
  const hoje = new Date();
  // Primeiro vencimento no próximo dia `diaVencimento` (ou hoje se ainda não passou).
  const prox = new Date(hoje.getFullYear(), hoje.getMonth(), diaVencimento);
  if (prox < hoje) prox.setMonth(prox.getMonth() + 1);
  const nextDueDate = prox.toISOString().slice(0, 10);

  return chamar('/subscriptions', {
    metodo: 'POST',
    corpo: {
      customer: clienteId,
      billingType: formaPagamento, // UNDEFINED = cliente escolhe (pix/boleto/cartão)
      value: valorCentavos / 100,
      nextDueDate,
      cycle: 'MONTHLY',
      description: descricao,
      externalReference: referenciaExterna,
    },
  });
}

// Cobrança avulsa (ex.: taxa de implantação, cobrada uma vez).
export function criarCobranca({ clienteId, valorCentavos, vencimento, descricao, formaPagamento = 'UNDEFINED', referenciaExterna }) {
  return chamar('/payments', {
    metodo: 'POST',
    corpo: {
      customer: clienteId,
      billingType: formaPagamento,
      value: valorCentavos / 100,
      dueDate: vencimento,
      description: descricao,
      externalReference: referenciaExterna,
    },
  });
}

export function cancelarAssinatura(assinaturaId) {
  return chamar(`/subscriptions/${assinaturaId}`, { metodo: 'DELETE' });
}
