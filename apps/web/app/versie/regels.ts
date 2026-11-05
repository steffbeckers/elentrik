// De regels van de client rond het compatibiliteitsgetal.
//
// Expliciete imports, geen Nuxt-auto-imports: Vitest importeert deze module rechtstreeks
// (ruling E1).
import { leesClientversie } from "../../shared/clientversie";
import { foutCode, foutStatus } from "../sessie/fouten";

/** Verwacht de server een ander getal dan dit? Een waarde die niet te lezen is, telt niet. */
export function verschiltVanClient(serverWaarde: string | null | undefined, eigen: number): boolean {
  const server = leesClientversie(serverWaarde);
  return server !== null && server !== eigen;
}

/** Is dit de weigering van de server: 426 met de code NIEUWE_VERSIE_VEREIST? */
export function isNieuweVersieFout(fout: unknown): boolean {
  return foutStatus(fout) === 426 && foutCode(fout) === "NIEUWE_VERSIE_VEREIST";
}
