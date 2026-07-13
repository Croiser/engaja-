// Fase 1 — orquestração da cobrança recorrente via Asaas.
// Fica separado de superadmin.service.js (que é CRUD puro no banco) porque aqui
// há efeito colateral externo (chamadas ao Asaas) — mais fácil de isolar/testar.
import * as asaas from '../../utils/asaas.js';
import { registrar } from '../../utils/auditoria.js';
import { Erros, AppError } from '../../utils/errors.js';

// Ativa a cobrança recorrente de uma academia:
//   1) garante o cliente no Asaas (cria e guarda asaas_customer_id se ainda não tem)
//   2) cria a assinatura mensal recorrente (valor = mensalidade do plano)
//   3) se o plano tem implantação > 0, cria UMA cobrança avulsa da taxa
// Idempotente no cliente (não recria se já existe). A assinatura NÃO é recriada se
// já houver asaas_subscription_id — evita cobrança duplicada.
export async function ativarCobranca(dbh, ator, academiaId, dadosCobranca, req) {
  if (!asaas.asaasLigado()) throw new AppError('ASAAS_DESLIGADO', 'Integração de cobrança não configurada no servidor.', 503);

  const academia = await dbh('academias').where({ id: academiaId }).first('id', 'nome', 'asaas_customer_id');
  if (!academia) throw Erros.naoEncontrado('Academia');

  const assinatura = await dbh('assinaturas as s')
    .join('planos as p', 'p.id', 's.plano_id')
    .where('s.academia_id', academiaId)
    .first('s.id', 's.dia_vencimento', 's.asaas_subscription_id', 'p.nome as plano_nome', 'p.preco_mensal_centavos', 'p.preco_implantacao_centavos');
  if (!assinatura) throw new AppError('SEM_PLANO', 'Defina o plano da academia antes de ativar a cobrança.', 422);
  if (assinatura.asaas_subscription_id) throw new AppError('JA_ATIVA', 'Esta academia já tem cobrança recorrente ativa no Asaas.', 409);

  // 1) Cliente no Asaas (reaproveita se já existe).
  let customerId = academia.asaas_customer_id;
  if (!customerId) {
    const cliente = await asaas.criarCliente({
      nome: dadosCobranca.nome_cobranca || academia.nome,
      cpfCnpj: dadosCobranca.cpf_cnpj,
      email: dadosCobranca.email,
      telefone: dadosCobranca.telefone,
      referenciaExterna: academiaId,
    });
    customerId = cliente.id;
    await dbh('academias').where({ id: academiaId }).update({ asaas_customer_id: customerId });
  }

  // 2) Assinatura mensal recorrente.
  const sub = await asaas.criarAssinatura({
    clienteId: customerId,
    valorCentavos: assinatura.preco_mensal_centavos,
    diaVencimento: assinatura.dia_vencimento,
    descricao: `Engaja+ — plano ${assinatura.plano_nome}`,
    referenciaExterna: academiaId,
  });
  await dbh('assinaturas').where({ id: assinatura.id }).update({
    asaas_subscription_id: sub.id,
    status: 'ativa',
    atualizado_em: dbh.fn.now(),
  });

  // 3) Taxa de implantação (cobrança avulsa, uma vez), se houver.
  let cobrancaImplantacao = null;
  if (assinatura.preco_implantacao_centavos > 0) {
    const hoje = new Date().toISOString().slice(0, 10);
    cobrancaImplantacao = await asaas.criarCobranca({
      clienteId: customerId,
      valorCentavos: assinatura.preco_implantacao_centavos,
      vencimento: hoje,
      descricao: `Engaja+ — implantação (${assinatura.plano_nome})`,
      referenciaExterna: academiaId,
    });
    await dbh('pagamentos').insert({
      assinatura_id: assinatura.id,
      academia_id: academiaId,
      valor_centavos: assinatura.preco_implantacao_centavos,
      referente_a: `Implantação (${assinatura.plano_nome})`,
      pago_em: hoje,
      vencimento: hoje,
      status: 'pendente',
      forma: 'pix',
      asaas_payment_id: cobrancaImplantacao.id,
      registrado_por: ator.id,
    });
  }

  await registrar(dbh, {
    academiaId,
    usuarioId: ator.id,
    acao: 'ativa_cobranca_asaas',
    entidade: 'assinatura',
    entidadeId: assinatura.id,
    detalhes: { asaas_subscription_id: sub.id, asaas_customer_id: customerId },
    req,
  });

  return {
    ok: true,
    asaas_subscription_id: sub.id,
    link_implantacao: cobrancaImplantacao?.invoiceUrl ?? null,
  };
}
