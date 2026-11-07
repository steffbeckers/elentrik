import { bepaalKringCodes, nieuwProjectDocument, voegSjabloonToe, type NodeId } from "@elentrik/model";
import { createPinia, setActivePinia } from "pinia";
import { beforeEach, expect, test } from "vitest";
import { useEditorStore } from "../app/stores/editor";

beforeEach(() => {
  setActivePinia(createPinia());
});

test("invoegen vóór bestaande kringen verschuift geen code en is één undo-stap", () => {
  const store = useEditorStore();
  store.laad({
    id: "p1",
    naam: "Woning",
    versie: 1,
    document: nieuwProjectDocument({ klantNaam: "Janssens", stroomtype: "2x230V", datum: "2026-10-18" }),
  });
  const bord = Object.values(store.document!.nodes).find((n) => n.type === "verdeelbord")!.id;
  store.onderdeel = "differentieel";
  store.voegToe({ soort: "rail-einde", nodeId: bord });
  const differentieel = store.selectie[0]!;
  store.onderdeel = "contactdoos";
  store.voegToe({ soort: "rail-einde", nodeId: bord });
  const eersteKring = Object.values(store.document!.nodes).find((n) => n.type === "automaat")!.id as NodeId;
  expect(bepaalKringCodes(store.document!)[eersteKring]).toBe("A");
  const stappenVoor = store.terug.length;

  const zonderBehoud = bepaalKringCodes(
    voegSjabloonToe(store.document!, { soort: "bestaande-differentieel", nodeId: differentieel }, "badkamer").doc,
  );
  expect(zonderBehoud[eersteKring]).not.toBe("A");
  store.voegSjabloonToe("badkamer", { soort: "bestaande-differentieel", nodeId: differentieel });
  expect(bepaalKringCodes(store.document!)[eersteKring]).toBe("A");
  expect(store.terug.length).toBe(stappenVoor + 1);

  store.ongedaanMaken();
  expect(store.terug.length).toBe(stappenVoor);
  expect(store.document!.nodes[eersteKring]).toMatchObject({ type: "automaat" });
  expect((store.document!.nodes[eersteKring] as { kringCode?: string }).kringCode).toBeUndefined();
});
