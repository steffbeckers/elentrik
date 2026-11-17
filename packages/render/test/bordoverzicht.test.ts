import { analyseer } from "@elentrik/arei";
import { installatie, referentieAppartement, referentieMetOnderbord, type BordBouwer } from "@elentrik/arei/testing";
import type { InstallatieDocument } from "@elentrik/model";
import { describe, expect, test } from "vitest";
import { kloon } from "./hulp";
import { MODULES_PER_RIJ, bordOverzicht } from "../src/index";

function overzicht(doc: InstallatieDocument) {
  return bordOverzicht(doc, analyseer(doc));
}

/** `aantal` kringen met elk één contactdoos. */
function kringen(b: BordBouwer, aantal: number): void {
  for (let i = 0; i < aantal; i++) b.kring((k) => k.automaat(16).leiding(2.5).contactdozen(1));
}

/** Een algemeen differentieel van 300 mA, een kookplaat rechtstreeks op het bord en `aantal` kringen achter één differentieel. */
function achterDifferentieel(mA: number, aantal: number): InstallatieDocument {
  return installatie()
    .differentieel(300, (d) =>
      d.verdeelbord((b) =>
        b
          .kring((k) => k.automaat(32).leiding(6).toestel("kookplaat"))
          .differentieel(mA, (n) => kringen(n, aantal)),
      ),
    )
    .bouw().doc;
}

describe("bordOverzicht", () => {
  test("referentieAppartement: één bord met zijn kringen, modules en de bezetting per differentieel", () => {
    const doc = referentieAppartement();
    const [bord, ...rest] = overzicht(doc);
    expect(rest).toEqual([]);
    // Vijf tweepolige automaten, het differentieel van 30 mA in het bord en het algemene ervoor.
    expect(bord).toMatchObject({ naam: "", volgnummer: 1, kringen: 5, modules: 14, rijen: 1, plaatsen: 18 });
    expect(bord!.differentielen).toMatchObject([
      { gevoeligheid_mA: 300, algemeen: true, plaats: 1, kringen: 3, contactdozen: 6, teVeelKringen: false },
      { gevoeligheid_mA: 30, algemeen: false, plaats: 1, kringen: 2, contactdozen: 2, teVeelKringen: false },
    ]);
    expect(doc.nodes[bord!.bordId]?.type).toBe("verdeelbord");
    for (const d of bord!.differentielen) expect(doc.nodes[d.nodeId]?.type).toBe("differentieel");
  });

  test("een onderbord telt zijn eigen kringen en modules; de voedende automaat hoort bij het hoofdbord", () => {
    const [hoofd, garage, ...rest] = overzicht(referentieMetOnderbord());
    expect(rest).toEqual([]);
    expect(hoofd).toMatchObject({ naam: "", volgnummer: 1, kringen: 3, modules: 8 });
    expect(garage).toMatchObject({ naam: "Garage", volgnummer: 2, kringen: 2, modules: 4, rijen: 1, differentielen: [] });
    // Alle vijf de kringen hebben het algemene differentieel als dichtstbijzijnde.
    expect(hoofd!.differentielen).toMatchObject([{ algemeen: true, kringen: 5, contactdozen: 12 }]);
  });

  test("modules: één per pool van een automaat of differentieel; een zekering telt de polen van het stroomtype", () => {
    const bouw = (stroomtype: "2x230V" | "3x230V" | "3N400V") =>
      installatie({ stroomtype })
        .differentieel(
          300,
          (d) =>
            d.verdeelbord((b) =>
              b
                .kring((k) => k.zekering(16).leiding(2.5).contactdozen(1))
                .kring((k) => k.automaat(16, { polen: 1 }).leiding(1.5).lichtpunten(1))
                .kring((k) => k.automaat(32, { polen: 4 }).leiding(6).toestel("kookplaat")),
            ),
          { polen: 4 },
        )
        .bouw().doc;
    // Differentieel 4 + automaten 1 en 4 = 9, plus de zekering.
    expect(overzicht(bouw("2x230V"))[0]!.modules).toBe(9 + 2);
    expect(overzicht(bouw("3x230V"))[0]!.modules).toBe(9 + 3);
    expect(overzicht(bouw("3N400V"))[0]!.modules).toBe(9 + 4);
  });

  test("de kast: rijen van 18 modules met 20 % reserve", () => {
    const metModules = (eenpolig: number) =>
      installatie()
        .verdeelbord((b) => {
          for (let i = 0; i < eenpolig; i++) b.kring((k) => k.automaat(16, { polen: 1 }).leiding(1.5).lichtpunten(1));
        })
        .bouw().doc;
    expect(MODULES_PER_RIJ).toBe(18);
    expect(overzicht(metModules(0))[0]).toMatchObject({ modules: 0, rijen: 0, plaatsen: 0 });
    expect(overzicht(metModules(1))[0]).toMatchObject({ modules: 1, rijen: 1, plaatsen: 18 });
    // 15 modules met 20 % reserve vullen net één rij; de zestiende vraagt een tweede.
    expect(overzicht(metModules(15))[0]).toMatchObject({ modules: 15, rijen: 1, plaatsen: 18 });
    expect(overzicht(metModules(16))[0]).toMatchObject({ modules: 16, rijen: 2, plaatsen: 36 });
    expect(overzicht(metModules(30))[0]).toMatchObject({ modules: 30, rijen: 2 });
    expect(overzicht(metModules(31))[0]).toMatchObject({ modules: 31, rijen: 3, plaatsen: 54 });
  });

  test("een meervoudige contactdoos telt als één, een toestel of lichtpunt niet", () => {
    const { doc, ids } = installatie()
      .differentieel(300, (d) =>
        d.verdeelbord((b) =>
          b
            .kring((k) => k.automaat(20).leiding(2.5).contactdozen(3).als("laatste").lichtpunten(2).toestel("vaatwasser")),
        ),
      )
      .bouw();
    const dubbel = kloon(doc);
    Object.assign(dubbel.nodes[ids.laatste!]!, { aantal: 2 });
    expect(overzicht(dubbel)[0]!.differentielen[0]).toMatchObject({ kringen: 1, contactdozen: 3 });
  });

  test("meer dan 8 kringen achter een differentieel van hoogstens 30 mA is te veel", () => {
    const diff = (doc: InstallatieDocument) => overzicht(doc)[0]!.differentielen[1]!;
    expect(diff(achterDifferentieel(30, 8))).toMatchObject({ gevoeligheid_mA: 30, kringen: 8, teVeelKringen: false });
    expect(diff(achterDifferentieel(30, 9))).toMatchObject({ gevoeligheid_mA: 30, kringen: 9, contactdozen: 9, teVeelKringen: true });
    expect(diff(achterDifferentieel(10, 9))).toMatchObject({ teVeelKringen: true });
    // Een minder gevoelig differentieel valt buiten de grens.
    expect(diff(achterDifferentieel(100, 9))).toMatchObject({ kringen: 9, teVeelKringen: false });
  });

  test("het algemene differentieel is nooit te vol, ook niet bij 30 mA", () => {
    const doc = installatie()
      .differentieel(30, (d) => d.verdeelbord((b) => kringen(b, 9)))
      .bouw().doc;
    expect(overzicht(doc)[0]!.differentielen).toMatchObject([
      { gevoeligheid_mA: 30, algemeen: true, kringen: 9, teVeelKringen: false },
    ]);
  });

  test("een kring telt bij zijn dichtstbijzijnde differentieel; zonder differentieel alleen bij het bord", () => {
    const doc = installatie()
      .verdeelbord((b) =>
        b
          .kring((k) => k.automaat(16).leiding(1.5).lichtpunten(1))
          .differentieel(300, (d) =>
            d
              .kring((k) => k.automaat(20).leiding(2.5).contactdozen(2))
              .differentieel(30, (n) => kringen(n, 3)),
          )
          .differentieel(30, (n) => kringen(n, 1)),
      )
      .bouw().doc;
    const [bord] = overzicht(doc);
    expect(bord).toMatchObject({ kringen: 6, modules: 6 * 2 + 3 * 2 });
    expect(bord!.differentielen).toMatchObject([
      { gevoeligheid_mA: 300, algemeen: false, plaats: 1, kringen: 1, contactdozen: 2 },
      { gevoeligheid_mA: 30, plaats: 2, kringen: 3, contactdozen: 3 },
      { gevoeligheid_mA: 30, plaats: 3, kringen: 1, contactdozen: 1 },
    ]);
  });

  test("een beveiliging vóór het hoofdbord telt bij het eerste bord erachter", () => {
    const doc = installatie()
      .differentieel(300, (d) =>
        d
          .verdeelbord((b) => kringen(b, 1), "Woning")
          .verdeelbord((b) => kringen(b, 2), "Praktijk"),
      )
      .bouw().doc;
    const [woning, praktijk] = overzicht(doc);
    expect(woning).toMatchObject({ naam: "Woning", kringen: 1, modules: 4 });
    expect(praktijk).toMatchObject({ naam: "Praktijk", kringen: 2, modules: 4, differentielen: [] });
    // Het differentieel staat één keer in het overzicht, met de kringen van beide borden.
    expect(woning!.differentielen).toMatchObject([{ algemeen: true, kringen: 3 }]);
  });

  test("een naam van alleen witruimte telt als leeg", () => {
    const doc = installatie().verdeelbord((b) => kringen(b, 1), "   ").bouw().doc;
    expect(overzicht(doc)[0]).toMatchObject({ naam: "", volgnummer: 1 });
  });

  test("een document zonder verdeelbord geeft een lege lijst; de invoer blijft ongewijzigd", () => {
    const { doc } = installatie().bouw();
    expect(overzicht(doc)).toEqual([]);
    const appartement = referentieAppartement();
    const analyse = analyseer(appartement);
    const voor = JSON.stringify([appartement, analyse]);
    bordOverzicht(appartement, analyse);
    expect(JSON.stringify([appartement, analyse])).toBe(voor);
  });

  test("een structureel ongeldig document (lus) eindigt", () => {
    const doc = kloon(referentieAppartement());
    const analyse = analyseer(doc);
    const bord = Object.values(doc.nodes).find((n) => n.type === "verdeelbord")!;
    const automaat = Object.values(doc.nodes).find((n) => n.type === "automaat")!;
    automaat.kinderen.push(bord.id);
    bord.parentId = automaat.id;
    expect(() => bordOverzicht(doc, analyse)).not.toThrow();
  });
});
