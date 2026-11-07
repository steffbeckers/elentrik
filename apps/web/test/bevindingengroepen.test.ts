import { expect, test } from "vitest";
import { analyseer, type Analyse, type Bevinding } from "@elentrik/arei";
import { nieuwProjectDocument, voegOnderdeelToe, voegSjabloonToe } from "@elentrik/model";
import { groepeerBevindingen, herstelDoel, bevindingVoorNode } from "../app/editor/bevindingengroepen";

const basis: Bevinding = { regelId: "arei.differentieel.aanvullend", berichtSleutel: "ontbreekt", ernst: "fout", nodeIds: ["a1"], parameters: {}, afgeweken: false };
const analyse: Analyse = { kringen: [], kringVanNode: { a1: "kringA", a2: "kringA", b1: "kringB" }, puntLabels: {}, ketens: {}, zonderKring: [], tellerId: null, algemeenDifferentieelId: null, nietGeplaatst: [] };

test("een gegroepeerde diagnose blijft gekoppeld aan het aangeklikte tweede punt", () => {
  const tweede = { ...basis, nodeIds: ["a2"] };
  const groep = groepeerBevindingen([basis, tweede], analyse)[0]!;
  expect(bevindingVoorNode(groep, "a2")).toBe(tweede);
  expect(bevindingVoorNode(groep, "a1")).toBe(basis);
});

test("herhaalde oorzaak in dezelfde kring wordt één groep met alle originele bevindingen", () => {
  const tweede = { ...basis, nodeIds: ["a2"] };
  const groepen = groepeerBevindingen([basis, tweede], analyse);
  expect(groepen).toHaveLength(1);
  expect(groepen[0]!.bevindingen).toEqual([basis, tweede]);
  expect(groepen[0]!.kringId).toBe("kringA");
});

test.each([
  { nodeIds: ["b1"] }, { ernst: "waarschuwing" as const }, { afgeweken: true },
  { parameters: { max: 30 } }, { berichtSleutel: "context" }, { regelId: "andere-regel" },
])("andere kring, ernst, afwijking, parameters of regel blijft apart: %j", wijziging => {
  expect(groepeerBevindingen([basis, { ...basis, ...wijziging }], analyse)).toHaveLength(2);
});

test("parameter-volgorde verandert de groep niet; nummers en teksten blijven onderscheiden", () => {
  const eerste = { ...basis, parameters: { max: 30, reden: "badkamer" } };
  const tweede = { ...basis, parameters: { reden: "badkamer", max: 30 } };
  expect(groepeerBevindingen([eerste, tweede], analyse)).toHaveLength(1);
  expect(groepeerBevindingen([eerste, { ...eerste, parameters: { max: "30", reden: "badkamer" } }], analyse)).toHaveLength(2);
});

test("zonder kring worden ongerelateerde onderwerpen niet tot één reparatiegroep samengevoegd", () => {
  expect(groepeerBevindingen([{ ...basis, nodeIds: ["los1"] }, { ...basis, nodeIds: ["los2"] }], analyse)).toHaveLength(2);
});

test("een bevinding over meerdere kringen krijgt geen enkelvoudige kringgroep", () => {
  const groepen = groepeerBevindingen([basis, { ...basis, nodeIds: ["a1", "b1"] }], analyse);
  expect(groepen).toHaveLength(2);
  expect(groepen[1]!.kringId).toBeNull();
});

function installatie(sjabloon = false) {
  const leeg = nieuwProjectDocument({ klantNaam: "Test", stroomtype: "2x230V" });
  const bord = Object.values(leeg.nodes).find(n => n.type === "verdeelbord")!;
  const doc = sjabloon ? voegSjabloonToe(leeg, {soort:"nieuw-op-bord",nodeId:bord.id}, "kring-stopcontacten").doc
    : voegOnderdeelToe(leeg, { soort: "rail-einde", nodeId: bord.id }, "contactdoos").doc;
  const a = analyseer(doc);
  const puntId = Object.keys(a.puntLabels)[0]!;
  return { doc, a, b: { ...basis, nodeIds: [puntId] } };
}

test("ontbrekende aanvullende differentieel navigeert naar de kring en niet naar de algemene differentieel", () => {
  const { doc, a, b } = installatie();
  expect(herstelDoel(b, a, doc)).toEqual({ nodeId: a.kringen[0]!.beveiligingId, soort: "kring" });
});

test("aanwezige aanvullende differentieel is een specifiek beveiligingsdoel", () => {
  const { doc, a, b } = installatie(true);
  const aanvullend = a.ketens[b.nodeIds[0]!]!.differentielen.find(id => id !== a.algemeenDifferentieelId)!;
  expect(herstelDoel(b, a, doc)).toEqual({ nodeId: aanvullend, soort: "beveiliging" });
});

test("een niet-geplaatst punt krijgt geen misleidende beveiligingsactie", () => {
  const { doc, a, b } = installatie();
  expect(herstelDoel({ ...b, regelId: "arei.situatie.niet-geplaatst" }, a, doc)).toBeNull();
});

test("bij meerdere nodeIds blijft het eerste onderwerp leidend, niet een toevallige beveiliging in de context", () => {
  const { doc, a, b } = installatie();
  const kringId = a.kringen[0]!.beveiligingId;
  expect(herstelDoel({ ...b, regelId: "arei.situatie.niet-geplaatst", nodeIds: [b.nodeIds[0]!, kringId] }, a, doc)).toBeNull();
  expect(herstelDoel({ ...b, nodeIds: [b.nodeIds[0]!, a.algemeenDifferentieelId!] }, a, doc)).toEqual({ nodeId: kringId, soort: "kring" });
});

test("een bevinding op een automaat navigeert naar die beveiliging; ontbrekende nodes blijven veilig", () => {
  const { doc, a, b } = installatie();
  const id = a.kringen[0]!.beveiligingId;
  expect(herstelDoel({ ...b, regelId: "arei.kring.doorsnede-beveiliging", nodeIds: [id] }, a, doc)).toEqual({ nodeId: id, soort: "beveiliging" });
  expect(herstelDoel({ ...b, nodeIds: ["weg"] }, a, doc)).toBeNull();
});
