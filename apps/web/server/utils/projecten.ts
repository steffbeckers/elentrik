// Gedeelde hulp voor de projecten-handlers: Zod-validatie van id, body en
// If-Match, en de vertaling van ProjectFout naar HTTP-statussen. Nitro importeert
// de exports van server/utils automatisch.
// Expliciete imports, geen Nitro-auto-imports: Vitest importeert deze module
// rechtstreeks (ruling E10).
import { StroomtypeSchema } from "@elentrik/model";
import { createError, getHeader, getRouterParam, readBody, type H3Event } from "h3";
import { z } from "zod";
import { nietGevondenFout } from "../fouten";
import { ProjectFout } from "../projecten/repo";

/** Een id in de database: een uuid. Ook gebruikt door de bestanden-hulp en de exports-repo. */
export const IdSchema = z.uuid();

/** De `versie`-kolom is een Postgres int4: grotere waarden zijn nooit een geldige versie. */
const MAX_VERSIE = 2147483647;

export const NieuwProjectSchema = z.object({
  naam: z.string().trim().min(1),
  klantnaam: z.string().default(""),
  stroomtype: StroomtypeSchema,
});

export const BewaarProjectSchema = z.object({
  naam: z.string().trim().min(1).optional(),
  document: z.record(z.string(), z.unknown()),
});

/** Zoveel verschillende planbestanden mag een document hebben dat als nieuw project gekopieerd wordt (zoals `DupliceerSchema`). */
export const MAX_PLANBESTANDEN_UIT_DOCUMENT = 200;

/** Het aantal verschillende planbestand-id's in een (nog niet gevalideerd) document; wat er niet uitziet als een plan telt niet. */
function aantalPlanbestanden(document: Record<string, unknown>): number {
  const situatie = document.situatie as { paginas?: unknown } | null | undefined;
  const paginas = Array.isArray(situatie?.paginas) ? (situatie.paginas as unknown[]) : [];
  const ids = new Set<string>();
  for (const pagina of paginas) {
    const achtergrond = (pagina as { achtergrond?: Record<string, unknown> } | null)?.achtergrond;
    for (const sleutel of ["origineelBestandId", "rasterBestandId"] as const) {
      const id = achtergrond?.[sleutel];
      if (typeof id === "string") ids.add(id);
    }
  }
  return ids.size;
}

/**
 * Een nieuw project uit het document van de editor ("Bewaar als nieuw project"). Het document wordt
 * door de repo volledig gevalideerd. De naam volgt dezelfde regel als `NieuwProjectSchema` en
 * `BewaarProjectSchema` (geen maximum), zodat elke bestaande projectnaam als nieuw project kan worden
 * bewaard. Het aantal planbestanden is begrensd: meer dan 200 verschillende is 400 ONGELDIGE_INVOER.
 */
export const ProjectUitDocumentSchema = z.object({
  naam: z.string().trim().min(1),
  document: z
    .record(z.string(), z.unknown())
    .refine((document) => aantalPlanbestanden(document) <= MAX_PLANBESTANDEN_UIT_DOCUMENT, {
      message: "Een document mag hoogstens 200 verschillende planbestanden hebben.",
    }),
});

/**
 * De body van het dupliceren is optioneel: de planbestanden die de editor kent maar het opgeslagen
 * document niet. Begrensd; wat geen bestand van het project is, negeert de repo.
 */
export const DupliceerSchema = z
  .object({ bestandIds: z.array(z.string().max(100)).max(200).default([]) })
  .default({ bestandIds: [] });

/** Een id dat geen uuid is, kan nooit een bestaand project zijn: 404. */
export function projectId(event: H3Event): string {
  const id = IdSchema.safeParse(getRouterParam(event, "id"));
  if (!id.success) throw nietGevondenFout();
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
      data: { issues: resultaat.error.issues, code: "ONGELDIGE_INVOER" },
    });
  }
  return resultaat.data;
}

/** `If-Match` moet een geheel getal binnen int4 zijn (de documentversie); anders 428. */
export function leesIfMatch(event: H3Event): number {
  const waarde = getHeader(event, "if-match")?.trim();
  const versie = waarde !== undefined && /^\d+$/.test(waarde) ? Number(waarde) : Number.NaN;
  if (!Number.isSafeInteger(versie) || versie > MAX_VERSIE) {
    throw createError({
      statusCode: 428,
      statusMessage: "If-Match met de documentversie is verplicht",
      data: { code: "IF_MATCH_VEREIST" },
    });
  }
  return versie;
}

/** De details van een ProjectFout (een object met bv. `versie`) samen met de foutcode, voor `data`. */
function metDetails(details: unknown): Record<string, unknown> {
  if (details === undefined) return {};
  return details !== null && typeof details === "object" && !Array.isArray(details)
    ? (details as Record<string, unknown>)
    : { details };
}

/** Voert een repo-aanroep uit en vertaalt ProjectFout naar 404, 409 of 422. */
export async function metProjectFouten<T>(actie: () => Promise<T>): Promise<T> {
  try {
    return await actie();
  } catch (fout) {
    if (!(fout instanceof ProjectFout)) throw fout;
    switch (fout.code) {
      case "NIET_GEVONDEN":
        throw nietGevondenFout();
      case "CONFLICT":
        throw createError({
          statusCode: 409,
          statusMessage: "Het project is intussen gewijzigd",
          data: { ...metDetails(fout.details), code: "PROJECT_GEWIJZIGD" },
        });
      case "ONGELDIG":
        throw createError({
          statusCode: 422,
          statusMessage: "Ongeldig document",
          data: { ...metDetails(fout.details), code: "ONGELDIG_DOCUMENT" },
        });
    }
  }
}
