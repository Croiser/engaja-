import { z } from 'zod';

const TIPOS_CRITERIO = ['pontos_acumulados_vida', 'treinos_total', 'streak', 'indicacoes', 'dias_matricula'];

export const criarSeloSchema = z.object({
  nome: z.string().min(2).max(100),
  icone: z.string().max(50).nullable().optional(),
  imagem_url: z.string().url().nullable().optional(),
  tipo_criterio: z.enum(TIPOS_CRITERIO),
  meta: z.number().int().min(1),
  eh_nivel: z.boolean().optional(),
  ativo: z.boolean().optional(),
});

export const atualizarSeloSchema = criarSeloSchema.partial();
