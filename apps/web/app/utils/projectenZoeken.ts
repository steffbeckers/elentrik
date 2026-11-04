import type { ProjectSamenvatting } from "../../shared/projecten";

export function filterProjecten(projecten: ProjectSamenvatting[], zoek: string): ProjectSamenvatting[] {
  const zoekterm = zoek.trim().toLowerCase();
  return projecten.filter((project) =>
    [project.naam, project.klantnaam].some((tekst) => tekst.toLowerCase().includes(zoekterm)),
  );
}
