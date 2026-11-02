import { expect, test } from "vitest";
import { kloon } from "./hulp";
import { InstallatieDocumentSchema, NodeSchema, nieuwProjectDocument, voegOnderdeelToe, pasPatchesToe, wijzigProject } from "../src/index";

test("vrije ruimtenaam behoudt de classificatie waarop veiligheidsregels steunen", () => {
  expect(NodeSchema.parse({ id: "p", parentId: "l", kinderen: [], type: "lichtpunt", aantal: 1,
    ruimte: "badkamer", ruimteNaam: "Badkamer verdieping" })).toMatchObject({ ruimte: "badkamer", ruimteNaam: "Badkamer verdieping" });
  expect(NodeSchema.safeParse({ id: "h", parentId: "l", kinderen: [], type: "lichtpunt", aantal: 1, ruimte: "hal" }).success).toBe(true);
});

test("een nieuw dossier veronderstelt geen nieuwe installatie; oude documenten blijven leesbaar", () => {
  const doc = nieuwProjectDocument({ klantNaam: "Test", stroomtype: "2x230V" });
  expect(doc.meta).toMatchObject({ installatieContext: "onbekend" });
  const oud = kloon(doc);
  delete (oud.meta as Record<string, unknown>).installatieContext;
  expect(InstallatieDocumentSchema.safeParse(oud).success).toBe(true);
});

test("installatiecontext wijzigen is gevalideerd en omkeerbaar", () => {
  const doc = nieuwProjectDocument({ klantNaam: "Test", stroomtype: "2x230V" });
  const r = wijzigProject(doc, { installatieContext: "bestaand" });
  expect(r.doc.meta.installatieContext).toBe("bestaand");
  expect(pasPatchesToe(r.doc, r.inversePatches)).toEqual(doc);
  expect(() => wijzigProject(doc, { installatieContext: "x" as "nieuw" })).toThrow();
});

test("een nieuwe kring bevat het gekozen eindpunt met voorinstelling en is in één stap ongedaan te maken", () => {
  const doc = nieuwProjectDocument({ klantNaam: "Test", stroomtype: "2x230V" });
  const bord = Object.values(doc.nodes).find(n => n.type === "verdeelbord")!;
  const r = voegOnderdeelToe(doc, { soort: "rail-einde", nodeId: bord.id }, "schakelaar", { soort: "wissel" });
  expect(r.ids.map(id => r.doc.nodes[id]!.type)).toEqual(["automaat", "leiding", "schakelaar"]);
  expect(r.doc.nodes[r.ids[2]!]).toMatchObject({ soort: "wissel" });
  expect(pasPatchesToe(r.doc, r.inversePatches)).toEqual(doc);
});
