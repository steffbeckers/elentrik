import { describe, expect, test } from "vitest";
import { valideerStructuur, type InstallatieDocument } from "@elentrik/model";
import { analyseer, controleer, haalRegelset, type Bevinding } from "../src/index";
import { installatie, type BordBouwer } from "../src/testing/index";
import { automaatZonderBord } from "./hulp";

const regelset = haalRegelset("arei-2020@1");

/** Gemeenschappelijk deel van de referenties: de kringen van het appartement. */
function appartementKringen(b: BordBouwer): void {
  b.kring((k) => k.automaat(20).leiding(2.5).contactdozen(6, { ruimte: "leefruimte" }))
    .kring((k) => k.automaat(16).leiding(1.5).lichtpunten(5))
    .kring((k) => k.automaat(32).leiding(6).toestel("kookplaat", { ruimte: "keuken" }))
    .differentieel(30, (n) =>
      n
        .kring((k) => k.automaat(20).leiding(2.5).toestel("wasmachine", { ruimte: "wasplaats" }))
        .kring((k) => k.automaat(16).leiding(2.5).contactdozen(2, { ruimte: "badkamer" })),
    );
}

const fouten = (bevindingen: Bevinding[]) => bevindingen.filter((b) => b.ernst === "fout");
const waarschuwingen = (bevindingen: Bevinding[]) => bevindingen.filter((b) => b.ernst === "waarschuwing");

function appartement(): InstallatieDocument {
  return installatie()
    .differentieel(300, (d) => d.verdeelbord(appartementKringen))
    .bouw().doc;
}

const regelId = (id: string) => (b: Bevinding) => b.regelId === id;

describe("referentie-installaties", () => {
  test("appartement: enkel info niet-geplaatst, één per punt", () => {
    const doc = appartement();
    expect(valideerStructuur(doc)).toEqual([]);
    const bevindingen = controleer(doc, regelset);
    // 6 contactdozen + 5 lichtpunten + kookplaat + wasmachine + 2 contactdozen
    const aantalPunten = 6 + 5 + 1 + 1 + 2;
    expect(aantalPunten).toBe(15);
    expect(analyseer(doc).nietGeplaatst).toHaveLength(aantalPunten);
    expect(bevindingen).toHaveLength(aantalPunten);
    for (const b of bevindingen) {
      expect(b.ernst).toBe("info");
      expect(b.regelId).toBe("arei.situatie.niet-geplaatst");
      expect(b.berichtSleutel).toBe("arei.situatie.niet-geplaatst.punt");
    }
    expect(new Set(bevindingen.map((b) => b.nodeIds[0])).size).toBe(aantalPunten);
    expect(bevindingen.filter(regelId("arei.punt.zonder-beveiliging"))).toEqual([]);
  });

  test("rijwoning: precies één fout, max-contactdozen.overschreden op de kring met 9 contactdozen", () => {
    const { doc, ids } = installatie()
      .differentieel(300, (d) =>
        d.verdeelbord((b) => {
          appartementKringen(b);
          b.kring((k) => k.automaat(20).als("rij").leiding(2.5).contactdozen(9, { ruimte: "leefruimte" }));
        }),
      )
      .bouw();
    expect(valideerStructuur(doc)).toEqual([]);
    const bevindingen = controleer(doc, regelset);
    const f = fouten(bevindingen);
    expect(f).toHaveLength(1);
    expect(f[0]).toMatchObject({
      regelId: "arei.kring.max-contactdozen",
      berichtSleutel: "arei.kring.max-contactdozen.overschreden",
      nodeIds: [ids["rij"]],
      parameters: { aantal: 9, max: 8 },
    });
    expect(waarschuwingen(bevindingen)).toEqual([]);
    expect(bevindingen.filter(regelId("arei.punt.zonder-beveiliging"))).toEqual([]);
  });

  test("woning met laadpaal en zonnepanelen (3N400V): geen fouten, geen waarschuwingen", () => {
    const { doc } = installatie({ stroomtype: "3N400V" })
      .differentieel(
        300,
        (d) =>
          d.verdeelbord((b) => {
            appartementKringen(b);
            b.kring((k) => k.automaat(32, { polen: 4 }).leiding(10).toestel("laadpaal"));
            b.kring((k) => k.automaat(20).leiding(4).toestel("omvormer"));
          }),
        { polen: 4 },
      )
      .bouw();
    expect(valideerStructuur(doc)).toEqual([]);
    const bevindingen = controleer(doc, regelset);
    expect(fouten(bevindingen)).toEqual([]);
    expect(waarschuwingen(bevindingen)).toEqual([]);
    expect(bevindingen.filter(regelId("arei.punt.zonder-beveiliging"))).toEqual([]);
  });
});

describe("onbeveiligde installaties", () => {
  const sleutels = (bevindingen: Bevinding[]) => fouten(bevindingen).map((b) => b.berichtSleutel);

  test("verdeelbord > leiding 1.5 > contactdozen zonder automaat: regel 1 en regel 10 geven fouten", () => {
    const { doc } = installatie()
      .verdeelbord((b) => b.kring((k) => k.leiding(1.5).contactdozen(2)))
      .bouw();
    expect(valideerStructuur(doc)).toEqual([]);
    const f = fouten(controleer(doc, regelset));
    expect(f.filter(regelId("arei.differentieel.algemeen")).map((b) => b.berichtSleutel)).toEqual([
      "arei.differentieel.algemeen.ontbreekt",
    ]);
    expect(f.filter(regelId("arei.punt.zonder-beveiliging"))).toHaveLength(2);
    expect(f).toHaveLength(3);
  });

  test("automaat 32 > leiding > contactdozen zonder verdeelbord: regel 1 en regel 10 geven fouten", () => {
    const { doc } = automaatZonderBord(2);
    expect(valideerStructuur(doc)).toEqual([]);
    const f = controleer(doc, regelset).filter((b) => b.ernst === "fout");
    expect(sleutels(f).sort()).toEqual([
      "arei.differentieel.algemeen.ontbreekt",
      "arei.punt.zonder-beveiliging.ontbreekt",
      "arei.punt.zonder-beveiliging.ontbreekt",
    ]);
  });
});
