// Schrijven op de actieve organisatie vanuit een tabblad dat misschien verouderd is: de API-laag
// stuurt mee welke organisatie de pagina bedoelt (`voorOrganisatie`), en een 409
// ANDERE_ORGANISATIE (een ander tabblad wisselde intussen) leest de sessie opnieuw en meldt dat
// (`behandelAndereOrganisatie`). De actie wordt niet vanzelf herhaald: de gebruiker kijkt eerst
// na wat hij wilde wijzigen.
//
// Expliciete imports, geen Nuxt-auto-imports: Vitest importeert deze module rechtstreeks
// (ruling E1).
import { ACTIEVE_ORGANISATIE_HEADER, ANDERE_ORGANISATIE } from "../../shared/organisatie";
import { foutCode, foutStatus } from "./fouten";

/**
 * De header voor een schrijfactie op de actieve organisatie zoals de pagina die kent, om in de
 * opties van een fetch te spreiden; zonder actieve organisatie niets.
 */
export function voorOrganisatie(organisatieId: string | null | undefined): { headers?: Record<string, string> } {
  return organisatieId ? { headers: { [ACTIEVE_ORGANISATIE_HEADER]: organisatieId } } : {};
}

/** Een 409 van de server omdat de actieve organisatie van de sessie intussen een andere is. */
export function isAndereOrganisatie(fout: unknown): boolean {
  return foutStatus(fout) === 409 && foutCode(fout) === ANDERE_ORGANISATIE;
}

export type AndereOrganisatieOpties = {
  /** Leest de sessie opnieuw (GET /api/mij). */
  laad(): Promise<void>;
  /** De naam van de actieve organisatie na `laad`, of null. */
  organisatieNaam(): string | null;
  /** Toont de melding, met de naam van de nieuwe actieve organisatie (null: onbekend). */
  meld(organisatie: string | null): void;
};

/**
 * Was de fout een 409 ANDERE_ORGANISATIE, dan de sessie opnieuw lezen (de pagina volgt de nieuwe
 * actieve organisatie) en melden naar welke organisatie het wisselde; geeft dan true. Een andere
 * fout: false, en de aanroeper meldt ze zelf.
 */
export async function behandelAndereOrganisatie(fout: unknown, opties: AndereOrganisatieOpties): Promise<boolean> {
  if (!isAndereOrganisatie(fout)) return false;
  let gelezen = true;
  try {
    await opties.laad();
  } catch {
    gelezen = false;
  }
  opties.meld(gelezen ? opties.organisatieNaam() : null);
  return true;
}
