import { bepaalKringCodes, nieuwProjectDocument, voegOnderdeelToe, DocumentFout } from "@elentrik/model";
import { analyseer } from "@elentrik/arei";
import { describe, expect, test } from "vitest";
import { dupliceerMetVrijeCode } from "../app/editor/dupliceren";

function tweeKringen() {
  const doc0 = nieuwProjectDocument({ klantNaam: "T", stroomtype: "2x230V" });
  const bord = Object.values(doc0.nodes).find((n) => n.type === "verdeelbord")!.id;
  const a = voegOnderdeelToe(doc0, { soort: "rail-einde", nodeId: bord }, "contactdoos");
  const b = voegOnderdeelToe(a.doc, { soort: "rail-einde", nodeId: bord }, "lichtpunt");
  const kringen = analyseer(b.doc).kringen;
  return { doc: b.doc, kringA: kringen[0]!.id, kringB: kringen[1]!.id };
}

describe("dupliceerMetVrijeCode", () => {
  test("de kopie krijgt de eerste vrije letter en de bestaande letters blijven", () => {
    const { doc, kringA, kringB } = tweeKringen();
    const { resultaat, code } = dupliceerMetVrijeCode(doc, kringA);
    expect(code).toBe("C");
    const codes = bepaalKringCodes(resultaat.doc);
    expect(codes[resultaat.id]).toBe("C");
    expect(codes[kringA]).toBe("A");
    expect(codes[kringB]).toBe("B");
  });

  test("geen kring: een DocumentFout", () => {
    const { doc } = tweeKringen();
    expect(() => dupliceerMetVrijeCode(doc, doc.rootId)).toThrow(DocumentFout);
  });
});
