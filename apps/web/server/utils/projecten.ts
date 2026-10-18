// Gedeelde hulp voor de projecten-handlers: Zod-validatie van id, body en
// If-Match, en de vertaling van ProjectFout naar HTTP-statussen. Nitro importeert
// de exports van server/utils automatisch.
import type { H3Event } from "h3";
import { z } from "zod";
import { ProjectFout } from "../projecten/repo";

const IdSchema = z.uuid();

export const NieuwProjectSchema = z.object({
  naam: z.string().trim().min(1),
  klantnaam: z.string().default(""),
  stroomtype: z.enum(["2x230V", "3x230V", "3N400V"]),
});

export const BewaarProjectSchema = z.object({
  naam: z.string().trim().min(1).optional(),
  document: z.record(z.string(), z.unknown()),
});

/** Een id dat geen uuid is, kan nooit een bestaand project zijn: 404. */
export function projectId(event: H3Event): string {
  const id = IdSchema.safeParse(getRouterParam(event, "id"));
  if (!id.success) throw createError({ statusCode: 404, statusMessage: "Project niet gevonden" });
  return id.data;
}

/** Leest en valideert de JSON-body; een ongeldige body geeft 400 met de Zod-issues. */
export async function leesBody<T extends z.ZodType>(
  event: H3Event,
  schema: T,
): Promise<z.output<T>> {
  const resultaat = schema.safeParse(await readBody(event));
  if (!resultaat.success) {
    throw createError({
      statusCode: 400,
      statusMessage: "Ongeldige invoer",
      data: { issues: resultaat.error.issues },
    });
  }
  return resultaat.data;
}

/** `If-Match` moet een geheel getal zijn (de documentversie); anders 428. */
export function leesIfMatch(event: H3Event): number {
  const waarde = getHeader(event, "if-match")?.trim();
  if (waarde === undefined || !/^\d+$/.test(waarde)) {
    throw createError({
      statusCode: 428,
      statusMessage: "If-Match met de documentversie is verplicht",
    });
  }
  return Number(waarde);
}

/** Voert een repo-aanroep uit en vertaalt ProjectFout naar 404, 409 of 422. */
export async function metProjectFouten<T>(actie: () => Promise<T>): Promise<T> {
  try {
    return await actie();
  } catch (fout) {
    if (!(fout instanceof ProjectFout)) throw fout;
    switch (fout.code) {
      case "NIET_GEVONDEN":
        throw createError({ statusCode: 404, statusMessage: "Project niet gevonden" });
      case "CONFLICT":
        throw createError({
          statusCode: 409,
          statusMessage: "Het project is intussen gewijzigd",
          data: fout.details,
        });
      case "ONGELDIG":
        throw createError({
          statusCode: 422,
          statusMessage: "Ongeldig document",
          data: fout.details,
        });
    }
  }
}
