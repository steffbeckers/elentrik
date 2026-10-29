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
import { and, desc, eq, isNull, sql } from "drizzle-orm";
import type { Project, ProjectSamenvatting } from "../../shared/projecten";
import type { Db } from "../db";
import { projecten } from "../db/schema";

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

/** Een kopie in dezelfde organisatie als het bronproject. */
export async function dupliceerProject(db: Db, organisatieId: string, id: string): Promise<{ id: string }> {
  const bron = await haalProject(db, organisatieId, id);
  if (!bron) throw new ProjectFout("NIET_GEVONDEN");
  const [rij] = await db
    .insert(projecten)
    .values({
      organisatieId,
      naam: `${bron.naam} (kopie)`,
      klantnaam: bron.klantnaam,
      document: { ...bron.document, id: nieuwId() },
    })
    .returning({ id: projecten.id });
  return rij!;
}

export async function verwijderProject(db: Db, organisatieId: string, id: string): Promise<void> {
  const rijen = await db
    .update(projecten)
    .set({ verwijderd: sql`now()` })
    .where(vanOrganisatie(organisatieId, id))
    .returning({ id: projecten.id });
  if (rijen.length === 0) throw new ProjectFout("NIET_GEVONDEN");
}
