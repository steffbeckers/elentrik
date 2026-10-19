import { analyseer } from "@elentrik/arei";
import { installatie, referentieAppartement } from "@elentrik/arei/testing";
import { beveiligingLabel } from "@elentrik/layout";
import { describe, expect, test } from "vitest";
import { kringenlijst, NL } from "../src/index";

describe("kringenlijst", () => {
  test("referentieAppartement: een rij per punt, de eerste is A1 van kring A", () => {
    const doc = referentieAppartement();
    const analyse = analyseer(doc);
    const rijen = kringenlijst(doc, analyse, NL);
    const aantalPunten = analyse.kringen.reduce((som, k) => som + k.puntIds.length, 0) + analyse.zonderKring.length;
    expect(rijen).toHaveLength(aantalPunten);
    expect(rijen[0]).toMatchObject({ kring: "A", punt: "A1" });
    expect(rijen.map((r) => r.nodeId)).toEqual([
      ...analyse.kringen.flatMap((k) => k.puntIds),
      ...analyse.zonderKring,
    ]);
  });

  test("beveiliging is het label van de kringbeveiliging, leiding is gevuld onder een leiding", () => {
    const doc = referentieAppartement();
    const analyse = analyseer(doc);
    const rijen = kringenlijst(doc, analyse, NL);
    for (const kring of analyse.kringen) {
      const bev = doc.nodes[kring.beveiligingId]!;
      if (bev.type !== "automaat" && bev.type !== "zekering" && bev.type !== "differentieel") continue;
      for (const r of rijen.filter((x) => x.kring === kring.label)) expect(r.beveiliging).toBe(beveiligingLabel(bev));
    }
    for (const r of rijen) {
      if (analyse.ketens[r.nodeId]?.leidingId) expect(r.leiding).not.toBe("");
    }
  });

  test("het differentieel staat als '30 mA type A', het type als Nederlands woord", () => {
    const { doc } = installatie()
      .differentieel(30, (d) => d.verdeelbord((b) => b.kring((k) => k.automaat(16).leiding(2.5).contactdozen(1))))
      .bouw();
    const [r] = kringenlijst(doc, analyseer(doc), NL);
    expect(r!.differentieel).toBe("30 mA type A");
    expect(r!.type).toBe("Contactdoos");
    expect(r!.leiding).toMatch(/^\S+ 3G2,5$/);
  });

  test("de dichtstbijzijnde differentieel geldt; een lid van de 300 mA-reeks toont 300 mA", () => {
    const doc = referentieAppartement();
    const rijen = kringenlijst(doc, analyseer(doc), NL);
    const wasmachine = rijen.find((r) => r.type === "Toestel (wasmachine)")!;
    expect(wasmachine.differentieel).toBe("30 mA type A");
    expect(wasmachine.ruimte).toBe("Wasplaats");
    expect(rijen[0]!.differentieel).toBe("300 mA type A");
  });

  test("een toestel toont de soort tussen haakjes", () => {
    const { doc } = installatie()
      .verdeelbord((b) => b.kring((k) => k.automaat(16).leiding(2.5).toestel("wasmachine")))
      .bouw();
    const rijen = kringenlijst(doc, analyseer(doc), NL);
    expect(rijen[0]!.type).toBe("Toestel (wasmachine)");
  });

  test("een document zonder kringen geeft een lege lijst", () => {
    const { doc } = installatie().bouw();
    expect(kringenlijst(doc, analyseer(doc), NL)).toEqual([]);
  });
});
