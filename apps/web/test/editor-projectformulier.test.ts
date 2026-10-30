import { nieuwProjectDocument, wijzigProject, type Adres } from "@elentrik/model";
import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, test } from "vitest";
import {
  formulierUitProject,
  gegevensUitFormulier,
  valideerProjectFormulier,
  type ProjectFormulier,
} from "../app/editor/projectformulier";
import { useEditorStore } from "../app/stores/editor";

beforeEach(() => setActivePinia(createPinia()));

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

  test("de dossiertaal: nl voor een document zonder taal, anders die van het document", () => {
    const doc = nieuwProjectDocument({ klantNaam: "Janssens", stroomtype: "2x230V", datum: "2026-10-18" });
    expect(formulierUitProject("Woning", doc).dossierTaal).toBe("nl");
    expect(formulierUitProject("Woning", wijzigProject(doc, { dossierTaal: "fr" }).doc).dossierTaal).toBe("fr");
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
      dossierTaal: "nl",
    });
  });

  test("de gekozen dossiertaal gaat mee", () => {
    expect(gegevensUitFormulier(startFormulier({ dossierTaal: "en" })).dossierTaal).toBe("en");
  });

  test("een leeg werfadres gaat leeg mee: het oude werfadres wordt gewist", () => {
    const gegevens = gegevensUitFormulier(startFormulier({ naam: "Nieuwe naam" }));
    expect(gegevens.werfadres).toEqual({ straat: "", nummer: "", postcode: "", gemeente: "", land: "België" });
    expect(gegevens.naam).toBe("Nieuwe naam");
  });

  test("alle velden van een eerder ingevuld werfadres leegmaken geeft een leeg werfadres in het document", () => {
    const doc = nieuwProjectDocument({ klantNaam: "Janssens", stroomtype: "2x230V", datum: "2026-10-18" });
    const metAdres = wijzigProject(doc, { werfadres: adres }).doc;
    const f = formulierUitProject("Woning", metAdres);
    const leeg = { ...f, werf: { ...f.werf, straat: "", nummer: "", bus: "", postcode: "", gemeente: "" } };
    expect(valideerProjectFormulier(leeg)).toEqual([]);

    const store = useEditorStore();
    store.laad({ id: "p1", naam: "Woning", versie: 1, document: metAdres });
    store.wijzigProjectgegevens(gegevensUitFormulier(leeg));
    expect(store.document?.meta.werfadres).toEqual({ straat: "", nummer: "", postcode: "", gemeente: "", land: "België" });
  });

  test("een leeg werfadres bij een document zonder werfadres is geen wijziging", () => {
    const doc = nieuwProjectDocument({ klantNaam: "Janssens", stroomtype: "2x230V", datum: "2026-10-18" });
    const store = useEditorStore();
    store.laad({ id: "p1", naam: "Woning", versie: 1, document: doc });
    store.wijzigProjectgegevens(gegevensUitFormulier(formulierUitProject("Woning", doc)));
    expect(store.gewijzigdSindsOpslaan).toBe(0);
  });

  test("een ingevuld klantadres gaat mee", () => {
    const f = metWerf(startFormulier());
    f.klant = { ...f.klant, straat: "Kerkstraat", nummer: "12", postcode: "2000", gemeente: "Antwerpen" };
    expect(gegevensUitFormulier(f).klantAdres).toEqual(adres);
  });
});
