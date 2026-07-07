import { z } from 'zod';

export const criarDesafioSchema = z.object({
  nome: z.string().min(2).max(120),
  descricao: z.string().max(1000).optional(),
  tipo: z.enum(['check_in_consecutivo', 'indicacao', 'atividade', 'livre']),
  pontos: z.number().int().min(0).max(100000),
  meta: z.number().int().min(1).max(100000).nullable().optional(),
  selo_id: z.string().uuid().nullable().optional(),
  data_inicio: z.string().date().nullable().optional(),
  data_fim: z.string().date().nullable().optional(),
  ativo: z.boolean().optional().default(true),
});

// Update: todos opcionais (PATCH parcial).
export const atualizarDesafioSchema = criarDesafioSchema.partial();
