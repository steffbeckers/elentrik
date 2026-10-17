import {
  referentieAppartement,
  referentieRijwoning,
  referentieWoning,
} from "@elentrik/arei/testing";
import { opmaak } from "@elentrik/layout";
import { valideerStructuur, type InstallatieDocument } from "@elentrik/model";
import { XMLValidator } from "fast-xml-parser";
import { describe, expect, test } from "vitest";
import { schemaPaginaSvg, schemaStripSvg } from "../src/index";
import { nummerNodeIds } from "./hulp";

const referenties: ReadonlyArray<readonly [string, () => InstallatieDocument]> = [
  ["appartement", referentieAppartement],
  ["rijwoning", referentieRijwoning],
  ["woning", referentieWoning],
];

describe.each(referenties)("referentie %s", (_naam, bouw) => {
  test("het document is structureel geldig", () => {
    expect(valideerStructuur(bouw())).toEqual([]);
  });

  test("snapshot van pagina 1", () => {
    expect(nummerNodeIds(schemaPaginaSvg(opmaak(bouw()), 0))).toMatchSnapshot();
  });

  test("elke pagina en de strook zijn goedgevormde XML", () => {
    const o = opmaak(bouw());
    expect(o.paginas.length).toBeGreaterThan(0);
    for (const pagina of o.paginas) {
      expect(XMLValidator.validate(schemaPaginaSvg(o, pagina.index))).toBe(true);
    }
    expect(XMLValidator.validate(schemaStripSvg(o))).toBe(true);
  });
});
