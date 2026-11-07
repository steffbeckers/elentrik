import { expect, test } from "vitest";
import {
  NodeSchema,
  nieuwProjectDocument,
  voegOnderdeelToe,
  wijzigEigenschappen,
  migreer,
  materiaallijst,
} from "../src/index";

const basis = { id: "bron", parentId: null, kinderen: [] };
test.each([
  { ...basis, type: "lichtpunt", aantal: 1, soort: "wand" },
  { ...basis, type: "schakelaar", waterdicht: false, soort: "tweepolig" },
  { ...basis, type: "toestel", soort: "deurbelMonitor" },
  {
    ...basis,
    type: "leiding",
    kabeltype: "XVB",
    doorsnede_mm2: 10,
    aantalGeleiders: 4,
    metBeschermingsgeleider: false,
  },
])(
  "source primitive $type/$soort is representable without changing schema version",
  (node) => {
    expect(NodeSchema.safeParse(node).success).toBe(true);
  },
);
test("legacy and explicit G group together while cable without PE stays distinct", () => {
  const start = nieuwProjectDocument({
    klantNaam: "Bron",
    stroomtype: "2x230V",
  });
  const bord = Object.values(start.nodes).find(
    (n) => n.type === "verdeelbord",
  )!.id;
  let doc = start;
  for (const flag of [undefined, true, false]) {
    const r = voegOnderdeelToe(
      doc,
      { soort: "rail-einde", nodeId: bord },
      "leiding",
    );
    doc = wijzigEigenschappen(r.doc, r.ids[1]!, {
      lengte_m: 5,
      ...(flag === undefined ? {} : { metBeschermingsgeleider: flag }),
    }).doc;
  }
  const loaded = migreer(JSON.parse(JSON.stringify(doc)));
  const wires = Object.values(loaded.nodes).filter((n) => n.type === "leiding");
  expect(wires[0]).not.toHaveProperty("metBeschermingsgeleider");
  const rows = materiaallijst(loaded).filter((r) => r.type === "leiding");
  expect(rows).toHaveLength(2);
  expect(rows.map((r) => r.hoeveelheid)).toEqual([5, 10]);
});
