import { nieuwDocument, voegToe, type NodeInvoer } from "@elentrik/model";

/** Synthetic structure from the ACA inventory, not the saved UI reconstruction or a compliance fixture. */
export function compactSchemaFixture() {
  let doc = nieuwDocument({ stroomtype: "3N400V" });
  const add = (parent: string, node: NodeInvoer) => {
    const r = voegToe(doc, parent, node);
    doc = r.doc;
    return r.id;
  };
  const diff = (parent: string, referentie: string, gevoeligheid_mA = 30) => add(parent, {
    type: "differentieel", ...(referentie ? { referentie } : {}), gevoeligheid_mA, nominaal_A: gevoeligheid_mA === 300 ? 40 : 63,
    polen: gevoeligheid_mA === 300 ? 4 : 2, klasse: "A",
  });
  const leiding = (parent: string, kabeltype = "XVB", doorsnede_mm2 = 2.5, aantalGeleiders = 3) => add(parent, {
    type: "leiding", kabeltype, doorsnede_mm2, aantalGeleiders, brandreactieklasse: kabeltype === "VOB" ? "Eca" : "Cca",
  });
  const kring = (parent: string, kringCode: string, nominaal_A = 20, kabeltype = "XVB", doorsnede = 2.5) =>
    leiding(add(parent, { type: "automaat", kringCode, nominaal_A, curve: "C", polen: 2, kortsluitvermogen_kA: 3 }), kabeltype, doorsnede);
  const contacts = (parent: string, aantallen: number[]) => {
    for (const aantal of aantallen) parent = add(parent, { type: "contactdoos", aantal, randaarde: true, kinderbeveiliging: true, waterdicht: false });
  };
  const lights = (parent: string, rows: [number, number][]) => {
    for (const [schakelaars, lampen] of rows) {
      let last = parent;
      for (let i = 0; i < schakelaars; i++) last = add(last, { type: "schakelaar", soort: schakelaars === 2 ? "wissel" : "enkel", waterdicht: false, aftakking: true });
      for (let i = 0; i < lampen; i++) last = add(last, { type: "lichtpunt", aantal: 1, soort: "wand", aftakking: true });
    }
  };
  const teller = doc.nodes[doc.rootId]!.kinderen[0]!;
  const hoofdleiding = leiding(teller, "XVB", 10, 4);
  const a = diff(hoofdleiding, "A", 300);
  const bord = add(a, { type: "verdeelbord", naam: "Hoofdbord" });
  const b = add(bord, { type: "automaat", kringCode: "B", nominaal_A: 32, curve: "C", polen: 4, kortsluitvermogen_kA: 3 });
  add(leiding(diff(b, ""), "XGB", 10, 5), { type: "toestel", soort: "laadpaal" });
  add(kring(bord, "C"), { type: "toestel", soort: "oven" });
  add(kring(bord, "D", 25, "XGB", 4), { type: "toestel", soort: "kookplaat" });
  add(kring(bord, "E", 10, "VOB", 1.5), { type: "toestel", soort: "deurbelMonitor" });
  const f = diff(bord, "F");
  lights(kring(f, "G", 16, "VOB", 1.5), [[1, 1], [2, 2], [2, 1], [2, 2], [1, 1], [2, 2], [1, 2]]);
  contacts(kring(f, "H"), [2, 1, 1]);
  contacts(kring(f, "I"), [1, 2, 1]);
  contacts(kring(f, "J"), [1, 1, 1, 1, 1, 1, 1]);
  contacts(kring(f, "K"), [2, 2, 2]);
  const l = diff(bord, "L");
  lights(kring(l, "M", 16, "VOB", 1.5), [[2, 1], [1, 2]]);
  lights(kring(l, "N", 20, "VOB"), [[1, 3]]);
  contacts(kring(l, "O"), [1, 1, 2]);
  add(kring(l, "P"), { type: "toestel", soort: "wasmachine" });
  add(kring(l, "Q"), { type: "toestel", soort: "vaatwasser" });
  contacts(kring(l, "R", 16), [1, 1]);
  const inverter = add(kring(bord, "S", 25, "XGB", 4), { type: "toestel", soort: "omvormer" });
  add(leiding(inverter, "Solar DC", 6, 2), { type: "toestel", soort: "pvPaneel" });
  return doc;
}
