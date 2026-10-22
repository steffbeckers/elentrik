import { nieuwProjectDocument, wijzigProject, type Adres } from "@elentrik/model";
import { describe, expect, test } from "vitest";
import {
  formulierUitProject,
  gegevensUitFormulier,
  valideerProjectFormulier,
  type ProjectFormulier,
} from "../app/editor/projectformulier";

const adres: Adres = { straat: "Kerkstraat", nummer: "12", postcode: "2000", gemeente: "Antwerpen", land: "België" };

function startFormulier(wijziging: Partial<ProjectFormulier> = {}): ProjectFormulier {
  const doc = nieuwProjectDocument({ klantNaam: "Janssens", stroomtype: "2x230V", datum: "2026-10-18" });
  return { ...formulierUitProject("Woning", doc), ...wijziging };
}

function metWerf(f: ProjectFormulier): ProjectFormulier {
  return { ...f, werf: { ...f.werf, straat: "Dorpsstraat", nummer: "3", postcode: "9000", gemeente: "Gent" } };
}

describe("formulierUitProject", () => {
  test("neemt naam, klant, stroomtype, werfadres, EAN en datum over; leeg klantadres krijgt België", () => {
    const doc = nieuwProjectDocument({ klantNaam: "Janssens", stroomtype: "3N400V", datum: "2026-10-18" });
    const f = formulierUitProject("Woning", doc);
    expect(f.naam).toBe("Woning");
    expect(f.klantNaam).toBe("Janssens");
    expect(f.stroomtype).toBe("3N400V");
    expect(f.klant).toEqual({ straat: "", nummer: "", bus: "", postcode: "", gemeente: "", land: "België" });
    expect(f.werf.land).toBe("België");
    expect(f.ean).toBe("");
    expect(f.datum).toBe("2026-10-18");
  });

  test("neemt een bestaand klantadres en EAN over", () => {
    const doc = nieuwProjectDocument({ klantNaam: "Janssens", stroomtype: "2x230V", datum: "2026-10-18" });
    const r = wijzigProject(doc, { klantAdres: adres, ean: "5414" });
    const f = formulierUitProject("Woning", r.doc);
    expect(f.klant.straat).toBe("Kerkstraat");
    expect(f.ean).toBe("5414");
  });
});

describe("valideerProjectFormulier", () => {
  test("een naam en een volledig werfadres zijn nodig", () => {
    expect(valideerProjectFormulier(metWerf(startFormulier()))).toEqual([]);
    expect(valideerProjectFormulier(metWerf(startFormulier({ naam: " " })))).toEqual([
      { name: "naam", fout: "naamVerplicht" },
    ]);
  });

  test("een leeg werfadres blokkeert niets: hernoemen of de klant wijzigen kan zonder werfadres", () => {
    expect(valideerProjectFormulier(startFormulier())).toEqual([]);
    expect(valideerProjectFormulier(startFormulier({ naam: "Nieuwe naam", klantNaam: "Peeters" }))).toEqual([]);
  });

  test("een gedeeltelijk werfadres vraagt de rest, zoals het klantadres", () => {
    const f = startFormulier();
    expect(valideerProjectFormulier({ ...f, werf: { ...f.werf, straat: "D" } })).toEqual([
      { name: "werf.nummer", fout: "adresVerplicht" },
      { name: "werf.postcode", fout: "adresVerplicht" },
      { name: "werf.gemeente", fout: "adresVerplicht" },
    ]);
  });

  test("het klantadres is optioneel, maar een gedeeltelijk adres vraagt de rest", () => {
    const f = metWerf(startFormulier());
    expect(valideerProjectFormulier({ ...f, klant: { ...f.klant, land: "Nederland" } })).toEqual([]);
    expect(valideerProjectFormulier({ ...f, klant: { ...f.klant, straat: "K" } })).toEqual([
      { name: "klant.nummer", fout: "adresVerplicht" },
      { name: "klant.postcode", fout: "adresVerplicht" },
      { name: "klant.gemeente", fout: "adresVerplicht" },
    ]);
  });

  test("de datum is verplicht", () => {
    expect(valideerProjectFormulier(metWerf(startFormulier({ datum: "" })))).toEqual([
      { name: "datum", fout: "datumVerplicht" },
    ]);
  });
});

describe("gegevensUitFormulier", () => {
  test("een leeg klantadres wordt null en de rest wordt getrimd", () => {
    const f = metWerf(startFormulier({ naam: " Woning ", klantNaam: " Janssens ", ean: " 54 " }));
    expect(gegevensUitFormulier(f)).toEqual({
      naam: "Woning",
      klantNaam: "Janssens",
      stroomtype: "2x230V",
      klantAdres: null,
      werfadres: { straat: "Dorpsstraat", nummer: "3", postcode: "9000", gemeente: "Gent", land: "België" },
      ean: "54",
      datum: "2026-10-18",
    });
  });

  test("een leeg werfadres gaat niet mee: het werfadres in het document blijft ongewijzigd", () => {
    const gegevens = gegevensUitFormulier(startFormulier({ naam: "Nieuwe naam" }));
    expect(gegevens).not.toHaveProperty("werfadres");
    expect(gegevens.naam).toBe("Nieuwe naam");
  });

  test("een ingevuld klantadres gaat mee", () => {
    const f = metWerf(startFormulier());
    f.klant = { ...f.klant, straat: "Kerkstraat", nummer: "12", postcode: "2000", gemeente: "Antwerpen" };
    expect(gegevensUitFormulier(f).klantAdres).toEqual(adres);
  });
});
