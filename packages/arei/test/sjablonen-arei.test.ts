import { describe, expect, test } from "vitest";
import {
  SJABLONEN,
  nieuwProjectDocument,
  valideerStructuur,
  voegSjabloonToe,
  type Stroomtype,
} from "@elentrik/model";
import { controleer, haalRegelset } from "../src/index";

const regelset = haalRegelset("arei-2020@1");

function bord(stroomtype: Stroomtype) {
  const doc = nieuwProjectDocument({ klantNaam: "Test", stroomtype, datum: "2026-10-18" });
  const teller = doc.nodes[doc.rootId]!.kinderen[0]!;
  const differentieel = doc.nodes[teller]!.kinderen[0]!;
  return { doc, bordId: doc.nodes[differentieel]!.kinderen[0]! };
}

describe("sjablonen volgens arei-2020@1", () => {
  const STROOMTYPES: Stroomtype[] = ["2x230V", "3x230V", "3N400V"];
  const gevallen = STROOMTYPES.flatMap((stroomtype) =>
    SJABLONEN.map((s) => ({ id: s.id, stroomtype })),
  );

  test.each(STROOMTYPES)("een nieuw project (%s): geen fouten of waarschuwingen", (stroomtype) => {
    const { doc } = bord(stroomtype);
    const ernstig = controleer(doc, regelset).filter(
      (b) => b.ernst === "fout" || b.ernst === "waarschuwing",
    );
    expect(ernstig).toEqual([]);
  });

  test.each(gevallen)("$id ($stroomtype): geen fouten of waarschuwingen", ({ id, stroomtype }) => {
    const { doc, bordId } = bord(stroomtype);
    const r = voegSjabloonToe(doc, bordId, id);
    expect(valideerStructuur(r.doc)).toEqual([]);
    const ernstig = controleer(r.doc, regelset).filter(
      (b) => b.ernst === "fout" || b.ernst === "waarschuwing",
    );
    expect(ernstig).toEqual([]);
  });

  test("alle sjablonen samen op één bord", () => {
    const { doc, bordId } = bord("2x230V");
    let huidig = doc;
    for (const sjabloon of SJABLONEN) huidig = voegSjabloonToe(huidig, bordId, sjabloon.id).doc;
    const ernstig = controleer(huidig, regelset).filter(
      (b) => b.ernst === "fout" || b.ernst === "waarschuwing",
    );
    expect(ernstig).toEqual([]);
  });
});
