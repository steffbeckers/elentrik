import { describe, expect, test } from "vitest";
import type { InstallatieDocument } from "@elentrik/model";
import { controleer, type Bevinding, type Regel, type Regelset } from "../../src/index";
import { installatie } from "../../src/testing/index";
import { maakRegelPuntZonderBeveiliging } from "../../src/regelsets/arei-2020/regels/punt-zonder-beveiliging";
import { automaatZonderBord, verwachtBekendeSleutels } from "../hulp";

function alleen(regel: Regel): Regelset {
  return { id: "test", versie: 1, gepubliceerd: false, regels: [regel] };
}

function draai(regel: Regel, doc: InstallatieDocument): Bevinding[] {
  const bevindingen = controleer(doc, alleen(regel));
  verwachtBekendeSleutels(regel, bevindingen);
  return bevindingen;
}

describe("regel 10: punt-zonder-beveiliging", () => {
  const regel = maakRegelPuntZonderBeveiliging();

  test("is voorlopig en heeft de verwachte metadata", () => {
    expect(regel.id).toBe("arei.punt.zonder-beveiliging");
    expect(regel.nagekeken).toBe(false);
    expect(regel.artikel).toBe("");
    expect(regel.ernst).toBe("fout");
  });

  test("punten achter een gewone kring geven geen bevinding", () => {
    const { doc } = installatie()
      .verdeelbord((b) => b.kring((k) => k.automaat(16).leiding(2.5).contactdozen(2)))
      .bouw();
    expect(draai(regel, doc)).toEqual([]);
  });

  test("een leeg document geeft geen bevinding", () => {
    expect(draai(regel, installatie().bouw().doc)).toEqual([]);
  });

  test("verdeelbord > leiding > contactdozen zonder automaat: één fout per punt", () => {
    const { doc } = installatie()
      .verdeelbord((b) => b.kring((k) => k.leiding(1.5).contactdozen(2)))
      .bouw();
    const punten = Object.values(doc.nodes)
      .filter((n) => n.type === "contactdoos")
      .map((n) => n.id);
    expect(punten).toHaveLength(2);
    expect(draai(regel, doc)).toEqual(
      punten.map((id) => ({
        regelId: "arei.punt.zonder-beveiliging",
        ernst: "fout",
        nodeIds: [id],
        berichtSleutel: "arei.punt.zonder-beveiliging.ontbreekt",
        parameters: {},
        afgeweken: false,
      })),
    );
  });

  test("automaat zonder verdeelbord erboven: één fout per punt", () => {
    const { doc, puntIds } = automaatZonderBord(2);
    const bevindingen = draai(regel, doc);
    expect(bevindingen.map((b) => b.nodeIds)).toEqual(puntIds.map((id) => [id]));
    expect(bevindingen.every((b) => b.berichtSleutel === "arei.punt.zonder-beveiliging.ontbreekt")).toBe(true);
  });
});
