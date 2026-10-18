// Expliciete imports, geen Nuxt-auto-imports (ruling E1). Een concept is het lokale,
// nog niet naar de server bewaarde werk van één project, bewaard in IndexedDB.
import type { InstallatieDocument } from "@elentrik/model";
import { del, get, set } from "idb-keyval";

export type Concept = {
  document: InstallatieDocument;
  /** De serverversie waarop het concept gebaseerd is. */
  versie: number;
  naam: string;
  /** Tijdstip van bewaren, in milliseconden sinds epoch (`Date.now()`). */
  tijd: number;
};

function sleutel(projectId: string): string {
  return `concept:${projectId}`;
}

export function bewaarConcept(projectId: string, concept: Concept): Promise<void> {
  return set(sleutel(projectId), concept);
}

export function haalConcept(projectId: string): Promise<Concept | undefined> {
  return get<Concept>(sleutel(projectId));
}

export function wisConcept(projectId: string): Promise<void> {
  return del(sleutel(projectId));
}

/** Het concept als het later is bewaard dan het project voor het laatst op de server wijzigde. */
export async function nieuwerConcept(project: { id: string; gewijzigd: string }): Promise<Concept | null> {
  const concept = await haalConcept(project.id);
  if (!concept) return null;
  return concept.tijd > Date.parse(project.gewijzigd) ? concept : null;
}
