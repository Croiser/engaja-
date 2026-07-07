import { z } from 'zod';

export const checkinSchema = z
  .object({
    metodo: z.enum(['geoloc', 'qr']),
    lat: z.number().min(-90).max(90).optional(),
    lng: z.number().min(-180).max(180).optional(),
    foto_url: z.string().url().optional(),
    qr_token: z.string().optional(),
  })
  .refine((d) => (d.metodo === 'qr' ? !!d.qr_token : d.lat != null && d.lng != null), {
    message: 'geoloc exige lat/lng; qr exige qr_token',
  });

export const extratoQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});
