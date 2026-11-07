import { describe, expect, it } from "vitest";
import { filterProjecten } from "../app/utils/projectenZoeken";
import type { ProjectInLijst } from "../shared/projecten";

const projecten: ProjectInLijst[] = [
  { id: "1", naam: "Woning Gent", klantnaam: "Janssens", gewijzigd: "2026-11-03", werfGemeente: "Gent", laatsteExport: null },
  { id: "2", naam: "Atelier", klantnaam: "De Smet", gewijzigd: "2026-11-02", werfGemeente: "Sint-Niklaas", laatsteExport: null },
  { id: "3", naam: "Appartement Gent", klantnaam: "", gewijzigd: "2026-11-01", werfGemeente: null, laatsteExport: null },
];

describe("projecten zoeken", () => {
  it("vindt een deel van de projectnaam zonder hoofdletterverschil en bewaart de volgorde", () => {
    expect(filterProjecten(projecten, " GENT ").map((project) => project.id)).toEqual(["1", "3"]);
  });

  it("vindt ook een deel van de klantnaam", () => {
    expect(filterProjecten(projecten, "sMeT").map((project) => project.id)).toEqual(["2"]);
  });

  it("vindt ook de gemeente van de werf", () => {
    expect(filterProjecten(projecten, "niklaas").map((project) => project.id)).toEqual(["2"]);
  });

  it.each(["", "   "])("toont alle projecten bij een lege zoekopdracht (%j)", (zoek) => {
    expect(filterProjecten(projecten, zoek)).toEqual(projecten);
  });

  it("geeft geen resultaten voor een onbekende naam of een datum", () => {
    expect(filterProjecten(projecten, "Brugge")).toEqual([]);
    expect(filterProjecten(projecten, "2026")).toEqual([]);
    expect(filterProjecten([], "Gent")).toEqual([]);
  });
});
