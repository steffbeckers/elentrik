import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import {
  nieuwProjectDocument,
  voegToe,
  SJABLONEN,
  STANDAARD,
  sjabloonVoor,
  voegOnderdeelToe,
  voegLichtschakelingToe,
} from "@elentrik/model";
import {
  invoegBestemmingen,
  doelBijSelectie,
  nieuwePuntcode,
  lichtDoelBijSelectie,
  kringBestemming,
  differentieelBezetting,
  sjabloonBestemming,
  sjabloonBestemmingen,
  sjablonenPerGroep,
  SJABLOONGROEPEN,
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

describe("kringBestemming", () => {
  function opzet() {
    const doc0 = nieuwProjectDocument({ klantNaam: "T", stroomtype: "2x230V" });
    const bord = Object.values(doc0.nodes).find((n) => n.type === "verdeelbord")!.id;
    const f = voegToe(doc0, bord, STANDAARD.differentieel);
    const opF = voegOnderdeelToe(f.doc, { soort: "rail-einde", nodeId: f.id }, "contactdoos");
    const opBord = voegOnderdeelToe(opF.doc, { soort: "rail-einde", nodeId: bord }, "contactdoos");
    const doc = opBord.doc;
    return { doc, bord, diff: f.id, puntOpF: opF.ids.at(-1)!, puntOpBord: opBord.ids.at(-1)!, doelen: invoegBestemmingen(doc) };
  }

  test("standaard het differentieel van de huidige selectie", () => {
    const { doc, diff, puntOpF, doelen } = opzet();
    expect(kringBestemming(doc, doelen, [puntOpF], {})).toEqual({ soort: "bestaande-differentieel", nodeId: diff });
    expect(kringBestemming(doc, doelen, [diff], {})).toEqual({ soort: "bestaande-differentieel", nodeId: diff });
  });

  test("anders het laatst gebruikte differentieel in dit bord", () => {
    const { doc, bord, diff, puntOpBord, doelen } = opzet();
    expect(kringBestemming(doc, doelen, [puntOpBord], { [bord]: diff })).toEqual({ soort: "bestaande-differentieel", nodeId: diff });
    expect(kringBestemming(doc, doelen, [], { [bord]: diff })).toEqual({ soort: "bestaande-differentieel", nodeId: diff });
  });

  test("anders het bord", () => {
    const { doc, bord, puntOpBord, doelen } = opzet();
    expect(kringBestemming(doc, doelen, [puntOpBord], {})).toEqual({ soort: "nieuw-op-bord", nodeId: bord });
    expect(kringBestemming(doc, doelen, [], {})).toEqual({ soort: "nieuw-op-bord", nodeId: bord });
    // Een verdwenen differentieel (bv. na ongedaan maken) is geen bestemming meer.
    expect(kringBestemming(doc, doelen, [], { [bord]: "weg" })).toEqual({ soort: "nieuw-op-bord", nodeId: bord });
  });

  test("een geselecteerd bord blijft het bord", () => {
    const { doc, bord, diff, doelen } = opzet();
    expect(kringBestemming(doc, doelen, [bord], { [bord]: diff })).toEqual({ soort: "nieuw-op-bord", nodeId: bord });
  });
});

describe("bezetting van een differentieel", () => {
  /** Een bord met een differentieel van `gevoeligheid` mA dat `kringen` kringen draagt, en één kring rechtstreeks op het bord. */
  function metKringen(kringen: number, gevoeligheid = 30) {
    const doc0 = nieuwProjectDocument({ klantNaam: "T", stroomtype: "2x230V" });
    const bord = Object.values(doc0.nodes).find((n) => n.type === "verdeelbord")!.id;
    const f = voegToe(doc0, bord, { type: "differentieel", gevoeligheid_mA: gevoeligheid, nominaal_A: 40, polen: 2, klasse: "A" });
    let doc = f.doc;
    let punt = "";
    for (let i = 0; i < kringen; i++) {
      const r = voegOnderdeelToe(doc, { soort: "rail-einde", nodeId: f.id }, "contactdoos");
      doc = r.doc;
      punt = r.ids.at(-1)!;
    }
    const opBord = voegOnderdeelToe(doc, { soort: "rail-einde", nodeId: bord }, "contactdoos");
    return { doc: opBord.doc, bord, diff: f.id, punt, puntOpBord: opBord.ids.at(-1)!, doelen: invoegBestemmingen(opBord.doc) };
  }

  test("telt de kringen achter een differentieel van maximaal 30 mA", () => {
    const zes = metKringen(6);
    expect(differentieelBezetting(zes.doc, zes.diff)).toEqual({ aantal: 6, max: 8, vol: false });
    const acht = metKringen(8);
    expect(differentieelBezetting(acht.doc, acht.diff)).toEqual({ aantal: 8, max: 8, vol: true });
    const leeg = metKringen(0);
    expect(differentieelBezetting(leeg.doc, leeg.diff)).toEqual({ aantal: 0, max: 8, vol: false });
  });

  test("een differentieel boven 30 mA, een bord en een onbekende node hebben geen bezetting", () => {
    const { doc, bord, diff } = metKringen(9, 300);
    expect(differentieelBezetting(doc, diff)).toBeUndefined();
    expect(differentieelBezetting(doc, bord)).toBeUndefined();
    expect(differentieelBezetting(doc, "bestaat-niet")).toBeUndefined();
  });

  test("een kring achter een dieper differentieel telt bij dat differentieel", () => {
    const { doc, diff } = metKringen(2);
    const dieper = voegToe(doc, diff, STANDAARD.differentieel);
    const r = voegOnderdeelToe(dieper.doc, { soort: "rail-einde", nodeId: dieper.id }, "contactdoos");
    expect(differentieelBezetting(r.doc, diff)!.aantal).toBe(2);
    expect(differentieelBezetting(r.doc, dieper.id)!.aantal).toBe(1);
  });

  test("de kringen van een onderbord zonder eigen differentieel tellen mee", () => {
    const { doc, diff } = metKringen(1);
    const onderbord = voegOnderdeelToe(doc, { soort: "rail-einde", nodeId: diff }, "onderbord");
    const r = voegOnderdeelToe(onderbord.doc, { soort: "rail-einde", nodeId: onderbord.ids.at(-1)! }, "contactdoos");
    // De eerste kring, de voedingskring van het onderbord en de kring in het onderbord.
    expect(differentieelBezetting(r.doc, diff)!.aantal).toBe(3);
  });

  test("een vol differentieel is geen standaardbestemming meer", () => {
    const { doc, bord, diff, punt, puntOpBord, doelen } = metKringen(8);
    const opBord = { soort: "nieuw-op-bord", nodeId: bord };
    // De selectie zit in het volle differentieel, of het is het differentieel zelf.
    expect(kringBestemming(doc, doelen, [punt], {})).toEqual(opBord);
    expect(kringBestemming(doc, doelen, [diff], {})).toEqual(opBord);
    // Het laatst gebruikte differentieel is vol.
    expect(kringBestemming(doc, doelen, [puntOpBord], { [bord]: diff })).toEqual(opBord);
    expect(kringBestemming(doc, doelen, [], { [bord]: diff })).toEqual(opBord);
    // In de lijst blijft het staan: de gebruiker kan het nog kiezen.
    expect(doelen).toContainEqual({ soort: "bestaande-differentieel", nodeId: diff });
  });

  test("met zeven kringen, of boven 30 mA, blijft het differentieel de standaard", () => {
    const zeven = metKringen(7);
    expect(kringBestemming(zeven.doc, zeven.doelen, [zeven.punt], {})).toEqual({ soort: "bestaande-differentieel", nodeId: zeven.diff });
    const grof = metKringen(9, 300);
    expect(kringBestemming(grof.doc, grof.doelen, [grof.punt], {})).toEqual({ soort: "bestaande-differentieel", nodeId: grof.diff });
  });

  test("is het differentieel van de selectie vol, dan het laatst gebruikte dat nog plaats heeft", () => {
    const { doc, bord, punt } = metKringen(8);
    const tweede = voegToe(doc, bord, STANDAARD.differentieel);
    const doelen = invoegBestemmingen(tweede.doc);
    expect(kringBestemming(tweede.doc, doelen, [punt], { [bord]: tweede.id })).toEqual({ soort: "bestaande-differentieel", nodeId: tweede.id });
    expect(kringBestemming(tweede.doc, doelen, [punt], {})).toEqual({ soort: "nieuw-op-bord", nodeId: bord });
  });
});

describe("sjablonen per groep", () => {
  test("Kringen, Toestellen en Installatie, met elk sjabloon precies één keer", () => {
    const groepen = sjablonenPerGroep(SJABLONEN);
    expect(groepen.map((g) => g.groep)).toEqual(["kringen", "toestellen", "installatie"]);
    expect(groepen[0]!.sjablonen.map((s) => s.id)).toEqual(["kring-stopcontacten", "kring-verlichting", "keuken", "badkamer", "buiten"]);
    expect(groepen[1]!.sjablonen.map((s) => s.id)).toEqual([
      "kookplaat", "oven", "vaatwasser", "wasmachine", "droogkast", "boiler", "warmtepomp", "laadpaal", "zonnepanelen",
    ]);
    expect(groepen[2]!.sjablonen.map((s) => s.id)).toEqual(["aarding"]);
    expect(groepen.flatMap((g) => g.sjablonen)).toHaveLength(SJABLONEN.length);
  });

  test("een sjabloon zonder groep is een kring; een lege groep valt weg", () => {
    const los = { id: "x", naam: "x", boom: sjabloonVoor("kookplaat", "2x230V").boom };
    expect(sjablonenPerGroep([los])).toEqual([{ groep: "kringen", sjablonen: [los] }]);
    expect(sjablonenPerGroep([])).toEqual([]);
  });

  test("elk sjabloon heeft een naam in de drie talen", () => {
    for (const taal of ["nl", "fr", "en"]) {
      const teksten = JSON.parse(readFileSync(join(import.meta.dirname, "..", "i18n", "locales", `${taal}.json`), "utf8"));
      for (const { id } of SJABLONEN) expect(teksten.editor.sjablonen[id], `${taal}: ${id}`).toEqual(expect.any(String));
      for (const groep of SJABLOONGROEPEN) expect(teksten.editor.onderdelenPaneel.sjabloongroepen[groep], `${taal}: ${groep}`).toEqual(expect.any(String));
    }
  });
});

describe("bestemming van een sjabloon", () => {
  function opzet() {
    const doc0 = nieuwProjectDocument({ klantNaam: "T", stroomtype: "2x230V" });
    const bord = Object.values(doc0.nodes).find((n) => n.type === "verdeelbord")!.id;
    const f = voegToe(doc0, bord, STANDAARD.differentieel);
    const opF = voegOnderdeelToe(f.doc, { soort: "rail-einde", nodeId: f.id }, "contactdoos");
    return { doc: opF.doc, bord, diff: f.id, punt: opF.ids.at(-1)! };
  }
  const sjabloon = (id: string) => sjabloonVoor(id, "2x230V");

  test("een kring: het bord en de differentiëlen, met het differentieel van de selectie als standaard", () => {
    const { doc, bord, diff, punt } = opzet();
    expect(sjabloonBestemmingen(doc, sjabloon("wasmachine"))).toEqual(invoegBestemmingen(doc));
    expect(sjabloonBestemming(doc, sjabloon("wasmachine"), [punt], {})).toEqual({ soort: "bestaande-differentieel", nodeId: diff });
    expect(sjabloonBestemming(doc, sjabloon("wasmachine"), [], {})).toEqual({ soort: "nieuw-op-bord", nodeId: bord });
  });

  test("de laadpaal vraagt een eigen differentieel: standaard een nieuw, op het bord van de selectie", () => {
    const { doc, bord, diff, punt } = opzet();
    expect(sjabloonBestemming(doc, sjabloon("laadpaal"), [punt], { [bord]: diff })).toEqual({ soort: "nieuw-op-bord", nodeId: bord });
    expect(sjabloonBestemming(doc, sjabloon("laadpaal"), [diff], {})).toEqual({ soort: "nieuw-op-bord", nodeId: bord });
    // Het bestaande differentieel blijft een keuze.
    expect(sjabloonBestemmingen(doc, sjabloon("laadpaal"))).toContainEqual({ soort: "bestaande-differentieel", nodeId: diff });
  });

  test("de aarding komt alleen rechtstreeks op een bord", () => {
    const { doc, bord, diff, punt } = opzet();
    expect(sjabloonBestemmingen(doc, sjabloon("aarding"))).toEqual([{ soort: "nieuw-op-bord", nodeId: bord }]);
    expect(sjabloonBestemming(doc, sjabloon("aarding"), [punt], { [bord]: diff })).toEqual({ soort: "nieuw-op-bord", nodeId: bord });
    expect(sjabloonBestemming(doc, sjabloon("aarding"), [], {})).toEqual({ soort: "nieuw-op-bord", nodeId: bord });
  });

  test("met een onderbord in de selectie komt de aarding of de laadpaal op dat onderbord", () => {
    const { doc, bord } = opzet();
    const sub = voegOnderdeelToe(doc, { soort: "rail-einde", nodeId: bord }, "onderbord");
    const onderbord = sub.ids.at(-1)!;
    const punt = voegOnderdeelToe(sub.doc, { soort: "rail-einde", nodeId: onderbord }, "contactdoos");
    const selectie = [punt.ids.at(-1)!];
    expect(sjabloonBestemming(punt.doc, sjabloon("aarding"), selectie, {})).toEqual({ soort: "nieuw-op-bord", nodeId: onderbord });
    expect(sjabloonBestemming(punt.doc, sjabloon("laadpaal"), selectie, {})).toEqual({ soort: "nieuw-op-bord", nodeId: onderbord });
  });
});
