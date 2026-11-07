import { expect, test } from "vitest";
import {
  nieuwProjectDocument,
  voegOnderdeelToe,
  wijzigEigenschappen,
  voegLichtschakelingToe,
} from "@elentrik/model";
import { analyseer } from "@elentrik/arei";
import { kringenlijst, TEKSTEN } from "../src/index";

test("source device variants and x cable notation reach all three dossier languages", () => {
  const start = nieuwProjectDocument({
    klantNaam: "Bron",
    stroomtype: "2x230V",
  });
  const bord = Object.values(start.nodes).find(
    (n) => n.type === "verdeelbord",
  )!.id;
  const k = voegOnderdeelToe(
    start,
    { soort: "rail-einde", nodeId: bord },
    "leiding",
  );
  let doc = wijzigEigenschappen(k.doc, k.ids[1]!, {
    aantalGeleiders: 4,
    doorsnede_mm2: 10,
    metBeschermingsgeleider: false,
  }).doc;
  const s = voegOnderdeelToe(
    doc,
    { soort: "kring-einde", nodeId: k.ids[1]! },
    "schakelaar",
    { soort: "tweepolig" },
  );
  const l = voegOnderdeelToe(
    s.doc,
    { soort: "kring-einde", nodeId: s.ids[0]! },
    "lichtpunt",
    { soort: "wand" },
  );
  const t = voegOnderdeelToe(
    l.doc,
    { soort: "kring-einde", nodeId: l.ids[0]! },
    "toestel",
    { soort: "deurbelMonitor" },
  );
  doc = t.doc;
  for (const taal of ["nl", "fr", "en"] as const) {
    const rows = kringenlijst(doc, analyseer(doc), TEKSTEN[taal]);
    expect(rows.map((r) => r.leiding)).toEqual([
      "XVB 4x10",
      "XVB 4x10",
      "XVB 4x10",
    ]);
    expect(rows.find((r) => r.nodeId === s.ids[0])!.type).toContain(
      TEKSTEN[taal].schakelaarsoorten.tweepolig,
    );
    expect(rows.find((r) => r.nodeId === l.ids[0])!.type).toContain(
      TEKSTEN[taal].lichtpuntsoorten.wand,
    );
    expect(rows.find((r) => r.nodeId === t.ids[0])!.type).toContain(
      TEKSTEN[taal].toestelsoorten.deurbelMonitor,
    );
    expect(TEKSTEN[taal].schakelaarsoorten.tweepolig).not.toBe(
      TEKSTEN[taal].schakelaarsoorten.dubbel,
    );
  }
  const assembly = voegLichtschakelingToe(
    k.doc,
    { soort: "bestaande-kring", nodeId: k.ids[0]! },
    { schakeling: "wissel", aantal: 2, lichtsoort: "wand" },
  );
  expect(
    Object.values(assembly.doc.nodes).filter(
      (n) => n.type === "lichtpunt" && n.soort === "wand",
    ),
  ).toHaveLength(2);
});
