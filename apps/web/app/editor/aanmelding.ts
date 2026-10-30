// De editor en de aanmelding: opnieuw proberen na een verlopen sessie, en de vraag bij vertrek.
// Expliciete imports, geen Nuxt-auto-imports: Vitest importeert deze module rechtstreeks
// (ruling E1).
import type { AutosaveStatus } from "../composables/useAutosave";

/** Wat `opnieuwProberen` van de sessie nodig heeft. */
export type SessieControle = {
  /** Leest de sessie opnieuw (GET /api/mij). */
  laad(): Promise<void>;
  /** De ingelogde gebruiker na `laad`, of null als er geen sessie is. */
  gebruikerId(): string | null;
};

/**
 * - `geprobeerd`: `nuOpslaan` liep (de status zegt of het lukte);
 * - `andereGebruiker`: nu is een ander ingelogd; er ging niets naar de server;
 * - `afgemeld`: nog altijd geen sessie; er ging niets naar de server.
 */
export type OpnieuwProberenUitkomst = "geprobeerd" | "andereGebruiker" | "afgemeld";

/**
 * "Opnieuw proberen" (en terugkeren naar het tabblad na een 401): eerst de sessie opnieuw lezen.
 * Het werk van dit venster hoort bij `verwacht`; is nu een ander ingelogd, dan blijft het lokaal.
 * Is de sessie niet te lezen (netwerk), dan toch proberen: de server weigert een andere gebruiker
 * zelf (401 `ANDERE_GEBRUIKER`).
 */
export async function opnieuwProberen(opties: {
  sessie: SessieControle;
  verwacht: string;
  nuOpslaan: () => Promise<void>;
}): Promise<OpnieuwProberenUitkomst> {
  const { sessie, verwacht, nuOpslaan } = opties;
  let gelezen = true;
  try {
    await sessie.laad();
  } catch {
    gelezen = false;
  }
  if (gelezen) {
    const huidig = sessie.gebruikerId();
    if (huidig === null) return "afgemeld";
    if (huidig !== verwacht) return "andereGebruiker";
  }
  await nuOpslaan();
  return "geprobeerd";
}

/**
 * Toont de editor de melding "afgemeld" (met "Opnieuw inloggen")? Na een 401 bij het bewaren, en
 * ook zodra de sessie geen gebruiker meer heeft (uitgelogd in een ander tabblad, of "Opnieuw
 * proberen" bij status fout vond geen sessie): anders verdwijnen de menu's zonder uitleg.
 */
export function toonAfgemeld(toestand: { afgemeld: boolean; gebruikerId: string | null }): boolean {
  return toestand.afgemeld || toestand.gebruikerId === null;
}

/** De i18n-sleutel van de bevestiging vóór wisselen of uitloggen, of null als alles bewaard is. */
export function vertrekBevestiging(
  status: AutosaveStatus,
): "editor.vertrek.bevestiging" | "editor.vertrek.bevestigingOnbewaard" | null {
  if (status === "opgeslagen") return null;
  // Ook het lokale concept mislukte: dan gaat het werk echt verloren.
  if (status === "onbewaard") return "editor.vertrek.bevestigingOnbewaard";
  return "editor.vertrek.bevestiging";
}

/** De velden van een klik die `slaVertrekvraagOver` leest. */
export type Klik = Pick<MouseEvent, "button" | "ctrlKey" | "metaKey" | "shiftKey" | "altKey">;

/**
 * "Terug naar de projecten" in de melding "project verwijderd" laat het werk uitdrukkelijk los: dan
 * vraagt de editor niets meer bij het vertrekken. Twee uitzonderingen. Bij `onbewaard` staat het werk
 * alleen nog in het geheugen (ook het lokale concept mislukte): dan vragen we zoals altijd. En alleen
 * bij een gewone linkerklik: ctrl, cmd, shift of de middelste knop openen de pagina in een nieuw
 * tabblad of venster, en dit tabblad blijft dan gewoon staan.
 */
export function slaVertrekvraagOver(status: AutosaveStatus, klik: Klik): boolean {
  if (status === "onbewaard") return false;
  return klik.button === 0 && !klik.ctrlKey && !klik.metaKey && !klik.shiftKey && !klik.altKey;
}
