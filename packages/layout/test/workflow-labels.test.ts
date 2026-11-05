import { nieuwDocument, voegToe } from "@elentrik/model";
import { maakStrook } from "../src/kolommen";
import { expect, test } from "vitest";
import { leidingLabel, beveiligingLabel } from "../src/labels";
test("prints supplied fire class exactly once", () =>
  expect(
    leidingLabel({
      id: "l",
      parentId: null,
      kinderen: [],
      type: "leiding",
      kabeltype: "XVB",
      doorsnede_mm2: 2.5,
      aantalGeleiders: 3,
      brandreactieklasse: "Cca",
    }),
  ).toBe("XVB 3G2,5 Cca"));
test("differential reference remains distinct from description", () =>
  expect(
    beveiligingLabel({
      id: "f",
      parentId: null,
      kinderen: [],
      type: "differentieel",
      nominaal_A: 40,
      gevoeligheid_mA: 30,
      polen: 2,
      klasse: "A",
      referentie: "F",
      label: "Wasmachine",
    }),
  ).toBe("F · 40/0,03A type A 2P"));
test("installation markings leave room before the cable label", () => {
  const d = nieuwDocument();
  const teller = d.nodes[d.rootId]!.kinderen[0]!;
  const r = voegToe(d, teller, {
    type: "leiding",
    kabeltype: "VOB",
    doorsnede_mm2: 1.5,
    aantalGeleiders: 3,
    aanleg: { ligging: "inbouw", inBuis: true },
  });
  const strook = maakStrook(r.doc);
  const s = strook.elementen.find(
    (e) => e.soort === "symbool" && e.nodeId === r.id,
  )!;
  const l = strook.elementen.find(
    (e) => e.soort === "tekst" && e.rol === "leiding",
  )!;
  if (s.soort !== "symbool" || l.soort !== "tekst")
    throw new Error("missing layout items");
  expect(l.x).toBeGreaterThanOrEqual(s.x + s.symbool.maat.breedte + 1);
});
test("a legacy cable description containing the same fire class is not printed twice", () =>
  expect(
    leidingLabel({
      id: "l",
      parentId: null,
      kinderen: [],
      type: "leiding",
      kabeltype: "XVB Cca",
      doorsnede_mm2: 2.5,
      aantalGeleiders: 3,
      brandreactieklasse: "Cca",
    }),
  ).toBe("XVB Cca 3G2,5"));
