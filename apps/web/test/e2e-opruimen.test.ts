// De veiligheidsgrendel van de opruimhulp voor e2e: ze wist alleen in `elentrik_e2e` en in de
// e2e-bestandenmap. Hier met een nepverbinding; deze test raakt nooit een echte database.
import { resolve } from "node:path";
import { describe, expect, test } from "vitest";
import { nieuwSpoor, ruimOp, verificatiePatroon, type OpruimSql } from "../e2e/hulp/opruimen";
import { E2E_BESTANDEN_DIR, WEB_DIR } from "../e2e/omgeving";

/** Een nepverbinding die onthoudt welke zoekopdrachten ze kreeg en altijd lege rijen geeft. */
function nepSql(databaseNaam: string) {
  const opdrachten: string[] = [];
  const sql = Object.assign(
    async (delen: unknown) => {
      // `sql(lijst)` (een hulp voor `in (...)`) geeft de lijst terug; een sjabloon is een zoekopdracht.
      if (!Array.isArray(delen) || !("raw" in delen)) return delen;
      const tekst = (delen as unknown as string[]).join("?");
      opdrachten.push(tekst);
      return tekst.includes("current_database()") ? [{ naam: databaseNaam }] : [];
    },
    { begin: async (werk: (tx: unknown) => Promise<void>) => werk(sql) },
  ) as unknown as OpruimSql;
  return { sql, opdrachten };
}

const spoorMetIets = () => {
  const spoor = nieuwSpoor();
  spoor.emails.add("iemand@e2e.elentrik.test");
  return spoor;
};

describe("ruimOp: de grendel", () => {
  test("weigert een andere database dan elentrik_e2e, vóór er iets gewist wordt", async () => {
    for (const naam of ["elentrik", "postgres", "elentrik_e2e_kopie", "Elentrik_E2E", ""]) {
      const { sql, opdrachten } = nepSql(naam);
      await expect(ruimOp(spoorMetIets(), { sql, bestandenDir: E2E_BESTANDEN_DIR }), naam).rejects.toThrow("Geweigerd");
      // Alleen de vraag naar de databasenaam is gesteld.
      expect(opdrachten, naam).toHaveLength(1);
    }
  });

  test("weigert een andere opslagmap dan de e2e-map, zonder de database te vragen", async () => {
    for (const map of [
      resolve(WEB_DIR, ".data/bestanden"),
      resolve(WEB_DIR, ".data"),
      `${E2E_BESTANDEN_DIR}-extra`,
      resolve(E2E_BESTANDEN_DIR, ".."),
      resolve(E2E_BESTANDEN_DIR, "projecten"),
      "",
      undefined,
    ]) {
      const { sql, opdrachten } = nepSql("elentrik_e2e");
      await expect(ruimOp(spoorMetIets(), { sql, bestandenDir: map }), String(map)).rejects.toThrow("Geweigerd");
      expect(opdrachten, String(map)).toHaveLength(0);
    }
  });

  test("een lege opslagmap uit de omgeving wordt ook geweigerd (geen terugval op een standaardmap)", async () => {
    const { sql } = nepSql("elentrik_e2e");
    const oud = process.env.ELENTRIK_BESTANDEN_DIR;
    delete process.env.ELENTRIK_BESTANDEN_DIR;
    try {
      await expect(ruimOp(spoorMetIets(), { sql })).rejects.toThrow("Geweigerd");
    } finally {
      if (oud !== undefined) process.env.ELENTRIK_BESTANDEN_DIR = oud;
    }
  });

  test("weigert ook als het spoor leeg is: de grendel hangt niet van het spoor af", async () => {
    const { sql } = nepSql("elentrik");
    await expect(ruimOp(nieuwSpoor(), { sql, bestandenDir: E2E_BESTANDEN_DIR })).rejects.toThrow("Geweigerd");
  });

  test("de e2e-database met de e2e-map wordt aanvaard", async () => {
    const { sql, opdrachten } = nepSql("elentrik_e2e");
    await expect(ruimOp(spoorMetIets(), { sql, bestandenDir: E2E_BESTANDEN_DIR })).resolves.toBeUndefined();
    expect(opdrachten.length).toBeGreaterThan(1);
  });
});

describe("verificatiePatroon", () => {
  test("vindt het adres in de JSON van een inloglink", () => {
    expect(verificatiePatroon("a-1@e2e.elentrik.test")).toBe('%"email":"a-1@e2e.elentrik.test"%');
  });

  test("maakt de jokertekens van LIKE letterlijk", () => {
    expect(verificatiePatroon("a_b%c@x.test")).toBe(String.raw`%"email":"a\_b\%c@x.test"%`);
  });
});

describe("nieuwSpoor", () => {
  test("geeft een leeg spoor dat niet gedeeld wordt", () => {
    const a = nieuwSpoor();
    const b = nieuwSpoor();
    a.emails.add("a@e2e.elentrik.test");
    a.organisaties.add("org");
    a.projecten.add("project");
    expect([...b.emails, ...b.organisaties, ...b.projecten]).toEqual([]);
  });
});
