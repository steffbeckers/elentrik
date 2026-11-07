import type { ProjectInLijst } from "../../shared/projecten";

/** De projecten waarvan de naam, de klant of de gemeente van de werf de zoekterm bevat. */
export function filterProjecten(projecten: ProjectInLijst[], zoek: string): ProjectInLijst[] {
  const zoekterm = zoek.trim().toLowerCase();
  return projecten.filter((project) =>
    [project.naam, project.klantnaam, project.werfGemeente ?? ""].some((tekst) => tekst.toLowerCase().includes(zoekterm)),
  );
}
