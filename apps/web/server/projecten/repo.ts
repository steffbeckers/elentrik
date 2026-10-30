// Expliciete imports, geen Nuxt-auto-imports: Vitest importeert deze module
// rechtstreeks (ruling E1).
import {
  DocumentFout,
  nieuwId,
  nieuwProjectDocument,
  parseDocument,
  valideerStructuur,
  type InstallatieDocument,
  type Stroomtype,
  type Taal,
} from "@elentrik/model";
import { randomUUID } from "node:crypto";
import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import type { Project, ProjectSamenvatting } from "../../shared/projecten";
import type { Db } from "../db";
import type { BestandOpslag } from "../bestanden/opslag";
import { bestanden, projecten } from "../db/schema";

/** Een id in een uuid-kolom: een ander id zou de query laten falen in plaats van niets te vinden. */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type ProjectFoutCode = "NIET_GEVONDEN" | "CONFLICT" | "ONGELDIG";

export class ProjectFout extends Error {
  readonly code: ProjectFoutCode;
  readonly details?: unknown;

  constructor(code: ProjectFoutCode, details?: unknown) {
    super(code);
    this.name = "ProjectFout";
    this.code = code;
    if (details !== undefined) this.details = details;
  }
}

export type { Project, ProjectSamenvatting };

const leeft = isNull(projecten.verwijderd);

/** Een project van een organisatie: het id en de organisatie moeten allebei kloppen. */
function vanOrganisatie(organisatieId: string, id: string) {
  return and(eq(projecten.id, id), eq(projecten.organisatieId, organisatieId), leeft);
}

/**
 * De organisatie van een levend project, of null als het project niet bestaat, verwijderd is of
 * (nog) geen organisatie heeft. Voor de toegangscontrole op id (server/utils/toegang.ts).
 */
export async function projectOrganisatie(db: Db, id: string): Promise<string | null> {
  const [rij] = await db
    .select({ organisatieId: projecten.organisatieId })
    .from(projecten)
    .where(and(eq(projecten.id, id), leeft));
  return rij?.organisatieId ?? null;
}

/** De projecten van één organisatie, het laatst gewijzigde eerst. */
export async function lijstProjecten(db: Db, organisatieId: string): Promise<ProjectSamenvatting[]> {
  const rijen = await db
    .select({
      id: projecten.id,
      naam: projecten.naam,
      klantnaam: projecten.klantnaam,
      gewijzigd: projecten.gewijzigd,
    })
    .from(projecten)
    .where(and(eq(projecten.organisatieId, organisatieId), leeft))
    .orderBy(desc(projecten.gewijzigd));
  return rijen.map((rij) => ({ ...rij, gewijzigd: rij.gewijzigd.toISOString() }));
}

/**
 * Een nieuw project in `organisatieId` (de actieve organisatie van de aanvrager). De dossiertaal
 * is de taal van de aanvrager; zonder taal blijft het veld weg (dat betekent nl).
 */
export async function maakProject(
  db: Db,
  organisatieId: string,
  invoer: { naam: string; klantnaam: string; stroomtype: Stroomtype; dossierTaal?: Taal },
): Promise<{ id: string; versie: number }> {
  const document = nieuwProjectDocument({
    klantNaam: invoer.klantnaam,
    stroomtype: invoer.stroomtype,
    ...(invoer.dossierTaal !== undefined ? { dossierTaal: invoer.dossierTaal } : {}),
  });
  const [rij] = await db
    .insert(projecten)
    .values({ organisatieId, naam: invoer.naam, klantnaam: invoer.klantnaam, document })
    .returning({ id: projecten.id, versie: projecten.versie });
  return rij!;
}

export async function haalProject(db: Db, organisatieId: string, id: string): Promise<Project | null> {
  const [rij] = await db
    .select({
      id: projecten.id,
      naam: projecten.naam,
      klantnaam: projecten.klantnaam,
      document: projecten.document,
      versie: projecten.versie,
      gewijzigd: projecten.gewijzigd,
    })
    .from(projecten)
    .where(vanOrganisatie(organisatieId, id));
  if (!rij) return null;
  return {
    ...rij,
    organisatieId,
    document: rij.document as InstallatieDocument,
    gewijzigd: rij.gewijzigd.toISOString(),
  };
}

function valideerDocument(invoer: unknown): InstallatieDocument {
  let document: InstallatieDocument;
  try {
    document = parseDocument(invoer);
  } catch (fout) {
    if (fout instanceof DocumentFout) throw new ProjectFout("ONGELDIG", fout.details);
    throw fout;
  }
  const problemen = valideerStructuur(document);
  if (problemen.length > 0) throw new ProjectFout("ONGELDIG", { problemen });
  return document;
}

/**
 * Bewaart een document als `versie` nog de huidige versie is. De controle en de
 * ophoging gebeuren in één UPDATE, zodat gelijktijdige bewaaracties niet kunnen
 * lopen: precies één wint, de andere krijgt CONFLICT.
 */
export async function bewaarProject(
  db: Db,
  organisatieId: string,
  id: string,
  versie: number,
  invoer: { naam?: string; document: unknown },
): Promise<{ versie: number }> {
  const document = valideerDocument(invoer.document);

  const [bijgewerkt] = await db
    .update(projecten)
    .set({
      ...(invoer.naam !== undefined ? { naam: invoer.naam } : {}),
      klantnaam: document.meta.klant.naam,
      document,
      versie: sql`${projecten.versie} + 1`,
      gewijzigd: sql`now()`,
    })
    .where(and(vanOrganisatie(organisatieId, id), eq(projecten.versie, versie)))
    .returning({ versie: projecten.versie });
  if (bijgewerkt) return bijgewerkt;

  const [huidig] = await db
    .select({ versie: projecten.versie })
    .from(projecten)
    .where(vanOrganisatie(organisatieId, id));
  if (!huidig) throw new ProjectFout("NIET_GEVONDEN");
  throw new ProjectFout("CONFLICT", { versie: huidig.versie });
}

/**
 * Een kopie in dezelfde organisatie als het bronproject. De planbestanden waarnaar de situatiepagina's
 * van het bronproject verwijzen, worden mee gekopieerd (nieuw bestand, nieuwe rij met het kopieproject
 * als eigenaar, nieuwe id's in het document van de kopie). Zo hangt de kopie niet af van bestanden
 * van het bronproject, die met dat project definitief gewist worden (server/bestanden/opruimen.ts).
 *
 * Eerst de bestanden, dan het project en de rijen in een transactie; mislukt het, dan worden de
 * gekopieerde bestanden weer gewist. Een planbestand dat op schijf ontbreekt, wordt niet gekopieerd:
 * die verwijzing blijft zoals ze was (ze wees al naar niets).
 *
 * `extraBestandIds`: bestanden die de editor kent maar het opgeslagen document niet (een plan dat
 * tijdens een conflict werd opgeladen). Ze worden alleen gekopieerd als ze bij het bronproject horen;
 * een vreemd, onbekend of ongeldig id wordt stil genegeerd. Het resultaat geeft voor elk gekopieerd
 * bestand het oude en het nieuwe id, zodat de editor zijn eigen document kan bijwerken.
 */
export async function dupliceerProject(
  db: Db,
  opslag: BestandOpslag,
  organisatieId: string,
  id: string,
  extraBestandIds: string[] = [],
): Promise<{ id: string; bestandIds: Record<string, string> }> {
  const bron = await haalProject(db, organisatieId, id);
  if (!bron) throw new ProjectFout("NIET_GEVONDEN");

  const kopieId = randomUUID();
  const paginas = bron.document.situatie.paginas;
  const bestandIds = [
    ...new Set([
      ...paginas.flatMap((p) => (p.achtergrond ? [p.achtergrond.origineelBestandId, p.achtergrond.rasterBestandId] : [])),
      ...extraBestandIds.filter((bestandId) => UUID.test(bestandId)),
    ]),
  ];
  // Alleen bestanden van het bronproject zelf (ook als het document een vreemd id bevat).
  const bronnen = bestandIds.length
    ? await db
        .select()
        .from(bestanden)
        .where(and(inArray(bestanden.id, bestandIds), eq(bestanden.projectId, bron.id)))
    : [];

  const nieuweIds = new Map<string, string>();
  const nieuweRijen: (typeof bestanden.$inferInsert)[] = [];
  const gekopieerd: string[] = [];
  try {
    for (const bronRij of bronnen) {
      const stroom = await opslag.lees(bronRij.sleutel);
      if (!stroom) continue;
      const data = new Uint8Array(await new Response(stroom).arrayBuffer());
      const bestandId = randomUUID();
      const sleutel = `${kopieId}/${bestandId}`;
      await opslag.schrijf(sleutel, data);
      gekopieerd.push(sleutel);
      nieuweIds.set(bronRij.id, bestandId);
      nieuweRijen.push({
        id: bestandId,
        projectId: kopieId,
        organisatieId: null,
        soort: bronRij.soort,
        mime: bronRij.mime,
        grootte: bronRij.grootte,
        sleutel,
      });
    }

    const document = {
      ...bron.document,
      id: nieuwId(),
      situatie: {
        ...bron.document.situatie,
        paginas: paginas.map((p) =>
          p.achtergrond
            ? {
                ...p,
                achtergrond: {
                  ...p.achtergrond,
                  origineelBestandId: nieuweIds.get(p.achtergrond.origineelBestandId) ?? p.achtergrond.origineelBestandId,
                  rasterBestandId: nieuweIds.get(p.achtergrond.rasterBestandId) ?? p.achtergrond.rasterBestandId,
                },
              }
            : p,
        ),
      },
    };

    await db.transaction(async (tx) => {
      await tx.insert(projecten).values({
        id: kopieId,
        organisatieId,
        naam: `${bron.naam} (kopie)`,
        klantnaam: bron.klantnaam,
        document,
      });
      if (nieuweRijen.length > 0) await tx.insert(bestanden).values(nieuweRijen);
    });
  } catch (fout) {
    for (const sleutel of gekopieerd) {
      try {
        await opslag.verwijder(sleutel);
      } catch {
        // Een achtergebleven kopie zonder rij ruimt de opruimtaak op.
      }
    }
    throw fout;
  }
  return { id: kopieId, bestandIds: Object.fromEntries(nieuweIds) };
}

export async function verwijderProject(db: Db, organisatieId: string, id: string): Promise<void> {
  const rijen = await db
    .update(projecten)
    .set({ verwijderd: sql`now()` })
    .where(vanOrganisatie(organisatieId, id))
    .returning({ id: projecten.id });
  if (rijen.length === 0) throw new ProjectFout("NIET_GEVONDEN");
}
