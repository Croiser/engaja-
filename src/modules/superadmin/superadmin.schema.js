import { z } from 'zod';

// Cria a academia + o gerente inicial dela (login próprio, senha padrão "123").
export const criarAcademiaSchema = z.object({
  nome: z.string().min(2).max(150),
  dominio: z.string().max(150).optional(),
  cor_primaria: z.string().max(9).optional(),
  cor_secundaria: z.string().max(9).optional(),
  gerente_nome: z.string().min(2).max(150),
  gerente_login: z.string().min(3).max(20).regex(/^[A-Za-z0-9_.-]+$/, 'Login inválido'),
});

// Edição de marca/dados da academia (nunca mexe em cobrança/status aqui).
export const atualizarAcademiaSchema = z
  .object({
    nome: z.string().min(2).max(150),
    dominio: z.string().max(150).nullable(),
    logo_url: z.string().url().nullable(),
    cor_primaria: z.string().max(9),
    cor_secundaria: z.string().max(9),
  })
  .partial();

// ---- Planos (catálogo da plataforma) ----
export const criarPlanoSchema = z.object({
  nome: z.string().min(2).max(60),
  preco_implantacao_centavos: z.number().int().min(0).max(100_000_000),
  preco_mensal_centavos: z.number().int().min(0).max(100_000_000),
  limite_alunos: z.number().int().min(1).max(1_000_000).nullable().optional(),
  ativo: z.boolean().optional(),
});

export const atualizarPlanoSchema = criarPlanoSchema.partial();

// ---- Assinatura da academia (define/troca plano, status, quitação) ----
export const definirAssinaturaSchema = z.object({
  plano_id: z.string().uuid(),
  status: z.enum(['ativa', 'inadimplente', 'cancelada']).optional(),
  dia_vencimento: z.number().int().min(1).max(28).optional(),
  pago_ate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Data no formato AAAA-MM-DD').nullable().optional(),
  observacoes: z.string().max(2000).nullable().optional(),
});

// ---- Pagamento manual (Pix/link — até a integração Asaas) ----
export const registrarPagamentoSchema = z.object({
  valor_centavos: z.number().int().min(1).max(100_000_000),
  referente_a: z.string().min(2).max(120),
  pago_em: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Data no formato AAAA-MM-DD').optional(),
  // Conveniência: já atualiza o "pago até" da assinatura no mesmo passo.
  novo_pago_ate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Data no formato AAAA-MM-DD').optional(),
});
