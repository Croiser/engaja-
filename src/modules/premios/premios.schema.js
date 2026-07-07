import { z } from 'zod';

export const criarPremioSchema = z.object({
  nome: z.string().min(2).max(150),
  imagem_url: z.string().url().nullable().optional(),
  custo_pontos: z.number().int().min(1).max(1000000),
  estoque: z.number().int().min(0).max(100000).optional(),
  ativo: z.boolean().optional(),
});

export const atualizarPremioSchema = criarPremioSchema.partial();
