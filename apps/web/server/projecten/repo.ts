// Expliciete imports, geen Nuxt-auto-imports: Vitest importeert deze module
// rechtstreeks (ruling E1).
import {
  DocumentFout,
  nieuwId,
  nieuwProjectDocument,
  migreer,
  valideerStructuur,
  type InstallatieDocument,
  type Stroomtype,
  type Taal,
} from "@elentrik/model";
import { randomUUID } from "node:crypto";
import {
  and,
  desc,
  eq,
  getTableColumns,
  inArray,
  isNull,
  sql,
} from "drizzle-orm";
import type { Project, ProjectInLijst, ProjectSamenvatting } from "../../shared/projecten";
import type { Db, Tx } from "../db";
import type { BestandOpslag } from "../bestanden/opslag";
import { controleerOpslagruimte } from "../bestanden/opslagruimte";
import { bestanden, exports, projecten } from "../db/schema";
import {
  controleerPlanverwijzingen,
  nieuwePlanIds,
  planBestandIdsVan,
  UUID,
} from "./planverwijzingen";

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

export type { Project, ProjectInLijst, ProjectSamenvatting };

const leeft = isNull(projecten.verwijderd);

/** Een project van een organisatie: het id en de organisatie moeten allebei kloppen. */
function vanOrganisatie(organisatieId: string, id: string) {
  return and(
    eq(projecten.id, id),
    eq(projecten.organisatieId, organisatieId),
    leeft,
  );
}

/**
 * De organisatie van een levend project, of null als het project niet bestaat, verwijderd is of
 * (nog) geen organisatie heeft. Voor de toegangscontrole op id (server/utils/toegang.ts).
 */
export async function projectOrganisatie(
  db: Db,
  id: string,
): Promise<string | null> {
  const [rij] = await db
    .select({ organisatieId: projecten.organisatieId })
    .from(projecten)
    .where(and(eq(projecten.id, id), leeft));
  return rij?.organisatieId ?? null;
}

/**
 * De gemeente van de werf, anders die van de klant, rechtstreeks uit het jsonb-document: een lege
 * of witte gemeente telt als ontbrekend. Zo laadt de lijst het document niet naar de server.
 */
const werfGemeente = sql<string | null>`coalesce(
  nullif(btrim(${projecten.document} #>> '{meta,werfadres,gemeente}'), ''),
  nullif(btrim(${projecten.document} #>> '{meta,klant,adres,gemeente}'), '')
)`;

/**
 * De projecten van één organisatie, het laatst gewijzigde eerst, met de gemeente van de werf en
 * het tijdstip van de laatste export. Eén query: de exports komen uit een gegroepeerde subquery
 * over de projecten van dezelfde organisatie, geen query per project.
 */
export async function lijstProjecten(
  db: Db,
  organisatieId: string,
): Promise<ProjectInLijst[]> {
  const laatsteExports = db
    .select({
      projectId: exports.projectId,
      // Als ISO-tekst in UTC uit Postgres, zodat de vorm niet van de databasedriver afhangt.
      laatste: sql<string>`to_char(max(${exports.aangemaakt}) at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')`.as("laatste"),
    })
    .from(exports)
    .innerJoin(projecten, eq(projecten.id, exports.projectId))
    .where(eq(projecten.organisatieId, organisatieId))
    .groupBy(exports.projectId)
    .as("laatste_exports");
  const rijen = await db
    .select({
      id: projecten.id,
      naam: projecten.naam,
      klantnaam: projecten.klantnaam,
      gewijzigd: projecten.gewijzigd,
      werfGemeente,
      laatsteExport: laatsteExports.laatste,
    })
    .from(projecten)
    .leftJoin(laatsteExports, eq(laatsteExports.projectId, projecten.id))
    .where(and(eq(projecten.organisatieId, organisatieId), leeft))
    .orderBy(desc(projecten.gewijzigd));
  return rijen.map((rij) => ({
    ...rij,
    gewijzigd: rij.gewijzigd.toISOString(),
    laatsteExport: rij.laatsteExport ?? null,
  }));
}

/**
 * Opties voor een schrijfactie op een project uit een klantroute. `stempel`: het tijdstip voor
 * `abonnement_stempel_op` (spec 4.4), gezet in dezelfde schrijfactie en alleen als het veld nog
 * leeg is. Zonder `stempel` blijft het veld ongewijzigd (een nieuw project: leeg).
 */
export type SchrijfOpties = { stempel?: Date };

/** Het startdocument van een nieuw project; de route toetst het aan de limiet vóór `maakProject`. */
export function documentVoorNieuwProject(invoer: {
  klantnaam: string;
  stroomtype: Stroomtype;
  dossierTaal?: Taal;
}): InstallatieDocument {
  return nieuwProjectDocument({
    klantNaam: invoer.klantnaam,
    stroomtype: invoer.stroomtype,
    ...(invoer.dossierTaal !== undefined
      ? { dossierTaal: invoer.dossierTaal }
      : {}),
  });
}

/**
 * Een nieuw project in `organisatieId` (de actieve organisatie van de aanvrager). De dossiertaal
 * is de taal van de aanvrager; zonder taal blijft het veld weg (dat betekent nl).
 */
export async function maakProject(
  db: Db,
  organisatieId: string,
  invoer: {
    naam: string;
    klantnaam: string;
    stroomtype: Stroomtype;
    dossierTaal?: Taal;
  },
  opties?: SchrijfOpties,
): Promise<{ id: string; versie: number }> {
  const document = documentVoorNieuwProject(invoer);
  const [rij] = await db
    .insert(projecten)
    .values({
      organisatieId,
      naam: invoer.naam,
      klantnaam: invoer.klantnaam,
      document,
      ...stempelBijAanmaken(opties),
    })
    .returning({ id: projecten.id, versie: projecten.versie });
  return rij!;
}

/** De stempel van een nieuw project: nooit `gekocht_op`, alleen `abonnement_stempel_op` als gevraagd. */
function stempelBijAanmaken(opties?: SchrijfOpties): { abonnementStempelOp?: Date } {
  return opties?.stempel ? { abonnementStempelOp: opties.stempel } : {};
}

export async function haalProject(
  db: Db,
  organisatieId: string,
  id: string,
): Promise<Project | null> {
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
    document: valideerDocument(rij.document),
    gewijzigd: rij.gewijzigd.toISOString(),
  };
}

/**
 * Migreert en valideert een document. Een ongeldig document geeft ProjectFout ONGELDIG. Ook voor
 * de routes die een document aan de limiet toetsen vóór het bewaren.
 */
export function valideerDocument(invoer: unknown): InstallatieDocument {
  let document: InstallatieDocument;
  try {
    document = migreer(invoer);
  } catch (fout) {
    if (fout instanceof DocumentFout)
      throw new ProjectFout("ONGELDIG", fout.details);
    throw fout;
  }
  const problemen = valideerStructuur(document);
  if (problemen.length > 0) throw new ProjectFout("ONGELDIG", { problemen });
  return document;
}

/**
 * Bewaart een document als `versie` nog de huidige versie is. Het lezen van het bewaarde document, de
 * versiecontrole, de controle van de nieuwe planverwijzingen en de ophoging gebeuren in één transactie
 * met een rijslot (`for update`), zodat gelijktijdige bewaaracties niet kunnen lopen: precies één wint,
 * de andere krijgt CONFLICT, en tussen de controle en het schrijven kan niets veranderen.
 *
 * Een planverwijzing (`origineelBestandId`, `rasterBestandId`) die niet al in het bewaarde document
 * stond, mag niet naar een bestand wijzen dat geen plan van dit project is: dan volgt 422
 * PLANBESTAND_ONBEKEND (zie planverwijzingen.ts). Een verwijzing die er al stond, of die naar niets
 * wijst, blijft aanvaard.
 */
export async function bewaarProject(
  db: Db,
  organisatieId: string,
  id: string,
  versie: number,
  invoer: { naam?: string; document: unknown },
  metWijziging?: (
    tx: Tx,
    voor: { naam: string; versie: number; document: InstallatieDocument },
    na: { naam: string; versie: number; document: InstallatieDocument },
  ) => Promise<void>,
  opties?: SchrijfOpties,
): Promise<{ versie: number }> {
  const document = valideerDocument(invoer.document);

  return db.transaction(async (tx) => {
    const [huidig] = await tx
      .select({
        naam: projecten.naam,
        versie: projecten.versie,
        document: projecten.document,
      })
      .from(projecten)
      .where(vanOrganisatie(organisatieId, id))
      .for("update");
    if (!huidig) throw new ProjectFout("NIET_GEVONDEN");
    if (huidig.versie !== versie)
      throw new ProjectFout("CONFLICT", { versie: huidig.versie });

    const voorDocument = valideerDocument(huidig.document);
    await controleerPlanverwijzingen(
      tx,
      id,
      nieuwePlanIds(voorDocument, document),
    );

    const [bijgewerkt] = await tx
      .update(projecten)
      .set({
        ...(invoer.naam !== undefined ? { naam: invoer.naam } : {}),
        klantnaam: document.meta.klant.naam,
        document,
        versie: sql`${projecten.versie} + 1`,
        gewijzigd: sql`now()`,
        // Alleen als het veld nog leeg is: de eerste stempel blijft staan.
        ...(opties?.stempel
          ? {
              abonnementStempelOp: sql`coalesce(${projecten.abonnementStempelOp}, ${opties.stempel.toISOString()}::timestamptz)`,
            }
          : {}),
      })
      .where(
        and(vanOrganisatie(organisatieId, id), eq(projecten.versie, versie)),
      )
      .returning({ versie: projecten.versie });
    if (metWijziging)
      await metWijziging(
        tx,
        { naam: huidig.naam, versie: huidig.versie, document: voorDocument },
        {
          naam: invoer.naam ?? huidig.naam,
          versie: bijgewerkt!.versie,
          document,
        },
      );
    return bijgewerkt!;
  });
}

type BestandRij = typeof bestanden.$inferSelect;

/**
 * De planbestanden (origineel of raster) met deze id's die bij een project van `organisatieId` horen,
 * levend of verwijderd (zolang het project niet definitief gewist is). Bestanden van een andere
 * organisatie, onbekende id's en bestanden die geen plan zijn, ontbreken in het resultaat. Zo kopieert
 * ook een kopie van vóór deze fix (die nog naar de planbestanden van haar bron verwijst) die mee.
 */
async function planBestandenVanOrganisatie(
  db: Db,
  organisatieId: string,
  ids: string[],
): Promise<BestandRij[]> {
  if (ids.length === 0) return [];
  return db
    .select(getTableColumns(bestanden))
    .from(bestanden)
    .innerJoin(projecten, eq(projecten.id, bestanden.projectId))
    .where(
      and(
        inArray(bestanden.id, ids),
        inArray(bestanden.soort, ["plan-origineel", "plan-raster"]),
        eq(projecten.organisatieId, organisatieId),
      ),
    );
}

/**
 * Past de te kopiëren bestanden nog in de opslag van het bedrijf? Zo niet: 413 OPSLAG_VOL, vóór er een
 * byte gelezen of geschreven wordt. De som is die van `grootte` van de rijen (een bestand dat op schijf
 * ontbreekt wordt niet gekopieerd en telt hier toch mee: een kleine overschatting). Zonder bestanden
 * kost de kopie niets en is er niets te controleren.
 */
async function controleerRuimteVoorKopie(
  db: Db,
  organisatieId: string,
  bronnen: readonly BestandRij[],
): Promise<void> {
  const bytes = bronnen.reduce((som, rij) => som + rij.grootte, 0);
  if (bytes > 0) await controleerOpslagruimte(db, organisatieId, bytes);
}

/** Het document met nieuwe planbestand-id's (oud -> nieuw); een id zonder toewijzing blijft staan. */
function metNieuwePlanIds(
  document: InstallatieDocument,
  nieuweIds: ReadonlyMap<string, string>,
): InstallatieDocument {
  return {
    ...document,
    situatie: {
      ...document.situatie,
      paginas: document.situatie.paginas.map((p) =>
        p.achtergrond
          ? {
              ...p,
              achtergrond: {
                ...p.achtergrond,
                origineelBestandId:
                  nieuweIds.get(p.achtergrond.origineelBestandId) ??
                  p.achtergrond.origineelBestandId,
                rasterBestandId:
                  nieuweIds.get(p.achtergrond.rasterBestandId) ??
                  p.achtergrond.rasterBestandId,
              },
            }
          : p,
      ),
    },
  };
}

type PlanKopieen = {
  /** Oud -> nieuw id. */
  nieuweIds: Map<string, string>;
  nieuweRijen: (typeof bestanden.$inferInsert)[];
  /** De sleutels van de nieuwe bestanden op schijf. */
  sleutels: string[];
};

async function wisKopieen(
  opslag: BestandOpslag,
  sleutels: string[],
): Promise<void> {
  for (const sleutel of sleutels) {
    try {
      await opslag.verwijder(sleutel);
    } catch {
      // Een achtergebleven kopie zonder rij ruimt de opruimtaak op.
    }
  }
}

/**
 * Kopieert planbestanden naar het project `kopieId` (nieuw bestand onder `<kopieId>/<nieuw id>`, nieuwe
 * rij-gegevens met het kopieproject als eigenaar). De bytes worden rechtstreeks uit de opslag gelezen.
 * De rijen worden niet ingevoegd: dat doet de aanroeper in de transactie van het project. Mislukt het
 * schrijven, dan worden de al gekopieerde bestanden gewist. Een bestand dat op schijf ontbreekt, wordt
 * overgeslagen (zijn verwijzing blijft zoals ze was). Wie na dit punt faalt, wist `sleutels` met `wisKopieen`.
 */
async function kopieerPlanbestanden(
  opslag: BestandOpslag,
  bronnen: readonly BestandRij[],
  kopieId: string,
): Promise<PlanKopieen> {
  const kopieen: PlanKopieen = {
    nieuweIds: new Map(),
    nieuweRijen: [],
    sleutels: [],
  };
  try {
    for (const bronRij of bronnen) {
      const stroom = await opslag.lees(bronRij.sleutel);
      if (!stroom) continue;
      const data = new Uint8Array(await new Response(stroom).arrayBuffer());
      const bestandId = randomUUID();
      const sleutel = `${kopieId}/${bestandId}`;
      await opslag.schrijf(sleutel, data);
      kopieen.sleutels.push(sleutel);
      kopieen.nieuweIds.set(bronRij.id, bestandId);
      kopieen.nieuweRijen.push({
        id: bestandId,
        projectId: kopieId,
        organisatieId: null,
        soort: bronRij.soort,
        mime: bronRij.mime,
        grootte: bronRij.grootte,
        sleutel,
      });
    }
  } catch (fout) {
    await wisKopieen(opslag, kopieen.sleutels);
    throw fout;
  }
  return kopieen;
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
 * Gekopieerd wordt elk planbestand van een project van dezelfde organisatie (zoals bij
 * `maakProjectUitDocument`), niet alleen van het bronproject: een kopie van vóór deze aanpak, die nog
 * naar de bestanden van haar eigen bron verwijst, krijgt zo alsnog eigen bestanden.
 *
 * `extraBestandIds`: bestanden die de editor kent maar het opgeslagen document niet (een plan dat
 * tijdens een conflict werd opgeladen). Ze volgen dezelfde regel; een bestand van een andere
 * organisatie, een onbekend of ongeldig id wordt stil genegeerd. Het resultaat geeft voor elk
 * gekopieerd bestand het oude en het nieuwe id, zodat de editor zijn eigen document kan bijwerken.
 */
export async function dupliceerProject(
  db: Db,
  opslag: BestandOpslag,
  organisatieId: string,
  id: string,
  extraBestandIds: string[] = [],
  opties?: SchrijfOpties,
): Promise<{ id: string; bestandIds: Record<string, string> }> {
  const bron = await haalProject(db, organisatieId, id);
  if (!bron) throw new ProjectFout("NIET_GEVONDEN");

  const kopieId = randomUUID();
  const bestandIds = [
    ...new Set([
      ...planBestandIdsVan(bron.document),
      ...extraBestandIds.filter((bestandId) => UUID.test(bestandId)),
    ]),
  ];
  // Elk planbestand van de organisatie, niet alleen die van het bronproject: een kopie van vóór deze fix
  // verwijst nog naar de bestanden van haar eigen bron en krijgt zo alsnog eigen bestanden.
  const bronnen = await planBestandenVanOrganisatie(
    db,
    organisatieId,
    bestandIds,
  );
  await controleerRuimteVoorKopie(db, organisatieId, bronnen);

  const kopieen = await kopieerPlanbestanden(opslag, bronnen, kopieId);
  try {
    const document = {
      ...metNieuwePlanIds(bron.document, kopieen.nieuweIds),
      id: nieuwId(),
    };
    await db.transaction(async (tx) => {
      await tx.insert(projecten).values({
        id: kopieId,
        organisatieId,
        naam: `${bron.naam} (kopie)`,
        klantnaam: bron.klantnaam,
        document,
        // Een kopie start als nieuw project: nooit `gekocht_op`, alleen een eigen stempel.
        ...stempelBijAanmaken(opties),
      });
      if (kopieen.nieuweRijen.length > 0)
        await tx.insert(bestanden).values(kopieen.nieuweRijen);
    });
  } catch (fout) {
    await wisKopieen(opslag, kopieen.sleutels);
    throw fout;
  }
  return { id: kopieId, bestandIds: Object.fromEntries(kopieen.nieuweIds) };
}

/**
 * Een nieuw project in `organisatieId` uit het document van de editor. Voor "Bewaar als nieuw project"
 * nadat het oorspronkelijke project elders verwijderd werd: het document is het lokale werk van de
 * gebruiker, het bronproject is niet meer toegankelijk.
 *
 * De planbestanden die het document noemt, worden gekopieerd naar het nieuwe project (zoals bij
 * `dupliceerProject`), als ze bij een project van dezelfde organisatie horen, ook een verwijderd
 * project dat nog niet definitief gewist is. Bestanden van een andere organisatie, onbekende of
 * ongeldige id's, en bestanden die geen plan zijn, blijven zoals ze zijn (genegeerd). Het nieuwe
 * project krijgt een nieuw document-id. Het antwoord geeft voor elk gekopieerd bestand het oude en
 * het nieuwe id.
 *
 * Een ongeldig document geeft ONGELDIG, vóór er iets geschreven wordt.
 */
export async function maakProjectUitDocument(
  db: Db,
  opslag: BestandOpslag,
  organisatieId: string,
  invoer: { naam: string; document: unknown },
  opties?: SchrijfOpties,
): Promise<{
  id: string;
  versie: number;
  documentId: string;
  bestandIds: Record<string, string>;
}> {
  const bronDocument = valideerDocument(invoer.document);
  const kopieId = randomUUID();
  const documentId = nieuwId();

  const bestandIds = [
    ...new Set(
      planBestandIdsVan(bronDocument).filter((bestandId) =>
        UUID.test(bestandId),
      ),
    ),
  ];
  const bronnen = await planBestandenVanOrganisatie(
    db,
    organisatieId,
    bestandIds,
  );
  await controleerRuimteVoorKopie(db, organisatieId, bronnen);

  const kopieen = await kopieerPlanbestanden(opslag, bronnen, kopieId);
  try {
    const document = {
      ...metNieuwePlanIds(bronDocument, kopieen.nieuweIds),
      id: documentId,
    };
    const versie = await db.transaction(async (tx) => {
      const [rij] = await tx
        .insert(projecten)
        .values({
          id: kopieId,
          organisatieId,
          naam: invoer.naam,
          klantnaam: document.meta.klant.naam,
          document,
          ...stempelBijAanmaken(opties),
        })
        .returning({ versie: projecten.versie });
      if (kopieen.nieuweRijen.length > 0)
        await tx.insert(bestanden).values(kopieen.nieuweRijen);
      return rij!.versie;
    });
    return {
      id: kopieId,
      versie,
      documentId,
      bestandIds: Object.fromEntries(kopieen.nieuweIds),
    };
  } catch (fout) {
    await wisKopieen(opslag, kopieen.sleutels);
    throw fout;
  }
}

export async function verwijderProject(
  db: Db,
  organisatieId: string,
  id: string,
): Promise<void> {
  const rijen = await db
    .update(projecten)
    .set({ verwijderd: sql`now()` })
    .where(vanOrganisatie(organisatieId, id))
    .returning({ id: projecten.id });
  if (rijen.length === 0) throw new ProjectFout("NIET_GEVONDEN");
}
