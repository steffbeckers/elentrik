import "fake-indexeddb/auto";
import { nieuwProjectDocument, type InstallatieDocument } from "@elentrik/model";
import { clear, get, keys, set } from "idb-keyval";
import { beforeEach, describe, expect, test } from "vitest";
import {
  bewaarConcept,
  maakInstantieId,
  nieuwsteConcept,
  wisAangebodenConcept,
  wisConcept,
  type Concept,
  type ConceptPlek,
} from "../app/composables/concepten";

const AN = "gebruiker-an";
const BART = "gebruiker-bart";

function startDocument(): InstallatieDocument {
  return nieuwProjectDocument({ klantNaam: "Janssens", stroomtype: "2x230V", datum: "2026-10-18" });
}

function concept(naam: string, tijd: number): Concept {
  return { document: startDocument(), versie: 1, naam, tijd };
}

function plek(instantieId: string, gebruikerId = AN, projectId = "p1"): ConceptPlek {
  return { gebruikerId, projectId, instantieId };
}

/** Het concept dat bij het openen van het project aan `gebruikerId` wordt aangeboden. */
async function conceptVan(projectId: string, gebruikerId = AN): Promise<Concept | undefined> {
  return (await nieuwsteConcept(projectId, gebruikerId))?.concept;
}

beforeEach(async () => {
  await clear();
});

describe("concepten", () => {
  test("bewaren, ophalen en wissen", async () => {
    const document = startDocument();
    await bewaarConcept(plek("A"), { document, versie: 3, naam: "N", tijd: 123 });
    expect(await conceptVan("p1")).toEqual({ document, versie: 3, naam: "N", tijd: 123 });
    await wisConcept(plek("A"));
    expect(await conceptVan("p1")).toBeUndefined();
  });

  test("de sleutel bevat de gebruiker, met een eigen voorvoegsel", async () => {
    await bewaarConcept(plek("A"), concept("N", 1));
    expect(await keys()).toEqual([`concept:u:${AN}:p1:A`]);
  });

  test("nieuwsteConcept: ook een concept van vóór de laatste serverwijziging wordt aangeboden", async () => {
    // De server wijzigde om 11:00 (bv. de eigen PUT die nog net slaagde); het concept is van 10:00.
    await bewaarConcept(plek("A"), concept("N", Date.parse("2026-10-18T10:00:00.000Z")));
    expect((await conceptVan("p1"))?.naam).toBe("N");
  });

  test("nieuwsteConcept: zonder concept geeft null", async () => {
    expect(await nieuwsteConcept("p1", AN)).toBeNull();
  });

  test("elk venster heeft een eigen sleutel; het nieuwste op tijd wordt aangeboden", async () => {
    await bewaarConcept(plek("A"), concept("A", 200));
    await bewaarConcept(plek("B"), concept("B", 100));
    expect(await nieuwsteConcept("p1", AN)).toMatchObject({ sleutel: `concept:u:${AN}:p1:A`, concept: { naam: "A" } });
    await wisConcept(plek("A"));
    expect(await nieuwsteConcept("p1", AN)).toMatchObject({ sleutel: `concept:u:${AN}:p1:B`, concept: { naam: "B" } });
  });

  test("wisAangebodenConcept wist alleen het aangeboden concept", async () => {
    await bewaarConcept(plek("A"), concept("A", 200));
    await bewaarConcept(plek("B"), concept("B", 100));
    const aangeboden = await nieuwsteConcept("p1", AN);
    await wisAangebodenConcept(aangeboden!);
    expect(await nieuwsteConcept("p1", AN)).toMatchObject({ sleutel: `concept:u:${AN}:p1:B` });
  });

  test("wisAangebodenConcept laat het concept staan als een ander venster het intussen herschreef", async () => {
    // B krijgt S1 aangeboden; het venster A leeft nog en schrijft S2 onder dezelfde sleutel.
    await bewaarConcept(plek("A"), concept("S1", 100));
    const aangeboden = await nieuwsteConcept("p1", AN);
    await bewaarConcept(plek("A"), concept("S2", 200));
    await wisAangebodenConcept(aangeboden!);
    expect(await nieuwsteConcept("p1", AN)).toMatchObject({ sleutel: `concept:u:${AN}:p1:A`, concept: { naam: "S2" } });
  });

  test("de concepten van een ander project tellen niet mee", async () => {
    await bewaarConcept(plek("A", AN, "p10"), concept("Ander", 300));
    await set("concept:p10", concept("Ander oud", 400));
    await set("concept:p10:X", concept("Ander oud venster", 500));
    expect(await nieuwsteConcept("p1", AN)).toBeNull();
    // Ze blijven ook staan: alleen de oude concepten van het geopende project worden overgenomen.
    expect(await keys()).toHaveLength(3);
  });

  test("maakInstantieId gebruikt randomUUID als die er is", () => {
    expect(maakInstantieId({ randomUUID: () => "a-b-c-d-e", getRandomValues: (a) => a })).toBe("a-b-c-d-e");
  });

  test("maakInstantieId zonder randomUUID (geen veilige context) valt terug op getRandomValues", () => {
    const zonderUuid = { getRandomValues: (rij: Uint8Array<ArrayBuffer>) => crypto.getRandomValues(rij) };
    const een = maakInstantieId(zonderUuid);
    const twee = maakInstantieId(zonderUuid);
    expect(een).toMatch(/^[0-9a-f]{32}$/);
    expect(een).not.toBe(twee);
  });

  test("maakInstantieId zonder crypto valt terug op de tijd en Math.random", () => {
    const een = maakInstantieId(null);
    const twee = maakInstantieId(null);
    expect(een).toMatch(/^[0-9a-z]+-[0-9a-z]+$/);
    expect(een).not.toBe(twee);
  });
});

describe("concepten per gebruiker", () => {
  test("de concepten van gebruiker A worden nooit aan gebruiker B aangeboden", async () => {
    await bewaarConcept(plek("A", AN), concept("Werk van An", 200));
    expect(await nieuwsteConcept("p1", BART)).toBeNull();
    // Ook niet als B een eigen, ouder concept heeft: alleen dat van B zelf.
    await bewaarConcept(plek("B", BART), concept("Werk van Bart", 100));
    expect(await nieuwsteConcept("p1", BART)).toMatchObject({
      sleutel: `concept:u:${BART}:p1:B`,
      concept: { naam: "Werk van Bart" },
    });
    expect(await nieuwsteConcept("p1", AN)).toMatchObject({ concept: { naam: "Werk van An" } });
  });

  test("wissen raakt alleen het concept van de eigen gebruiker", async () => {
    await bewaarConcept(plek("A", AN), concept("An", 100));
    await bewaarConcept(plek("A", BART), concept("Bart", 100));
    await wisConcept(plek("A", AN));
    expect(await nieuwsteConcept("p1", AN)).toBeNull();
    expect((await conceptVan("p1", BART))?.naam).toBe("Bart");
  });

  test.each(["concept:p1", "concept:p1:X"])(
    "een oud concept zonder gebruiker (%s) wordt één keer aangeboden, aan de eerste gebruiker",
    async (oudeSleutel) => {
      await set(oudeSleutel, concept("Oud", 300));
      const aangeboden = await nieuwsteConcept("p1", AN);
      expect(aangeboden?.concept.naam).toBe("Oud");
      // Het is nu van An: de oude sleutel is weg, en Bart krijgt het nooit te zien.
      expect(aangeboden?.sleutel.startsWith(`concept:u:${AN}:p1:`)).toBe(true);
      expect(await get(oudeSleutel)).toBeUndefined();
      expect(await nieuwsteConcept("p1", BART)).toBeNull();
      // Wie het verwerpt of laadt, wist het; daarna wordt het niemand meer aangeboden.
      await wisAangebodenConcept(aangeboden!);
      expect(await nieuwsteConcept("p1", AN)).toBeNull();
      expect(await keys()).toEqual([]);
    },
  );

  test("een oud concept dat niet gekozen werd, blijft van de eerste gebruiker", async () => {
    await set("concept:p1", concept("Oud", 300));
    await nieuwsteConcept("p1", AN);
    // An sloot het venster zonder te kiezen: bij het volgende openen krijgt An het opnieuw.
    expect((await conceptVan("p1", AN))?.naam).toBe("Oud");
    expect(await nieuwsteConcept("p1", BART)).toBeNull();
  });

  test("oude en eigen concepten: het nieuwste op tijd wordt aangeboden", async () => {
    await set("concept:p1", concept("Oud", 300));
    await set("concept:p1:X", concept("Oud venster", 100));
    await bewaarConcept(plek("A"), concept("Eigen", 200));
    const aangeboden = await nieuwsteConcept("p1", AN);
    expect(aangeboden).toMatchObject({ concept: { naam: "Oud" } });
    await wisAangebodenConcept(aangeboden!);
    expect(await nieuwsteConcept("p1", AN)).toMatchObject({ sleutel: `concept:u:${AN}:p1:A` });
    await wisConcept(plek("A"));
    expect(await nieuwsteConcept("p1", AN)).toMatchObject({ concept: { naam: "Oud venster" } });
  });
});
