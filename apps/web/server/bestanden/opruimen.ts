// De dagelijkse opruimtaak (04:00): wat niemand nog nodig heeft, definitief wissen.
//
// 1. Een project dat meer dan 30 dagen in de prullenbak staat, gaat weg met zijn snapshots, zijn
//    exports, zijn bestandsrijen en zijn bestanden.
// 2. Een planbestand (origineel of raster) waarnaar niets meer verwijst, gaat na 7 dagen weg.
// 3. Een oud logo (niet meer het logo van de installateur) gaat na 7 dagen weg.
// 4. Een bestand op schijf zonder rij in `bestanden` gaat na 7 dagen weg.
//
// Wat "in gebruik" is: een bestand-id dat voorkomt in het huidige document van een project, in een
// snapshot, in de bedrijfsgegevens (het logo), in `organization.logo` of in `exports.bestand_id`.
// De documenten en snapshots worden niet gelezen via het model maar als JSON doorzocht op elke
// UUID. Dat is een overschatting (ook een id in een tekstveld telt mee, ook van een verwijderd
// project), en dat is hier bedoeld: bij twijfel blijft een bestand staan. Een document van een
// oudere versie, of een toekomstig veld met een bestand-id, valt zo ook niet door de mand.
// Exports (de PDF's) en de bestanden van een project in de prullenbak worden alleen gewist met
// het project zelf.
//
// De volgorde is altijd eerst de rij, dan het bestand. Faalt het wissen op schijf, dan is de rij al
// weg en staat het bestand daar zonder rij: stap 4 wist het in dezelfde of in de volgende run.
// Een bestand zonder rij kan nooit meer geserveerd worden, een rij zonder bestand wel (als een
// kapotte verwijzing). De leeftijd van een bestand op schijf is zijn wijzigingstijd, zodat een
// upload van net voor de run, waarvan de rij nog moet volgen, nooit geraakt wordt.
//
// Elke omgeving ruimt alleen haar eigen database en haar eigen opslagmap op: de aanroeper geeft
// ze mee (de Nitro-taak neemt `gebruikDb()` en `gebruikOpslag()`), deze module kent geen paden.
//
// Het log bevat alleen aantallen: geen sleutels, id's, namen of foutmeldingen.
//
// Expliciete imports, geen Nuxt-auto-imports: Vitest importeert deze module rechtstreeks
// (ruling E1).
import { and, eq, gt, inArray, isNotNull, isNull, lt } from "drizzle-orm";
import type { Db } from "../db";
import { bedrijfsinstellingen, bestanden, exports, organization, projecten, snapshots } from "../db/schema";
import type { MetLock } from "../taken/lock";
import type { BestandOpslag } from "./opslag";

const DAG_MS = 24 * 3600 * 1000;

/** Hoe lang een verwijderd project in de prullenbak blijft. */
export const PRULLENBAK_DAGEN = 30;

/** Hoe oud een verweesd bestand moet zijn voor het gewist wordt. */
export const VERWEESD_DAGEN = 7;

const PAGINA = 200;

const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;

export type OpruimResultaat = {
  /** Projecten uit de prullenbak die definitief gewist zijn. */
  projecten: number;
  /** Verweesde planbestanden waarvan de rij gewist is. */
  planbestanden: number;
  /** Oude logo's waarvan de rij gewist is. */
  logos: number;
  /** Bestanden op schijf zonder rij die gewist zijn. */
  losseBestanden: number;
};

export type OpruimAfhankelijkheden = {
  db: Db;
  opslag: BestandOpslag;
  nu: Date;
  metLock: MetLock;
};

function soortFout(fout: unknown): string {
  return fout instanceof Error ? fout.name : "onbekend";
}

/** Verzamelt elke UUID in `waarde` (in kleine letters). */
function verzamelIds(waarde: unknown, naar: Set<string>): void {
  const tekst = JSON.stringify(waarde ?? null);
  for (const treffer of tekst.matchAll(UUID)) naar.add(treffer[0].toLowerCase());
}

/** Alle bestand-id's die ergens nog in gebruik zijn. */
async function gebruikteIds(db: Db): Promise<Set<string>> {
  const ids = new Set<string>();

  let na: string | null = null;
  for (;;) {
    const rijen: { id: string; document: unknown }[] = await db
      .select({ id: projecten.id, document: projecten.document })
      .from(projecten)
      .where(na === null ? undefined : gt(projecten.id, na))
      .orderBy(projecten.id)
      .limit(PAGINA);
    for (const rij of rijen) verzamelIds(rij.document, ids);
    if (rijen.length < PAGINA) break;
    na = rijen[rijen.length - 1]!.id;
  }

  na = null;
  for (;;) {
    const rijen: { id: string; document: unknown }[] = await db
      .select({ id: snapshots.id, document: snapshots.document })
      .from(snapshots)
      .where(na === null ? undefined : gt(snapshots.id, na))
      .orderBy(snapshots.id)
      .limit(PAGINA);
    for (const rij of rijen) verzamelIds(rij.document, ids);
    if (rijen.length < PAGINA) break;
    na = rijen[rijen.length - 1]!.id;
  }

  for (const rij of await db.select({ installateur: bedrijfsinstellingen.installateur }).from(bedrijfsinstellingen)) {
    verzamelIds(rij.installateur, ids);
  }
  for (const rij of await db.select({ logo: organization.logo }).from(organization).where(isNotNull(organization.logo))) {
    verzamelIds(rij.logo, ids);
  }
  for (const rij of await db.select({ id: exports.bestandId }).from(exports)) ids.add(rij.id.toLowerCase());
  return ids;
}

/** Wist een bestand op schijf; een fout wordt geteld, niet gelogd met details. Geeft terug of het gelukt is. */
async function wisOpSchijf(opslag: BestandOpslag, sleutel: string, fouten: { aantal: number }): Promise<boolean> {
  try {
    await opslag.verwijder(sleutel);
    return true;
  } catch {
    fouten.aantal++;
    return false;
  }
}

/** Een project dat tussen het zoeken en het wissen teruggezet is: de transactie draait terug. */
class TerugGezet extends Error {
  constructor() {
    super("Project teruggezet");
    this.name = "TerugGezet";
  }
}

/** Stap 1: de projecten die langer dan 30 dagen in de prullenbak staan. */
async function ruimPrullenbakOp(
  { db, opslag, nu }: OpruimAfhankelijkheden,
  fouten: { aantal: number },
): Promise<number> {
  const grens = new Date(nu.getTime() - PRULLENBAK_DAGEN * DAG_MS);
  const teWissen = await db
    .select({ id: projecten.id })
    .from(projecten)
    .where(and(isNotNull(projecten.verwijderd), lt(projecten.verwijderd, grens)));

  let gewist = 0;
  for (const { id } of teWissen) {
    let sleutels: string[];
    try {
      // Eerst de rijen, in een transactie: alles of niets. Volgorde door de FK's (NO ACTION).
      sleutels = await db.transaction(async (tx) => {
        const rijen = await tx.select({ sleutel: bestanden.sleutel }).from(bestanden).where(eq(bestanden.projectId, id));
        await tx.delete(exports).where(eq(exports.projectId, id));
        await tx.delete(snapshots).where(eq(snapshots.projectId, id));
        await tx.delete(bestanden).where(eq(bestanden.projectId, id));
        // Het project zelf, en alleen als het nog steeds in de prullenbak staat (het kan net
        // teruggezet zijn).
        const weg = await tx
          .delete(projecten)
          .where(and(eq(projecten.id, id), isNotNull(projecten.verwijderd), lt(projecten.verwijderd, grens)))
          .returning({ id: projecten.id });
        if (weg.length === 0) throw new TerugGezet();
        return rijen.map((r) => r.sleutel);
      });
    } catch (fout) {
      if (!(fout instanceof TerugGezet)) fouten.aantal++;
      continue;
    }
    gewist++;
    // Dan de bestanden. Wat nu faalt, is een bestand zonder rij: stap 4 wist het later.
    for (const sleutel of sleutels) await wisOpSchijf(opslag, sleutel, fouten);
  }
  return gewist;
}

/** De stappen 2 en 3: rijen van `soorten` die oud zijn en waarnaar niets verwijst. */
async function ruimVerweesdOp(
  { db, opslag, nu }: OpruimAfhankelijkheden,
  wat: "planbestanden" | "logos",
  gebruikt: Set<string>,
  fouten: { aantal: number },
): Promise<number> {
  const grens = new Date(nu.getTime() - VERWEESD_DAGEN * DAG_MS);
  const kandidaten =
    wat === "logos"
      ? await db
          .select({ id: bestanden.id, sleutel: bestanden.sleutel })
          .from(bestanden)
          .where(and(eq(bestanden.soort, "logo"), lt(bestanden.aangemaakt, grens)))
      : // Een planbestand van een project in de prullenbak hoort bij dat project: het gaat mee als
        // het project gewist wordt, en blijft tot dan staan voor het geval het project terugkomt.
        await db
          .select({ id: bestanden.id, sleutel: bestanden.sleutel })
          .from(bestanden)
          .innerJoin(projecten, eq(projecten.id, bestanden.projectId))
          .where(and(inArray(bestanden.soort, ["plan-origineel", "plan-raster"]), lt(bestanden.aangemaakt, grens), isNull(projecten.verwijderd)));

  let gewist = 0;
  for (const { id, sleutel } of kandidaten) {
    if (gebruikt.has(id.toLowerCase())) continue;
    try {
      await db.delete(bestanden).where(eq(bestanden.id, id));
    } catch {
      fouten.aantal++;
      continue;
    }
    gewist++;
    await wisOpSchijf(opslag, sleutel, fouten);
  }
  return gewist;
}

/** Stap 4: bestanden op schijf zonder rij die langer dan 7 dagen niet gewijzigd zijn. */
async function ruimLosseBestandenOp(
  { db, opslag, nu }: OpruimAfhankelijkheden,
  fouten: { aantal: number },
): Promise<number> {
  const grens = new Date(nu.getTime() - VERWEESD_DAGEN * DAG_MS);
  // Eerst de schijf, dan de database: een rij die intussen bijkomt, hoort dan nog bij een bestand
  // dat jonger is dan de grens. Andersom zou een net opgeladen bestand zonder rij kunnen lijken.
  const oud = (await opslag.lijst()).filter((b) => b.gewijzigd < grens);
  if (oud.length === 0) return 0;
  const bekend = new Set((await db.select({ sleutel: bestanden.sleutel }).from(bestanden)).map((r) => r.sleutel));

  let gewist = 0;
  for (const { sleutel } of oud) {
    if (bekend.has(sleutel)) continue;
    if (await wisOpSchijf(opslag, sleutel, fouten)) gewist++;
  }
  return gewist;
}

/**
 * Ruimt op, onder het lock. Is het lock bezet, dan gebeurt er niets en zijn alle aantallen 0.
 * Een fout in een stap of bij een bestand stopt de rest niet; de volgende run probeert het opnieuw.
 * Een fout in de lockverbinding zelf gooit.
 */
export async function ruimOp(deps: OpruimAfhankelijkheden): Promise<OpruimResultaat> {
  const resultaat: OpruimResultaat = { projecten: 0, planbestanden: 0, logos: 0, losseBestanden: 0 };
  const fouten = { aantal: 0 };

  async function stap(werk: () => Promise<void>): Promise<void> {
    try {
      await werk();
    } catch (fout) {
      fouten.aantal++;
      console.error("Opruimtaak: een stap is mislukt", { fout: soortFout(fout) });
    }
  }

  const uitgevoerd = await deps.metLock(async () => {
    await stap(async () => {
      resultaat.projecten = await ruimPrullenbakOp(deps, fouten);
    });
    // Na stap 1: de documenten van net gewiste projecten tellen niet meer mee.
    let gebruikt: Set<string> | undefined;
    await stap(async () => {
      gebruikt = await gebruikteIds(deps.db);
    });
    // Zonder zekerheid over wat in gebruik is, wordt niets verweesd genoemd.
    if (gebruikt) {
      const zeker = gebruikt;
      await stap(async () => {
        resultaat.planbestanden = await ruimVerweesdOp(deps, "planbestanden", zeker, fouten);
      });
      await stap(async () => {
        resultaat.logos = await ruimVerweesdOp(deps, "logos", zeker, fouten);
      });
    }
    await stap(async () => {
      resultaat.losseBestanden = await ruimLosseBestandenOp(deps, fouten);
    });
  });
  if (!uitgevoerd) return { projecten: 0, planbestanden: 0, logos: 0, losseBestanden: 0 };

  if (fouten.aantal > 0) console.error("Opruimtaak: fouten", { aantal: fouten.aantal });
  console.info("Opruimtaak klaar", resultaat);
  return resultaat;
}
