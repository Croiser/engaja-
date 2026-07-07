import { z } from 'zod';

export const listaAlunosQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  q: z.string().max(100).optional(), // busca por nome/matrícula/cpf
  vencendo: z.coerce.boolean().optional(), // só quem vence em 30 dias
});

export const criarAlunoSchema = z.object({
  nome: z.string().min(2).max(150),
  matricula: z.string().min(3).max(20),
  cpf: z.string().min(11).max(14).optional(),
  telefone: z.string().max(20).optional(),
  email: z.string().email().optional(),
  plano: z.string().max(60).optional(),
  data_vencimento: z.string().date().optional(),
  data_nascimento: z.string().date().optional(),
  indicado_por: z.string().uuid().optional(), // credita +500 ao indicador
});

export const atualizarAlunoSchema = z
  .object({
    nome: z.string().min(2).max(150),
    telefone: z.string().max(20).nullable(),
    email: z.string().email().nullable(),
    plano: z.string().max(60).nullable(),
    data_vencimento: z.string().date().nullable(),
    data_nascimento: z.string().date().nullable(),
  })
  .partial();

export const ajustePontosSchema = z.object({
  quantidade: z.number().int().refine((n) => n !== 0, 'Quantidade não pode ser zero'),
  motivo: z.string().min(3).max(300),
});
