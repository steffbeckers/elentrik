import { describe, expect, test } from "vitest";
import {
  MAX_KRINGEN_PER_DIFFERENTIEEL,
  SJABLONEN,
  isKringSjabloon,
  nieuwProjectDocument,
  sjabloonDifferentieel,
  sjabloonVoor,
  startWoning,
  valideerStructuur,
  voegBordSjabloonToe,
  voegSjabloonToe,
  wijzigProject,
  type InstallatieDocument,
  type NodeId,
  type Stroomtype,
} from "@elentrik/model";
import { analyseer, controleer, haalRegelset } from "../src/index";

const regelset = haalRegelset("arei-2020@1");

/**
 * Regels over de hele installatie: één sjabloon op een leeg bord is geen installatie, dus daar
 * zeggen ze niets over het sjabloon. Een kring verlichting alleen heeft per definitie al zijn
 * lichtpunten op één kring. De startwoning en "alle sjablonen samen" tellen ze wel mee.
 */
const INSTALLATIEBREED: ReadonlySet<string> = new Set(["arei.verlichting.min-kringen"]);

function bord(stroomtype: Stroomtype) {
  const doc = nieuwProjectDocument({ klantNaam: "Test", stroomtype, datum: "2026-10-18" });
  const teller = doc.nodes[doc.rootId]!.kinderen[0]!;
  const differentieel = doc.nodes[teller]!.kinderen[0]!;
  return { doc, bordId: doc.nodes[differentieel]!.kinderen[0]! };
}

/**
 * Zoals de editor een sjabloon invoegt: een kring op het bord achter een nieuw differentieel met de
 * instellingen van het sjabloon (de laadpaal houdt zo zijn klasse B), de aarding rechtstreeks op het bord.
 */
function metSjabloon(doc: InstallatieDocument, bordId: NodeId, id: string): InstallatieDocument {
  const sjabloon = sjabloonVoor(id, doc.voeding.stroomtype);
  if (!isKringSjabloon(sjabloon)) return voegBordSjabloonToe(doc, bordId, id).doc;
  return voegSjabloonToe(doc, { soort: "nieuw-op-bord", nodeId: bordId }, id, sjabloonDifferentieel(sjabloon)).doc;
}

function ernstig(doc: InstallatieDocument) {
  return controleer(doc, regelset).filter((b) => b.ernst === "fout" || b.ernst === "waarschuwing");
}

const STROOMTYPES: Stroomtype[] = ["2x230V", "3x230V", "3N400V"];

describe("sjablonen volgens arei-2020@1", () => {
  const gevallen = STROOMTYPES.flatMap((stroomtype) =>
    SJABLONEN.map((s) => ({ id: s.id, stroomtype })),
  );

  test.each(STROOMTYPES)("een nieuw project (%s): geen fouten of waarschuwingen", (stroomtype) => {
    const { doc } = bord(stroomtype);
    expect(ernstig(doc)).toEqual([]);
  });

  test.each(gevallen)("$id ($stroomtype): geen fouten of waarschuwingen", ({ id, stroomtype }) => {
    const { doc, bordId } = bord(stroomtype);
    const na = metSjabloon(doc, bordId, id);
    expect(valideerStructuur(na)).toEqual([]);
    expect(ernstig(na).filter((b) => !INSTALLATIEBREED.has(b.regelId))).toEqual([]);
  });

  test.each(gevallen)("$id ($stroomtype) in een nieuwe installatie: geen fouten", ({ id, stroomtype }) => {
    const { doc, bordId } = bord(stroomtype);
    const nieuw = wijzigProject(metSjabloon(doc, bordId, id), { installatieContext: "nieuw" }).doc;
    expect(controleer(nieuw, regelset).filter((b) => b.ernst === "fout")).toEqual([]);
  });

  test.each(STROOMTYPES)("alle sjablonen samen op één bord (%s)", (stroomtype) => {
    const { doc, bordId } = bord(stroomtype);
    let huidig = doc;
    for (const sjabloon of SJABLONEN) huidig = metSjabloon(huidig, bordId, sjabloon.id);
    expect(valideerStructuur(huidig)).toEqual([]);
    expect(ernstig(huidig)).toEqual([]);
  });
});

describe("startwoning volgens arei-2020@1", () => {
  function woning(stroomtype: Stroomtype, context: "nieuw" | "bestaand" | "onbekend"): InstallatieDocument {
    const r = startWoning(bord(stroomtype).doc);
    return wijzigProject(r.doc, { installatieContext: context }).doc;
  }

  test.each(STROOMTYPES)("een nieuwe installatie (%s): geen fouten en geen waarschuwingen", (stroomtype) => {
    const doc = woning(stroomtype, "nieuw");
    expect(valideerStructuur(doc)).toEqual([]);
    expect(controleer(doc, regelset).filter((b) => b.ernst === "fout")).toEqual([]);
    expect(ernstig(doc)).toEqual([]);
  });

  test.each(["bestaand", "onbekend"] as const)("context %s: geen fouten of waarschuwingen", (context) => {
    expect(ernstig(woning("2x230V", context))).toEqual([]);
  });

  test("hoogstens acht kringen achter elk differentieel van 30 mA", () => {
    const doc = woning("2x230V", "nieuw");
    const analyse = analyseer(doc);
    const perDifferentieel = new Map<NodeId, number>();
    for (const kring of analyse.kringen) {
      // Het dichtstbijzijnde differentieel boven de kringbeveiliging.
      let id = doc.nodes[kring.beveiligingId]!.parentId;
      while (id !== null && doc.nodes[id]!.type !== "differentieel") id = doc.nodes[id]!.parentId;
      if (id !== null && id !== analyse.algemeenDifferentieelId) perDifferentieel.set(id, (perDifferentieel.get(id) ?? 0) + 1);
    }
    expect([...perDifferentieel.values()]).toEqual([5, 4]);
    expect(Math.max(...perDifferentieel.values())).toBeLessThanOrEqual(MAX_KRINGEN_PER_DIFFERENTIEEL);
    expect(analyse.kringen).toHaveLength(11);
  });
});
