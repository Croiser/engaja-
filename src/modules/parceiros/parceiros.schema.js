import { z } from 'zod';

// ---- Categorias (editáveis; cliente quer ~10) ----
export const categoriaSchema = z.object({
  nome: z.string().min(2).max(80),
  icone: z.string().max(50).optional(),
  ordem: z.number().int().min(0).optional(),
  ativo: z.boolean().optional(),
});

// ---- Parceiro. `login` opcional cria o usuário lojista (tipo='parceiro', senha "123"). ----
export const criarParceiroSchema = z.object({
  nome: z.string().min(2).max(150),
  categoria_id: z.string().uuid().nullable().optional(),
  logo_url: z.string().url().nullable().optional(),
  tipo_beneficio: z.enum(['DESCONTO', 'VALE']),
  valor_desconto: z.string().max(40).optional(),
  descricao: z.string().max(2000).optional(),
  endereco: z.string().max(500).optional(),
  regras: z.string().max(2000).optional(),
  limite_uso: z.enum(['ilimitado', '1_dia', '1_semana']).optional(),
  login: z.string().min(3).max(20).regex(/^[A-Za-z0-9_.-]+$/, 'Login inválido').optional(),
  ativo: z.boolean().optional(),
});

export const atualizarParceiroSchema = criarParceiroSchema.partial();

// ---- Lojista valida/confirma o código apresentado pelo aluno ----
export const codigoSchema = z.object({
  codigo: z.string().min(4).max(30),
});
