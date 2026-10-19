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

export async function lijstProjecten(db: Db): Promise<ProjectSamenvatting[]> {
  const rijen = await db
    .select({
      id: projecten.id,
      naam: projecten.naam,
      klantnaam: projecten.klantnaam,
      gewijzigd: projecten.gewijzigd,
    })
    .from(projecten)
    .where(leeft)
    .orderBy(desc(projecten.gewijzigd));
  return rijen.map((rij) => ({ ...rij, gewijzigd: rij.gewijzigd.toISOString() }));
}

export async function maakProject(
  db: Db,
  invoer: { naam: string; klantnaam: string; stroomtype: Stroomtype },
): Promise<{ id: string; versie: number }> {
  const document = nieuwProjectDocument({
    klantNaam: invoer.klantnaam,
    stroomtype: invoer.stroomtype,
  });
  const [rij] = await db
    .insert(projecten)
    .values({ naam: invoer.naam, klantnaam: invoer.klantnaam, document })
    .returning({ id: projecten.id, versie: projecten.versie });
  return rij!;
}

export async function haalProject(db: Db, id: string): Promise<Project | null> {
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
    .where(and(eq(projecten.id, id), leeft));
  if (!rij) return null;
  return {
    ...rij,
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
    .where(and(eq(projecten.id, id), eq(projecten.versie, versie), leeft))
    .returning({ versie: projecten.versie });
  if (bijgewerkt) return bijgewerkt;

  const [huidig] = await db
    .select({ versie: projecten.versie })
    .from(projecten)
    .where(and(eq(projecten.id, id), leeft));
  if (!huidig) throw new ProjectFout("NIET_GEVONDEN");
  throw new ProjectFout("CONFLICT", { versie: huidig.versie });
}

export async function dupliceerProject(db: Db, id: string): Promise<{ id: string }> {
  const bron = await haalProject(db, id);
  if (!bron) throw new ProjectFout("NIET_GEVONDEN");
  const [rij] = await db
    .insert(projecten)
    .values({
      naam: `${bron.naam} (kopie)`,
      klantnaam: bron.klantnaam,
      document: { ...bron.document, id: nieuwId() },
    })
    .returning({ id: projecten.id });
  return rij!;
}

export async function verwijderProject(db: Db, id: string): Promise<void> {
  const rijen = await db
    .update(projecten)
    .set({ verwijderd: sql`now()` })
    .where(and(eq(projecten.id, id), leeft))
    .returning({ id: projecten.id });
  if (rijen.length === 0) throw new ProjectFout("NIET_GEVONDEN");
}
