import { describe, expect, test } from "vitest";
import type { InstallatieDocument } from "@elentrik/model";
import { controleer, type Bevinding, type Regel, type Regelset } from "../../src/index";
import { installatie } from "../../src/testing/index";
import { PARAMETERS_AREI_2020_V1 } from "../../src/regelsets/arei-2020/parameters";
import { maakRegelMaxContactdozen } from "../../src/regelsets/arei-2020/regels/max-contactdozen";
import { maakRegelMinDoorsnede } from "../../src/regelsets/arei-2020/regels/min-doorsnede";
import { maakRegelToestelEigenKring } from "../../src/regelsets/arei-2020/regels/toestel-eigen-kring";
import { kloon, verwachtBekendeSleutels } from "../hulp";

function alleen(regel: Regel): Regelset {
  return { id: "test", versie: 1, gepubliceerd: false, regels: [regel] };
}

function draai(regel: Regel, doc: InstallatieDocument): Bevinding[] {
  const bevindingen = controleer(doc, alleen(regel));
  verwachtBekendeSleutels(regel, bevindingen);
  return bevindingen;
}

const beveiligingIdVan = (doc: InstallatieDocument) => Object.values(doc.nodes).find((n) => n.type === "automaat")!.id;

describe("regel 4: max-contactdozen", () => {
  const regel = maakRegelMaxContactdozen(PARAMETERS_AREI_2020_V1);

  test("is voorlopig en heeft de verwachte metadata", () => {
    expect(regel.id).toBe("arei.kring.max-contactdozen");
    expect(regel.nagekeken).toBe(false);
    expect(regel.artikel).toBe("");
    expect(regel.ernst).toBe("fout");
  });

  test("8 contactdozen geven geen bevinding", () => {
    const { doc } = installatie()
      .verdeelbord((b) => b.kring((k) => k.automaat(16).leiding(2.5).contactdozen(8)))
      .bouw();
    expect(draai(regel, doc)).toEqual([]);
  });

  test("9 contactdozen geven .overschreden op de beveiliging", () => {
    const { doc } = installatie()
      .verdeelbord((b) => b.kring((k) => k.automaat(16).leiding(2.5).contactdozen(9)))
      .bouw();
    expect(draai(regel, doc)).toEqual([
      {
        regelId: "arei.kring.max-contactdozen",
        ernst: "fout",
        nodeIds: [beveiligingIdVan(doc)],
        berichtSleutel: "arei.kring.max-contactdozen.overschreden",
        parameters: { kring: "A", aantal: 9, max: 8 },
        afgeweken: false,
      },
    ]);
  });

  test("één contactdoos met aantal 9 geeft ook .overschreden", () => {
    const { doc, ids } = installatie()
      .verdeelbord((b) => b.kring((k) => k.automaat(16).leiding(2.5).contactdozen(1).als("cd")))
      .bouw();
    const gewijzigd = kloon(doc);
    const node = gewijzigd.nodes[ids["cd"]!]!;
    if (node.type !== "contactdoos") throw new Error("contactdoos verwacht");
    node.aantal = 9;
    expect(draai(regel, gewijzigd)).toMatchObject([
      { nodeIds: [beveiligingIdVan(gewijzigd)], parameters: { kring: "A", aantal: 9, max: 8 } },
    ]);
  });

  test("een bevinding per kring die de grens overschrijdt", () => {
    const { doc } = installatie()
      .verdeelbord((b) =>
        b
          .kring((k) => k.automaat(16).leiding(2.5).contactdozen(9))
          .kring((k) => k.automaat(16).leiding(2.5).contactdozen(3))
          .kring((k) => k.automaat(16).leiding(2.5).contactdozen(10)),
      )
      .bouw();
    const bevindingen = draai(regel, doc);
    expect(bevindingen.map((b) => b.parameters)).toEqual([
      { kring: "A", aantal: 9, max: 8 },
      { kring: "C", aantal: 10, max: 8 },
    ]);
  });
});

describe("regel 5: min-doorsnede", () => {
  const regel = maakRegelMinDoorsnede(PARAMETERS_AREI_2020_V1);

  test("is voorlopig en heeft de verwachte metadata", () => {
    expect(regel.id).toBe("arei.kring.min-doorsnede");
    expect(regel.nagekeken).toBe(false);
    expect(regel.artikel).toBe("");
    expect(regel.ernst).toBe("fout");
  });

  test("contactdozen op 1,5 mm2 geven .contactdozen", () => {
    const { doc } = installatie()
      .verdeelbord((b) => b.kring((k) => k.automaat(16).leiding(1.5).contactdozen(2)))
      .bouw();
    expect(draai(regel, doc)).toEqual([
      {
        regelId: "arei.kring.min-doorsnede",
        ernst: "fout",
        nodeIds: [beveiligingIdVan(doc)],
        berichtSleutel: "arei.kring.min-doorsnede.contactdozen",
        parameters: { kring: "A", doorsnede: 1.5, min: 2.5 },
        afgeweken: false,
      },
    ]);
  });

  test("contactdozen op 2,5 mm2 geven niets", () => {
    const { doc } = installatie()
      .verdeelbord((b) => b.kring((k) => k.automaat(16).leiding(2.5).contactdozen(2)))
      .bouw();
    expect(draai(regel, doc)).toEqual([]);
  });

  test("lichtpunten op 1,5 mm2 geven niets", () => {
    const { doc } = installatie()
      .verdeelbord((b) => b.kring((k) => k.automaat(10).leiding(1.5).lichtpunten(3)))
      .bouw();
    expect(draai(regel, doc)).toEqual([]);
  });

  test("lichtpunten op 1 mm2 geven .verlichting", () => {
    const { doc } = installatie()
      .verdeelbord((b) => b.kring((k) => k.automaat(10).leiding(1).lichtpunten(3)))
      .bouw();
    expect(draai(regel, doc)).toEqual([
      {
        regelId: "arei.kring.min-doorsnede",
        ernst: "fout",
        nodeIds: [beveiligingIdVan(doc)],
        berichtSleutel: "arei.kring.min-doorsnede.verlichting",
        parameters: { kring: "A", doorsnede: 1, min: 1.5 },
        afgeweken: false,
      },
    ]);
  });

  test("een kring met contactdozen en lichtpunten volgt de eis voor contactdozen", () => {
    const { doc } = installatie()
      .verdeelbord((b) => b.kring((k) => k.automaat(16).leiding(1.5).contactdozen(1).lichtpunten(1)))
      .bouw();
    expect(draai(regel, doc).map((b) => b.berichtSleutel)).toEqual(["arei.kring.min-doorsnede.contactdozen"]);
  });

  test("een kring met een leiding van 0 mm2 (onbekende doorsnede) wordt overgeslagen", () => {
    const { doc } = installatie()
      .verdeelbord((b) => b.kring((k) => k.automaat(16).leiding(0).contactdozen(2)))
      .bouw();
    expect(draai(regel, doc)).toEqual([]);
  });

  test("een kring met enkel toestellen geeft niets", () => {
    const { doc } = installatie()
      .verdeelbord((b) => b.kring((k) => k.automaat(16).leiding(1).toestel("oven")))
      .bouw();
    expect(draai(regel, doc)).toEqual([]);
  });
});

describe("regel 6: toestel-eigen-kring", () => {
  const regel = maakRegelToestelEigenKring(PARAMETERS_AREI_2020_V1);

  test("is voorlopig en heeft de verwachte metadata", () => {
    expect(regel.id).toBe("arei.toestel.eigen-kring");
    expect(regel.nagekeken).toBe(false);
    expect(regel.artikel).toBe("");
    expect(regel.ernst).toBe("fout");
  });

  test("een kookplaat alleen geeft niets", () => {
    const { doc } = installatie()
      .verdeelbord((b) => b.kring((k) => k.automaat(32).leiding(6).toestel("kookplaat")))
      .bouw();
    expect(draai(regel, doc)).toEqual([]);
  });

  test("een kookplaat met een contactdoos geeft .gedeeld met beide ids", () => {
    const { doc, ids } = installatie()
      .verdeelbord((b) =>
        b.kring((k) => k.automaat(32).leiding(6).toestel("kookplaat").als("kookplaat").contactdozen(1).als("cd")),
      )
      .bouw();
    expect(draai(regel, doc)).toEqual([
      {
        regelId: "arei.toestel.eigen-kring",
        ernst: "fout",
        nodeIds: [ids["kookplaat"], ids["cd"]],
        berichtSleutel: "arei.toestel.eigen-kring.gedeeld",
        parameters: { kring: "A", toestel: "kookplaat" },
        afgeweken: false,
      },
    ]);
  });

  test("een wasmachine met een contactdoos geeft niets", () => {
    const { doc } = installatie()
      .verdeelbord((b) => b.kring((k) => k.automaat(16).leiding(2.5).toestel("wasmachine").contactdozen(1)))
      .bouw();
    expect(draai(regel, doc)).toEqual([]);
  });

  test("twee toestellen uit de lijst geven elk een bevinding met de andere punten", () => {
    const { doc, ids } = installatie()
      .verdeelbord((b) =>
        b.kring((k) => k.automaat(32).leiding(6).toestel("kookplaat").als("kookplaat").toestel("oven").als("oven")),
      )
      .bouw();
    const bevindingen = draai(regel, doc);
    expect(bevindingen.map((b) => b.nodeIds)).toEqual([
      [ids["kookplaat"], ids["oven"]],
      [ids["oven"], ids["kookplaat"]],
    ]);
    expect(bevindingen.map((b) => b.parameters)).toEqual([
      { kring: "A", toestel: "kookplaat" },
      { kring: "A", toestel: "oven" },
    ]);
  });

  test("de andere punten staan in volgorde van puntIds", () => {
    const { doc, ids } = installatie()
      .verdeelbord((b) =>
        b.kring((k) =>
          k
            .automaat(32)
            .leiding(6)
            .contactdozen(1)
            .als("eerste")
            .toestel("boiler")
            .als("boiler")
            .lichtpunten(1)
            .als("laatste"),
        ),
      )
      .bouw();
    expect(draai(regel, doc).map((b) => b.nodeIds)).toEqual([[ids["boiler"], ids["eerste"], ids["laatste"]]]);
  });
});
