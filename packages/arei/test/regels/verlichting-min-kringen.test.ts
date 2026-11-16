import { describe, expect, test } from "vitest";
import { installatie } from "../../src/testing/index";
import { PARAMETERS_AREI_2020_V1 } from "../../src/regelsets/arei-2020/parameters";
import { maakRegelVerlichtingMinKringen } from "../../src/regelsets/arei-2020/regels/verlichting-min-kringen";
import { draaiRegel } from "../hulp";

const ID = "arei.verlichting.min-kringen";

describe("verlichting.min-kringen", () => {
  const regel = maakRegelVerlichtingMinKringen(PARAMETERS_AREI_2020_V1);

  test("is een voorlopige waarschuwing zonder artikel", () => {
    expect(regel.id).toBe(ID);
    expect(regel.nagekeken).toBe(false);
    expect(regel.artikel).toBe("");
    expect(regel.ernst).toBe("waarschuwing");
  });

  test("zonder lichtpunten geeft de regel niets", () => {
    const { doc } = installatie()
      .verdeelbord((b) => b.kring((k) => k.automaat(20).leiding(2.5).contactdozen(4)))
      .bouw();
    expect(draaiRegel(regel, doc)).toEqual([]);
  });

  test("alle lichtpunten op één kring geven een waarschuwing op die kring", () => {
    const { doc, ids } = installatie()
      .verdeelbord((b) =>
        b
          .kring((k) => k.automaat(20).leiding(2.5).contactdozen(4))
          .kring((k) => k.automaat(16).als("licht").leiding(1.5).schakelaar().lichtpunten(6)),
      )
      .bouw();
    expect(draaiRegel(regel, doc)).toEqual([
      {
        regelId: ID,
        ernst: "waarschuwing",
        nodeIds: [ids["licht"]],
        berichtSleutel: `${ID}.een-kring`,
        parameters: { kring: "B", min: 2 },
        afgeweken: false,
      },
    ]);
  });

  test("lichtpunten op twee kringen geven niets", () => {
    const { doc } = installatie()
      .verdeelbord((b) =>
        b
          .kring((k) => k.automaat(16).leiding(1.5).lichtpunten(3))
          .kring((k) => k.automaat(16).leiding(1.5).lichtpunten(3)),
      )
      .bouw();
    expect(draaiRegel(regel, doc)).toEqual([]);
  });

  test("een gemengde kring met een lichtpunt telt als kring met verlichting", () => {
    const { doc } = installatie()
      .verdeelbord((b) =>
        b
          .kring((k) => k.automaat(16).leiding(1.5).lichtpunten(3))
          .kring((k) => k.automaat(20).leiding(2.5).contactdozen(2).lichtpunten(1)),
      )
      .bouw();
    expect(draaiRegel(regel, doc)).toEqual([]);
  });
});
