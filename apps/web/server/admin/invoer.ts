import { getRouterParam, type H3Event } from "h3";
import { z } from "zod";
import { maakFout, nietGevondenFout } from "../fouten";

export const PagineringSchema = z.object({
  pagina: z.coerce.number().int().min(1).max(1_000_000).default(1),
  perPagina: z.coerce.number().int().min(1).max(100).default(25),
});
export const RedenSchema = z.string().trim().min(1).max(1000);
export const MutatieBasisSchema = z.object({
  mutatieId: z.uuid(), reden: RedenSchema, verwacht: z.string().regex(/^[a-f0-9]{64}$/),
});

export function parseAdmin<T extends z.ZodType>(schema: T, invoer: unknown): z.infer<T> {
  const resultaat = schema.safeParse(invoer);
  if (!resultaat.success) throw maakFout(400, "Ongeldige beheerinvoer", "ONGELDIGE_INVOER");
  return resultaat.data;
}

export function adminId(event: H3Event): string {
  const id = getRouterParam(event, "id");
  if (!id || id.length > 200) throw nietGevondenFout();
  return id;
}
