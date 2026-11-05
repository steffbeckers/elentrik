import { expect, test } from "vitest";
import {
  nieuwProjectDocument,
  voegToe,
  STANDAARD,
  voegOnderdeelToe,
  voegLichtschakelingToe,
} from "@elentrik/model";
import {
  invoegBestemmingen,
  doelBijSelectie,
  nieuwePuntcode,
  lichtDoelBijSelectie,
} from "../app/editor/invoegen";
test("destination menu excludes the main differential and never guesses from invalid selection", () => {
  const doc = nieuwProjectDocument({ klantNaam: "T", stroomtype: "2x230V" }),
    bord = Object.values(doc.nodes).find((n) => n.type === "verdeelbord")!,
    hoofd = Object.values(doc.nodes).find((n) => n.type === "differentieel")!;
  const r = voegToe(doc, bord.id, STANDAARD.differentieel);
  const doelen = invoegBestemmingen(r.doc);
  expect(doelen.map((d) => d.nodeId)).toEqual([bord.id, r.id]);
  expect(doelBijSelectie(doelen, [hoofd.id])).toBeUndefined();
  expect(doelBijSelectie(doelen, [bord.id])).toEqual({
    soort: "nieuw-op-bord",
    nodeId: bord.id,
  });
});
test("preview takes the newly inserted point even when another circuit follows its differential", () => {
  let doc = nieuwProjectDocument({ klantNaam: "T", stroomtype: "2x230V" });
  const bord = Object.values(doc.nodes).find(
    (n) => n.type === "verdeelbord",
  )!.id;
  const f = voegToe(doc, bord, STANDAARD.differentieel);
  const a = voegOnderdeelToe(
    f.doc,
    { soort: "rail-einde", nodeId: f.id },
    "contactdoos",
  );
  const b = voegOnderdeelToe(
    a.doc,
    { soort: "rail-einde", nodeId: bord },
    "contactdoos",
  );
  const r = voegLichtschakelingToe(
    b.doc,
    { soort: "bestaande-differentieel", nodeId: f.id },
    { schakeling: "enkel", aantal: 1 },
  );
  expect(nieuwePuntcode(b.doc, r.doc)).toBe("B1");
});
test("a subboard selection offers a new circuit rather than extending its feeder", () => {
  const doc = nieuwProjectDocument({ klantNaam: "T", stroomtype: "2x230V" });
  const bord = Object.values(doc.nodes).find((n) => n.type === "verdeelbord")!;
  const sub = voegOnderdeelToe(
    doc,
    { soort: "rail-einde", nodeId: bord.id },
    "onderbord",
  );
  expect(lichtDoelBijSelectie(sub.doc, [sub.ids.at(-1)!])).toEqual({
    soort: "nieuw-op-bord",
    nodeId: sub.ids.at(-1)!,
  });
});
