// De toestand rond een nieuwe versie van de app, voor de toast, het modale venster en de editor.
//
// - `nieuweBuildId`: de build die de server nu heeft (uit de versiecontrole, Task 5);
//   `gemeldeBuildId`: die build kreeg al een toast. Een volgende build geeft opnieuw een melding.
// - `vereist`: de server verwacht een ander compatibiliteitsgetal (een antwoord met een andere
//   `X-Elentrik-Client-Minimum`, of een 426). Dan geeft het modale venster de melding, niet de toast.
//   Het gaat nooit terug: pas een herlading maakt de client weer gelijk.
// - `zonderWaarschuwing`: de herlading is bedoeld; de browser vraagt niet "pagina verlaten?".
//
// De editor registreert met `zetVoorHerladen` een callback die het project nog opslaat; `herlaad`
// roept ze aan. Die callback hoort niet in de state.
//
// Expliciete imports, geen Nuxt-auto-imports: Vitest importeert deze module rechtstreeks
// (ruling E1).
import { defineStore } from "pinia";
import { computed, ref } from "vue";
import { CLIENT_COMPATIBILITEIT } from "../../shared/clientversie";
import { verschiltVanClient } from "../versie/regels";

/** Slaat op wat nog niet bewaard is; true als alles bewaard is. */
export type VoorHerladen = () => Promise<boolean>;

export const useVersieStore = defineStore("versie", () => {
  const nieuweBuildId = ref<string | null>(null);
  const gemeldeBuildId = ref<string | null>(null);
  const vereist = ref(false);
  const zonderWaarschuwing = ref(false);

  // Geen state: een functie hoort niet in de SSR-payload.
  let voorHerladen: VoorHerladen | null = null;

  const toonMelding = computed(
    () => nieuweBuildId.value !== null && nieuweBuildId.value !== gemeldeBuildId.value && !vereist.value,
  );

  function meldBuild(id: string): void {
    nieuweBuildId.value = id;
  }

  function markeerGemeld(): void {
    gemeldeBuildId.value = nieuweBuildId.value;
  }

  function meldServerversie(waarde: string | null | undefined): void {
    if (verschiltVanClient(waarde, CLIENT_COMPATIBILITEIT)) vereist.value = true;
  }

  function meldVereist(): void {
    vereist.value = true;
  }

  function zetVoorHerladen(fn: VoorHerladen | null): void {
    voorHerladen = fn;
  }

  /**
   * Herlaadt de pagina, na `voorHerladen` (de editor bewaart eerst). Is alles bewaard (of is er geen
   * editor), dan vraagt de browser niets; anders blijft de waarschuwing van de browser staan en
   * herlaadt het toch. `herlaadPagina` is injecteerbaar voor de test.
   */
  async function herlaad(herlaadPagina: () => void = () => location.reload()): Promise<void> {
    let bewaard = true;
    if (voorHerladen) {
      try {
        bewaard = await voorHerladen();
      } catch {
        bewaard = false;
      }
    }
    if (bewaard) zonderWaarschuwing.value = true;
    herlaadPagina();
  }

  return {
    nieuweBuildId,
    gemeldeBuildId,
    vereist,
    zonderWaarschuwing,
    toonMelding,
    meldBuild,
    markeerGemeld,
    meldServerversie,
    meldVereist,
    zetVoorHerladen,
    herlaad,
  };
});
