// Een PDF-export van het opgeslagen document: snapshot, PDF via Gotenberg, bestand en exportrij.
// Expliciete imports, geen Nuxt-auto-imports: Vitest importeert deze module
// rechtstreeks (ruling E1).
import { analyseer, controleer, haalRegelset, type Bevinding } from "@elentrik/arei";
import type { InstallatieDocument } from "@elentrik/model";
import { overgeslagenPaginas, printHtml, type PrintOpties } from "@elentrik/render";
import { desc, eq } from "drizzle-orm";
import { herkenSoort } from "../../shared/bestandsinhoud";
import type { ExportInfo, ExportInvoer } from "../../shared/exports";
import { haalBedrijf } from "../bedrijf/repo";
import { STANDAARD_DOWNLOADNAAM } from "../bestanden/headers";
import type { BestandOpslag } from "../bestanden/opslag";
import { haalBestand, schrijfBestandMetRij } from "../bestanden/repo";
import type { Db } from "../db";
import { bestanden, exports, projecten, snapshots } from "../db/schema";
import { PdfFout, type PdfInvoer } from "../pdf/gotenberg";
import { haalProject, ProjectFout } from "../projecten/repo";
import { IdSchema } from "../utils/projecten";

export type { ExportInfo, ExportInvoer };

export type ExportDeps = {
  maakPdf: (invoer: PdfInvoer) => Promise<Uint8Array>;
  nu?: () => Date;
};

type MeeTeGeven = PdfInvoer["bestanden"][number];

/**
 * Een PNG of JPEG die de editor oplaadt dient zelf als raster: hij wordt één keer bewaard, als
 * `plan-origineel`, en `rasterBestandId` wijst naar hetzelfde bestand. Alleen bij een PDF is het raster
 * een apart `plan-raster`. Een PDF als `plan-origineel` valt weg door het typefilter in `leesAfbeelding`.
 */
const PLAN_RASTER = ["plan-raster", "plan-origineel"] as const;

/** Welke bestanden `leesAfbeelding` toelaat: de soorten, en bij een plan ook het project waartoe ze horen. */
type Toegelaten = { soorten: readonly (typeof bestanden.$inferSelect)["soort"][]; projectId: string | null };

/** De extensie per toegelaten afbeeldingstype; andere types gaan niet mee. */
const EXTENSIE: Readonly<Record<string, string>> = { "image/png": "png", "image/jpeg": "jpg" };

/** `JJJJ-MM-DD` in lokale tijd. */
function lokaleDatum(datum: Date): string {
  const tweeCijfers = (n: number) => String(n).padStart(2, "0");
  return `${datum.getFullYear()}-${tweeCijfers(datum.getMonth() + 1)}-${tweeCijfers(datum.getDate())}`;
}

/**
 * Leest een afbeelding (PNG of JPEG) van een van de toegelaten soorten uit de opslag. Een plan moet bij het
 * gegeven project horen (`projectId`); het logo hoort bij geen project (`null`). Een id dat geen uuid is,
 * een onbekende rij, een andere soort, een ander project, een ander type of een bestand dat niet in de
 * opslag staat, geeft `null`.
 */
async function leesAfbeelding(
  db: Db,
  opslag: BestandOpslag,
  id: string,
  toegelaten: Toegelaten,
): Promise<{ data: Uint8Array; mime: string; extensie: string } | null> {
  if (!IdSchema.safeParse(id).success) return null;
  const bestand = await haalBestand(db, id);
  if (!bestand || !toegelaten.soorten.includes(bestand.soort)) return null;
  if (bestand.projectId !== toegelaten.projectId) return null;
  const extensie = EXTENSIE[bestand.mime];
  if (extensie === undefined) return null;
  const stroom = await opslag.lees(bestand.sleutel);
  if (!stroom) return null;
  return { data: new Uint8Array(await new Response(stroom).arrayBuffer()), mime: bestand.mime, extensie };
}

/** De rasters van de situatiepagina's die in de opslag staan, als bestand naast `index.html`. */
async function rasters(
  db: Db,
  opslag: BestandOpslag,
  projectId: string,
  doc: InstallatieDocument,
): Promise<{ afbeeldingen: Record<string, string>; bestanden: MeeTeGeven[] }> {
  const afbeeldingen: Record<string, string> = {};
  const bestanden: MeeTeGeven[] = [];
  const ids = new Set(doc.situatie.paginas.flatMap((p) => (p.achtergrond ? [p.achtergrond.rasterBestandId] : [])));
  for (const id of ids) {
    const raster = await leesAfbeelding(db, opslag, id, { soorten: PLAN_RASTER, projectId });
    if (!raster) continue;
    const naam = `plan-${id}.${raster.extensie}`;
    afbeeldingen[id] = naam;
    bestanden.push({ naam, data: raster.data, mime: raster.mime });
  }
  return { afbeeldingen, bestanden };
}

function telOnopgelost(bevindingen: readonly Bevinding[], ernst: Bevinding["ernst"]): number {
  return bevindingen.filter((b) => b.ernst === ernst && !b.afgeweken).length;
}

function naarInfo(rij: typeof exports.$inferSelect): ExportInfo {
  return {
    id: rij.id,
    bestandId: rij.bestandId,
    versieLabel: rij.versieLabel,
    papier: rij.papier,
    aantalFouten: rij.aantalFouten,
    aantalWaarschuwingen: rij.aantalWaarschuwingen,
    aangemaakt: rij.aangemaakt.toISOString(),
  };
}

/**
 * Maakt een PDF-export van het **opgeslagen** document van een project. Eerst de PDF; pas als die
 * lukt, komen bestand, snapshot en exportrij tot stand (het bestand vóór de rijen, de rijen in één
 * transactie). Bij een `PdfFout` wordt niets bewaard. De bijlage is verplicht bij onopgeloste fouten
 * en bij overgeslagen situatiepagina's. Een onbekend project geeft `ProjectFout("NIET_GEVONDEN")`.
 */
export async function maakExport(
  db: Db,
  opslag: BestandOpslag,
  projectId: string,
  invoer: ExportInvoer,
  deps: ExportDeps,
): Promise<ExportInfo> {
  const nu = (deps.nu ?? (() => new Date()))();
  const project = await haalProject(db, projectId);
  if (!project) throw new ProjectFout("NIET_GEVONDEN");
  const doc = project.document;

  const analyse = analyseer(doc);
  const bevindingen = controleer(doc, haalRegelset(doc.regelset));
  const aantalFouten = telOnopgelost(bevindingen, "fout");
  const aantalWaarschuwingen = telOnopgelost(bevindingen, "waarschuwing");

  const meegegeven: MeeTeGeven[] = [];
  let afbeeldingen: Record<string, string> = {};
  let overgeslagen: string[] = [];
  if (invoer.onderdelen.situatieschema) {
    const gevonden = await rasters(db, opslag, projectId, doc);
    afbeeldingen = gevonden.afbeeldingen;
    meegegeven.push(...gevonden.bestanden);
    overgeslagen = overgeslagenPaginas(doc, afbeeldingen);
  }
  const onderdelen = {
    ...invoer.onderdelen,
    bijlage: invoer.onderdelen.bijlage || aantalFouten > 0 || overgeslagen.length > 0,
  };

  const installateur = await haalBedrijf(db);
  let logo: string | undefined;
  if (installateur.logoBestandId !== undefined) {
    const afbeelding = await leesAfbeelding(db, opslag, installateur.logoBestandId, {
      soorten: ["logo"],
      projectId: null,
    });
    if (afbeelding) {
      logo = `logo.${afbeelding.extensie}`;
      meegegeven.push({ naam: logo, data: afbeelding.data, mime: afbeelding.mime });
    }
  }

  const opties: PrintOpties = {
    papier: invoer.papier,
    onderdelen,
    versieLabel: invoer.versieLabel,
    datum: doc.meta.datum.trim() !== "" ? doc.meta.datum : lokaleDatum(nu),
    taal: "nl",
    installateur,
    afbeeldingen,
    ...(logo !== undefined ? { logo } : {}),
  };
  const { html } = printHtml(doc, analyse, bevindingen, opties);
  const pdf = await deps.maakPdf({ html, bestanden: meegegeven, papier: invoer.papier });
  if (herkenSoort(pdf) !== "pdf") throw new PdfFout("MISLUKT", "De PDF-dienst gaf geen geldige PDF terug.");

  let rij: typeof exports.$inferSelect | undefined;
  await schrijfBestandMetRij(
    db,
    opslag,
    { projectId, soort: "export", map: projectId, type: "pdf", data: pdf },
    async (tx, bestand) => {
      const [snapshot] = await tx
        .insert(snapshots)
        .values({ projectId, versie: project.versie, document: doc, reden: "export", aangemaakt: nu })
        .returning({ id: snapshots.id });
      [rij] = await tx
        .insert(exports)
        .values({
          projectId,
          snapshotId: snapshot!.id,
          bestandId: bestand.id,
          versieLabel: invoer.versieLabel,
          papier: invoer.papier,
          onderdelen,
          aantalFouten,
          aantalWaarschuwingen,
          aangemaakt: nu,
        })
        .returning();
    },
  );
  return naarInfo(rij!);
}

/** De exports van een project, de nieuwste eerst. */
export async function lijstExports(db: Db, projectId: string): Promise<ExportInfo[]> {
  const rijen = await db
    .select()
    .from(exports)
    .where(eq(exports.projectId, projectId))
    .orderBy(desc(exports.aangemaakt), desc(exports.id));
  return rijen.map(naarInfo);
}

/** De downloadnaam van een export-PDF: `<projectnaam> - <versieLabel>.pdf`, anders `export.pdf`. */
export async function exportBestandsnaam(db: Db, bestandId: string): Promise<string> {
  const [rij] = await db
    .select({ naam: projecten.naam, versieLabel: exports.versieLabel })
    .from(exports)
    .innerJoin(projecten, eq(projecten.id, exports.projectId))
    .where(eq(exports.bestandId, bestandId));
  if (!rij || rij.naam.trim() === "" || rij.versieLabel.trim() === "") return STANDAARD_DOWNLOADNAAM;
  return `${rij.naam} - ${rij.versieLabel}.pdf`;
}
