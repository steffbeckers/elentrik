// De dagelijkse opruimtaak (04:00): wat niemand nog nodig heeft, definitief wissen.
//
// 1. Een project dat meer dan 30 dagen in de prullenbak staat, gaat weg met zijn snapshots, zijn
//    exports, zijn bestandsrijen en zijn bestanden.
//    Is een bestand van zo'n project nog in gebruik door een ander project (een kopie van vroeger,
//    van voor `dupliceerProject` de bestanden meekopieerde), een snapshot of een export van een
//    ander project, dan blijft het project staan en telt het als `geblokkeerd`. Een bestand dat niet
//    meer op schijf staat, blokkeert niet: zijn verwijzing wijst al naar niets.
// 2. Een planbestand (origineel of raster) waarnaar niets meer verwijst, gaat na 30 dagen weg. Dat
//    is bewust ruim: een plan dat in een lokaal concept (browser) staat dat nog niet op de server
//    bewaard is, mag een maand wachten, gelijk aan de bewaartijd van de prullenbak.
// 3. Een oud logo (niet meer het logo van de installateur) gaat na 7 dagen weg.
// 4. Een bestand op schijf zonder rij in `bestanden` gaat na 7 dagen weg, tenzij dat verdacht veel
//    is (een lege of verse database naast een volle opslagmap, bv. midden in een herstel).
//
// Vóór alles een controle op de opslagmap: is ze er niet (een niet-aangekoppeld volume), of is ze leeg
// terwijl er rijen in `bestanden` staan, dan doet de hele run niets en volgt één waarschuwing met
// aantallen. Zonder die controle zouden alle bestanden "ontbrekend" lijken en zou stap 1 projecten
// ontgrendelen en wissen die een kopie nog gebruikt. De uitslag heeft dan `overgeslagen`.
//
// Na het wissen van een bestand verdwijnt ook zijn map als ze leeg is (`<projectId>/`,
// `org/<organisatieId>/`), nooit de opslagmap zelf. Een upload die tegelijk een bestand in die
// map maakt, is veilig: het wissen van een niet-lege map faalt gewoon, en `schrijf` maakt de map
// opnieuw als ze er net tussenuit gehaald is.
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
import { dirname } from "node:path/posix";
import { and, count, eq, gt, inArray, isNotNull, isNull, lt } from "drizzle-orm";
import type { Db } from "../db";
import { bedrijfsinstellingen, bestanden, exports, organization, projecten, snapshots } from "../db/schema";
import type { MetLock } from "../taken/lock";
import type { BestandOpslag } from "./opslag";

const DAG_MS = 24 * 3600 * 1000;

/** Hoe lang een verwijderd project in de prullenbak blijft. */
export const PRULLENBAK_DAGEN = 30;

/** Hoe oud een verweesd logo of een bestand op schijf zonder rij moet zijn voor het gewist wordt. */
export const VERWEESD_DAGEN = 7;

/** Hoe oud een verweesd planbestand moet zijn: een lokaal concept kan er nog naar verwijzen. */
export const PLAN_VERWEESD_DAGEN = 30;

/** Stap 4 wist niet meer dan dit deel van de oude bestanden op schijf, tenzij het er hoogstens `MAX_ZONDER_REM` zijn. */
const MAX_DEEL_LOSSE_BESTANDEN = 0.5;
const MAX_ZONDER_REM = 10;

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
  /** Projecten uit de prullenbak die blijven staan omdat een ander project hun bestanden nog gebruikt. */
  geblokkeerd: number;
  /** Aanwezig als de run niets deed omdat de opslagmap onbereikbaar lijkt (niet aangekoppeld of leeg naast rijen). */
  overgeslagen?: "opslag-onbereikbaar";
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

/** Wie naar een bestand verwijst: een project-id, of `ALGEMEEN` (bedrijfsgegevens, organisatie). */
type Verwijzers = Map<string, Set<string>>;
const ALGEMEEN = "";

function voegToe(verwijzers: Verwijzers, id: string, door: string): void {
  const sleutel = id.toLowerCase();
  const set = verwijzers.get(sleutel);
  if (set) set.add(door);
  else verwijzers.set(sleutel, new Set([door]));
}

/** Verzamelt elke UUID in `waarde` (in kleine letters). */
function verzamelIds(waarde: unknown, verwijzers: Verwijzers, door: string): void {
  const tekst = JSON.stringify(waarde ?? null);
  for (const treffer of tekst.matchAll(UUID)) voegToe(verwijzers, treffer[0], door);
}

/** Alle bestand-id's die ergens nog in gebruik zijn, met wie ernaar verwijst. */
async function gebruikteIds(db: Db): Promise<Verwijzers> {
  const verwijzers: Verwijzers = new Map();

  let na: string | null = null;
  for (;;) {
    const rijen: { id: string; document: unknown }[] = await db
      .select({ id: projecten.id, document: projecten.document })
      .from(projecten)
      .where(na === null ? undefined : gt(projecten.id, na))
      .orderBy(projecten.id)
      .limit(PAGINA);
    for (const rij of rijen) verzamelIds(rij.document, verwijzers, rij.id);
    if (rijen.length < PAGINA) break;
    na = rijen[rijen.length - 1]!.id;
  }

  na = null;
  for (;;) {
    const rijen: { id: string; projectId: string; document: unknown }[] = await db
      .select({ id: snapshots.id, projectId: snapshots.projectId, document: snapshots.document })
      .from(snapshots)
      .where(na === null ? undefined : gt(snapshots.id, na))
      .orderBy(snapshots.id)
      .limit(PAGINA);
    for (const rij of rijen) verzamelIds(rij.document, verwijzers, rij.projectId);
    if (rijen.length < PAGINA) break;
    na = rijen[rijen.length - 1]!.id;
  }

  for (const rij of await db.select({ installateur: bedrijfsinstellingen.installateur }).from(bedrijfsinstellingen)) {
    verzamelIds(rij.installateur, verwijzers, ALGEMEEN);
  }
  for (const rij of await db.select({ logo: organization.logo }).from(organization).where(isNotNull(organization.logo))) {
    verzamelIds(rij.logo, verwijzers, ALGEMEEN);
  }
  for (const rij of await db.select({ id: exports.bestandId, projectId: exports.projectId }).from(exports)) {
    voegToe(verwijzers, rij.id, rij.projectId);
  }
  return verwijzers;
}

/**
 * Wist een bestand op schijf, en daarna zijn map als die leeg is. Een fout wordt geteld, niet gelogd
 * met details. Geeft terug of het bestand gewist is; een map die blijft staan, telt alleen als fout.
 */
async function wisOpSchijf(opslag: BestandOpslag, sleutel: string, fouten: { aantal: number }): Promise<boolean> {
  try {
    await opslag.verwijder(sleutel);
  } catch {
    fouten.aantal++;
    return false;
  }
  const map = dirname(sleutel);
  if (map !== ".") {
    try {
      await opslag.wisLegeMap(map);
    } catch {
      fouten.aantal++;
    }
  }
  return true;
}

/**
 * Is de opslagmap bruikbaar? Niet als ze er niet is, als ze zich niet laat lezen, of als ze leeg is
 * terwijl er rijen in `bestanden` staan. Dan lijkt elk bestand te ontbreken en mag niets gewist
 * worden. Geeft de aantallen voor de waarschuwing, of `undefined` als alles in orde is.
 */
async function onbereikbaarheid(db: Db, opslag: BestandOpslag): Promise<{ rijen: number; opSchijf: number } | undefined> {
  const [{ aantal: rijen } = { aantal: 0 }] = await db.select({ aantal: count() }).from(bestanden);
  let opSchijf = 0;
  try {
    if (!(await opslag.bestaatWortel())) return { rijen, opSchijf };
    opSchijf = (await opslag.lijst()).length;
  } catch {
    // Kunnen we de opslagmap niet lezen, dan is ze voor ons onbereikbaar.
    return { rijen, opSchijf };
  }
  return opSchijf === 0 && rijen > 0 ? { rijen, opSchijf } : undefined;
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
  verwijzers: Verwijzers,
  fouten: { aantal: number },
): Promise<{ gewist: number; geblokkeerd: number }> {
  const grens = new Date(nu.getTime() - PRULLENBAK_DAGEN * DAG_MS);
  const teWissen = await db.select({ id: projecten.id }).from(projecten).where(lt(projecten.verwijderd, grens));

  let gewist = 0;
  let geblokkeerd = 0;
  for (const { id } of teWissen) {
    // Een bestand van dit project dat een ander project, een snapshot of een export van een ander
    // project nog gebruikt (een kopie van vroeger): dan blijft alles staan. Behalve als het bestand
    // niet meer op schijf staat: dan wijst die verwijzing al naar niets en blokkeert ze niet eeuwig.
    const eigen = await db
      .select({ id: bestanden.id, sleutel: bestanden.sleutel })
      .from(bestanden)
      .where(eq(bestanden.projectId, id));
    let blokkeert = false;
    for (const b of eigen) {
      if (![...(verwijzers.get(b.id.toLowerCase()) ?? [])].some((door) => door !== id)) continue;
      // Kunnen we het niet nagaan, dan blijft het staan.
      if (await opslag.bestaat(b.sleutel).catch(() => true)) {
        blokkeert = true;
        break;
      }
    }
    if (blokkeert) {
      geblokkeerd++;
      continue;
    }
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
          .where(and(eq(projecten.id, id), lt(projecten.verwijderd, grens)))
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
  return { gewist, geblokkeerd };
}

/** De stappen 2 en 3: rijen van `soorten` die oud zijn en waarnaar niets verwijst. */
async function ruimVerweesdOp(
  { db, opslag, nu }: OpruimAfhankelijkheden,
  wat: "planbestanden" | "logos",
  gebruikt: Verwijzers,
  fouten: { aantal: number },
): Promise<number> {
  const kandidaten =
    wat === "logos"
      ? await db
          .select({ id: bestanden.id, sleutel: bestanden.sleutel })
          .from(bestanden)
          .where(and(eq(bestanden.soort, "logo"), lt(bestanden.aangemaakt, new Date(nu.getTime() - VERWEESD_DAGEN * DAG_MS))))
      : // Een planbestand van een project in de prullenbak hoort bij dat project: het gaat mee als
        // het project gewist wordt, en blijft tot dan staan voor het geval het project terugkomt.
        await db
          .select({ id: bestanden.id, sleutel: bestanden.sleutel })
          .from(bestanden)
          .innerJoin(projecten, eq(projecten.id, bestanden.projectId))
          .where(
            and(
              inArray(bestanden.soort, ["plan-origineel", "plan-raster"]),
              lt(bestanden.aangemaakt, new Date(nu.getTime() - PLAN_VERWEESD_DAGEN * DAG_MS)),
              isNull(projecten.verwijderd),
            ),
          );

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

  // Vangnet tegen een verkeerde combinatie van database en opslagmap: een lege tabel naast oude
  // bestanden (een verse of net herstelde database), of een run die het grootste deel van de oude
  // bestanden zou wissen. Dan wordt er niets gewist en komt er een waarschuwing met aantallen.
  const teWissen = oud.filter((b) => !bekend.has(b.sleutel));
  if (teWissen.length === 0) return 0;
  const verdacht =
    bekend.size === 0 || (teWissen.length > MAX_ZONDER_REM && teWissen.length > oud.length * MAX_DEEL_LOSSE_BESTANDEN);
  if (verdacht) {
    console.warn("Opruimtaak: losse bestanden overgeslagen, de database en de opslagmap lijken niet bij elkaar te horen", {
      oudeBestanden: oud.length,
      zonderRij: teWissen.length,
      rijen: bekend.size,
    });
    return 0;
  }

  let gewist = 0;
  for (const { sleutel } of teWissen) {
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
  const resultaat: OpruimResultaat = { projecten: 0, planbestanden: 0, logos: 0, losseBestanden: 0, geblokkeerd: 0 };
  const fouten = { aantal: 0 };

  async function stap(werk: () => Promise<void>): Promise<void> {
    try {
      await werk();
    } catch (fout) {
      fouten.aantal++;
      console.error("Opruimtaak: een stap is mislukt", { fout: soortFout(fout) });
    }
  }

  let afgebroken = false;
  const uitgevoerd = await deps.metLock(async () => {
    // Zonder zekerheid dat de opslagmap er is, doet de run niets (zie de uitleg bovenaan). Lukt de
    // controle zelf niet (de database), dan evenmin.
    let onbereikbaar: { rijen: number; opSchijf: number } | undefined;
    try {
      onbereikbaar = await onbereikbaarheid(deps.db, deps.opslag);
    } catch (fout) {
      fouten.aantal++;
      console.error("Opruimtaak: de opslagmap kon niet gecontroleerd worden", { fout: soortFout(fout) });
      afgebroken = true;
      return;
    }
    if (onbereikbaar) {
      console.warn("Opruimtaak: de opslagmap lijkt onbereikbaar, er is niets gewist", onbereikbaar);
      resultaat.overgeslagen = "opslag-onbereikbaar";
      afgebroken = true;
      return;
    }
    // Stap 1 weet pas of een project nog in gebruik is na een volledige scan; lukt die niet, dan
    // wordt er niets gewist.
    await stap(async () => {
      const verwijzers = await gebruikteIds(deps.db);
      const { gewist, geblokkeerd } = await ruimPrullenbakOp(deps, verwijzers, fouten);
      resultaat.projecten = gewist;
      resultaat.geblokkeerd = geblokkeerd;
    });
    // Na stap 1 opnieuw: de documenten van net gewiste projecten tellen niet meer mee.
    let gebruikt: Verwijzers | undefined;
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
  if (!uitgevoerd) return { projecten: 0, planbestanden: 0, logos: 0, losseBestanden: 0, geblokkeerd: 0 };
  if (afgebroken) return resultaat;

  if (fouten.aantal > 0) console.error("Opruimtaak: fouten", { aantal: fouten.aantal });
  console.info("Opruimtaak klaar", resultaat);
  return resultaat;
}
