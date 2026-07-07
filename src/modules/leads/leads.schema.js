import { z } from 'zod';

// Aluno registra uma indicação (vira lead origem=indicacao_aluno).
export const criarIndicacaoSchema = z.object({
  nome_indicado: z.string().min(2).max(150),
  telefone_indicado: z.string().min(8).max(20).optional(),
  email_indicado: z.string().email().optional(),
});

export const ESTAGIOS = ['novo', 'em_contato', 'agendado', 'matriculado', 'perdido'];

// Recepção move o lead no pipeline / agenda follow-up / assume responsabilidade.
export const atualizarLeadSchema = z
  .object({
    status: z.enum(['novo', 'em_contato', 'agendado', 'perdido']), // 'matriculado' só via /converter
    responsavel_id: z.string().uuid().nullable().optional(),
    proximo_contato_em: z.string().date().nullable().optional(),
    motivo_perda: z.string().max(500).optional(),
  })
  .partial();

export const interacaoSchema = z.object({
  tipo: z.enum(['ligacao', 'whatsapp', 'visita', 'nota']),
  texto: z.string().min(1).max(1000),
});

// Converter lead em aluno matriculado.
export const converterLeadSchema = z.object({
  matricula: z.string().min(3).max(20),
  cpf: z.string().min(11).max(14).optional(),
  plano: z.string().max(60).optional(),
  data_vencimento: z.string().date().optional(),
});
