import { describe, expect, test } from "vitest";
import { voegToe } from "@elentrik/model";
import { installatie } from "../../src/testing/index";
import { maakRegelAardingNietGetekend } from "../../src/regelsets/arei-2020/regels/aarding-niet-getekend";
import { draaiRegel, tellerVan } from "../hulp";

const ID = "arei.aarding.niet-getekend";

const woning = () =>
  installatie()
    .differentieel(300, (d) =>
      d.verdeelbord((b) =>
        b
          .als("bord")
          .kring((k) => k.automaat(20).leiding(2.5).contactdozen(6))
          .kring((k) => k.automaat(16).leiding(1.5).lichtpunten(4)),
      ),
    )
    .bouw();

describe("aarding.niet-getekend", () => {
  const regel = maakRegelAardingNietGetekend();

  test("is een voorlopige info-regel zonder artikel", () => {
    expect(regel.id).toBe(ID);
    expect(regel.nagekeken).toBe(false);
    expect(regel.artikel).toBe("");
    expect(regel.ernst).toBe("info");
  });

  test("zonder kringen geeft de regel niets", () => {
    const { doc } = installatie()
      .differentieel(300, (d) => d.verdeelbord(() => {}))
      .bouw();
    expect(draaiRegel(regel, doc)).toEqual([]);
  });

  test("kringen zonder aarding: één melding voor de hele installatie, op de teller", () => {
    const { doc } = woning();
    expect(draaiRegel(regel, doc)).toEqual([
      {
        regelId: ID,
        ernst: "info",
        nodeIds: [tellerVan(doc)],
        berichtSleutel: `${ID}.beide`,
        parameters: {},
        afgeweken: false,
      },
    ]);
  });

  test("met aardingsonderbreker en aardelektrode geeft de regel niets", () => {
    const { doc, ids } = woning();
    const onderbreker = voegToe(doc, ids["bord"]!, { type: "aardingsonderbreker" });
    const elektrode = voegToe(onderbreker.doc, onderbreker.id, { type: "aardelektrode" });
    expect(draaiRegel(regel, elektrode.doc)).toEqual([]);
  });

  test("alleen een aardelektrode: de aardingsonderbreker ontbreekt", () => {
    const { doc, ids } = woning();
    const elektrode = voegToe(doc, ids["bord"]!, { type: "aardelektrode" });
    expect(draaiRegel(regel, elektrode.doc)).toMatchObject([
      { nodeIds: [tellerVan(doc)], berichtSleutel: `${ID}.aardingsonderbreker` },
    ]);
  });

  test("alleen een aardingsonderbreker: de aardelektrode ontbreekt", () => {
    const { doc, ids } = woning();
    const onderbreker = voegToe(doc, ids["bord"]!, { type: "aardingsonderbreker" });
    expect(draaiRegel(regel, onderbreker.doc)).toMatchObject([
      { nodeIds: [tellerVan(doc)], berichtSleutel: `${ID}.aardelektrode` },
    ]);
  });
});
