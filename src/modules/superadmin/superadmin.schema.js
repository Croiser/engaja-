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
