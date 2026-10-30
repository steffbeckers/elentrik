// Opruimen na een e2e-spec: wist echt wat de spec aanmaakte, uit `elentrik_e2e` en uit de
// e2e-bestandenmap. Een spec registreert in een spoor welke gebruikers (e-mailadressen),
// organisaties en projecten hij maakte; `ruimOp` wist die en alles wat eraan hangt, in de volgorde
// die de vreemde sleutels vragen. Zo groeit de e2e-database niet met elke run.
//
// De grendel is essentieel: `ruimOp` doet niets tenzij de verbinding naar `elentrik_e2e` wijst
// (gevraagd aan de server zelf, `current_database()`) én de opslagmap de e2e-map is. De echte
// database `elentrik` en `.data/bestanden` blijven zo buiten bereik, wat het spoor ook bevat.
import { rmdir, unlink } from "node:fs/promises";
import { dirname, resolve, sep } from "node:path";
import postgres from "postgres";
import { E2E_BESTANDEN_DIR, E2E_DATABASE_NAAM, eisE2eDatabase } from "../omgeving";

/** Wat een spec aanmaakte en na afloop weg moet. Alles is optioneel aan te vullen. */
export type E2eSpoor = {
  /** Adressen van de gebruikers; hun organisaties en projecten gaan mee. */
  emails: Set<string>;
  /** Extra organisaties (id's), bv. een tweede bedrijf, ook als hun eigenaar niet in `emails` staat. */
  organisaties: Set<string>;
  /** Projecten (id's) die buiten een organisatie van het spoor staan, bv. gezaaide projecten zonder organisatie. */
  projecten: Set<string>;
  /** Rijen van `bedrijfsinstellingen` (id) die buiten een organisatie van het spoor staan. */
  bedrijfsinstellingen: Set<number>;
};

export function nieuwSpoor(): E2eSpoor {
  return { emails: new Set(), organisaties: new Set(), projecten: new Set(), bedrijfsinstellingen: new Set() };
}

/** Het deel van de postgres.js-verbinding dat de opruiming gebruikt (zodat een test een nepverbinding kan geven). */
export type OpruimSql = postgres.Sql;

export type OpruimOmgeving = {
  /** Een bestaande verbinding; dan sluit `ruimOp` ze niet. Zonder: een eigen verbinding via `DATABASE_URL`. */
  sql?: OpruimSql;
  /** De opslagmap van de server; standaard `ELENTRIK_BESTANDEN_DIR`. */
  bestandenDir?: string;
};

/** De grendel voor de opslagmap: alleen de e2e-map. */
export function eisE2eBestandenDir(bestandenDir: string | undefined): string {
  if (!bestandenDir || resolve(bestandenDir) !== resolve(E2E_BESTANDEN_DIR)) {
    throw new Error(`Geweigerd: de opslagmap moet ${E2E_BESTANDEN_DIR} zijn (e2e-tests raken nooit de echte bestanden).`);
  }
  return resolve(bestandenDir);
}

/** De grendel voor de database: de server zelf moet zeggen dat de verbinding bij `elentrik_e2e` hoort. */
export async function eisE2eVerbinding(sql: OpruimSql): Promise<void> {
  const [rij] = await sql<{ naam: string }[]>`select current_database() as naam`;
  if (rij?.naam !== E2E_DATABASE_NAAM) {
    throw new Error(`Geweigerd: de verbinding wijst naar "${rij?.naam}", niet naar ${E2E_DATABASE_NAAM}.`);
  }
}

/** Wist een bestand en daarna zijn lege mappen, nooit buiten de e2e-map. Een bestand dat al weg is, is geen fout. */
async function wisBestand(wortel: string, sleutel: string): Promise<void> {
  const volledig = resolve(wortel, sleutel);
  if (!volledig.startsWith(wortel + sep)) throw new Error(`Geweigerd: sleutel buiten de e2e-map: ${sleutel}`);
  try {
    await unlink(volledig);
  } catch (fout) {
    if ((fout as NodeJS.ErrnoException).code !== "ENOENT") throw fout;
  }
  // Lege mappen opruimen tot de e2e-map zelf; een map met iets erin blijft staan.
  for (let map = dirname(volledig); map.startsWith(wortel + sep); map = dirname(map)) {
    try {
      await rmdir(map);
    } catch {
      break;
    }
  }
}

/** Het LIKE-patroon dat een `verification.value` met `"email":"<adres>"` vindt; `\`, `%` en `_` blijven letterlijk. */
export function verificatiePatroon(email: string): string {
  return `%"email":"${email.replace(/[\\%_]/g, "\\$&")}"%`;
}

/** De kolom `id` of `kolom` van de rijen, als lijst. */
function waarden<T>(rijen: readonly Record<string, T>[], kolom: string): T[] {
  return rijen.map((r) => r[kolom]!);
}

/**
 * Wist het spoor uit `elentrik_e2e` en de bijbehorende bestanden uit de e2e-map. Weigert (met een
 * fout, vóór er iets gewist wordt) buiten die omgeving. Veilig om twee keer te draaien.
 */
export async function ruimOp(spoor: E2eSpoor, omgeving: OpruimOmgeving = {}): Promise<void> {
  // De map eerst: een foute map hoeft de database niet eens te raken.
  const wortel = eisE2eBestandenDir("bestandenDir" in omgeving ? omgeving.bestandenDir : process.env.ELENTRIK_BESTANDEN_DIR);
  const eigen = !omgeving.sql;
  const sql = omgeving.sql ?? postgres(eisE2eDatabase(), { max: 1, onnotice: () => {} });
  try {
    await eisE2eVerbinding(sql);
    const sleutels = await wisUitDatabase(sql, spoor);
    for (const sleutel of sleutels) await wisBestand(wortel, sleutel);
  } finally {
    if (eigen) await sql.end();
  }
}

/** Wist de rijen van het spoor en geeft de opslagsleutels van de gewiste bestanden terug. */
async function wisUitDatabase(sql: OpruimSql, spoor: E2eSpoor): Promise<string[]> {
  const emails = [...spoor.emails];
  const gebruikers = emails.length ? waarden(await sql<{ id: string }[]>`select id from "user" where email in ${sql(emails)}`, "id") : [];

  // Organisaties: de uitdrukkelijke, plus die waarvan een gebruiker van het spoor lid is.
  // Ze komen via het lidmaatschap binnen: elk lid van zo'n organisatie moet dus een gebruiker van het spoor van dezelfde spec zijn.
  const organisaties = new Set(spoor.organisaties);
  if (gebruikers.length) {
    const leden = await sql<{ organization_id: string }[]>`
      select distinct organization_id from member where user_id in ${sql(gebruikers)}`;
    for (const lid of leden) organisaties.add(lid.organization_id);
  }
  const orgLijst = [...organisaties];

  // Projecten: de uitdrukkelijke, plus alle projecten (ook de verwijderde) van die organisaties.
  const projecten = new Set(spoor.projecten);
  if (orgLijst.length) {
    for (const rij of await sql<{ id: string }[]>`select id from projecten where organisatie_id in ${sql(orgLijst)}`) {
      projecten.add(rij.id);
    }
  }
  const projectLijst = [...projecten];

  // Bestanden: van de projecten (plannen, exports) en de logo's van de organisaties.
  const bestandRijen: { id: string; sleutel: string }[] = [];
  if (projectLijst.length) {
    bestandRijen.push(
      ...(await sql<{ id: string; sleutel: string }[]>`
        select id, sleutel from bestanden
        where project_id in ${sql(projectLijst)}
           or id in (select bestand_id from exports where project_id in ${sql(projectLijst)})`),
    );
  }
  if (orgLijst.length) {
    bestandRijen.push(
      ...(await sql<{ id: string; sleutel: string }[]>`select id, sleutel from bestanden where organisatie_id in ${sql(orgLijst)}`),
    );
  }
  const bestandIds = [...new Set(bestandRijen.map((b) => b.id))];
  const sleutels = [...new Set(bestandRijen.map((b) => b.sleutel))];
  const instellingen = [...spoor.bedrijfsinstellingen];

  if (!emails.length && !orgLijst.length && !projectLijst.length && !instellingen.length) return [];

  // Eén transactie, in de volgorde van de vreemde sleutels: exports, snapshots, bestanden,
  // projecten, dan wat aan de organisatie hangt, de organisatie (leden en uitnodigingen gaan mee
  // via cascade) en ten slotte de gebruiker (sessies en accounts gaan mee).
  await sql.begin(async (tx) => {
    if (projectLijst.length) {
      await tx`delete from exports where project_id in ${tx(projectLijst)}`;
      await tx`delete from snapshots where project_id in ${tx(projectLijst)}`;
    }
    if (bestandIds.length) await tx`delete from bestanden where id in ${tx(bestandIds)}`;
    if (projectLijst.length) await tx`delete from projecten where id in ${tx(projectLijst)}`;
    if (orgLijst.length) {
      await tx`delete from abonnementen where organisatie_id in ${tx(orgLijst)}`;
      await tx`delete from bedrijfsinstellingen where organisatie_id in ${tx(orgLijst)}`;
    }
    if (instellingen.length) await tx`delete from bedrijfsinstellingen where id in ${tx(instellingen)}`;
    if (orgLijst.length) await tx`delete from organization where id in ${tx(orgLijst)}`;
    // Verificatierijen: een bevestiging heeft het adres als identifier; een inloglink heeft een
    // gehashte token als identifier en het adres in de JSON van `value` (ook voor een onbekend adres).
    for (const email of emails) {
      await tx`delete from verification where identifier = ${email} or value like ${verificatiePatroon(email)}`;
    }
    if (gebruikers.length) await tx`delete from "user" where id in ${tx(gebruikers)}`;
  });
  return sleutels;
}
