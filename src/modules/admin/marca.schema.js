import { z } from 'zod';

// Autoatendimento do gerente pra editar a própria marca. Sem `dominio` (só o
// superadmin mexe nisso — é infra, não visual) e sem `logo_url` (via upload, rota própria).
export const atualizarMarcaSchema = z
  .object({
    nome: z.string().min(2).max(150),
    cor_primaria: z.string().max(9),
    cor_secundaria: z.string().max(9),
  })
  .partial();
