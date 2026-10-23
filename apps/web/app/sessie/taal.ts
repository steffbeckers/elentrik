// De taal van de interface wisselen (plan 8, Task 4). Eerst de interface (de i18n-locale, die ook
// de cookie `elentrik_taal` zet), daarna, met een sessie, het account (`PUT /api/mij/taal`), zodat
// de taal de gebruiker naar een ander toestel volgt. Lukt dat bewaren niet, dan blijft de interface
// gewisseld en volgt een melding; er is geen herlaadbeurt nodig.
//
// Expliciete imports, geen Nuxt-auto-imports: Vitest importeert deze module rechtstreeks
// (ruling E1). `useTaal` (app/composables) geeft de echte afhankelijkheden.
import { TALEN, type Taal } from "../../shared/taal";

/** De naam van elke taal, in die taal zelf: zo vindt iedereen zijn eigen taal terug. */
export const TAALNAMEN: Readonly<Record<Taal, string>> = Object.freeze({
  nl: "Nederlands",
  fr: "Français",
  en: "English",
});

export type TaalWisselOpties = {
  /** De i18n-locale wisselen (en daarmee de cookie). */
  zetLocale: (taal: Taal) => void | Promise<void>;
  /** Is er een sessie? Alleen dan wordt de taal op het account bewaard. */
  aangemeld: () => boolean;
  /** `$fetch` naar de route die de taal van het account bewaart. */
  bewaar: (pad: "/api/mij/taal", opties: { method: "PUT"; body: { taal: Taal } }) => Promise<unknown>;
  /** Het bewaren mislukte; de interface is al gewisseld. */
  bijFout: (fout: unknown) => void;
  /** Het account heeft nu deze taal. */
  bijBewaard?: (taal: Taal) => void;
};

export function maakTaalWissel(opties: TaalWisselOpties): { zetTaal(taal: Taal): Promise<void> } {
  return {
    async zetTaal(taal) {
      await opties.zetLocale(taal);
      if (!opties.aangemeld()) return;
      try {
        await opties.bewaar("/api/mij/taal", { method: "PUT", body: { taal } });
      } catch (fout) {
        opties.bijFout(fout);
        return;
      }
      opties.bijBewaard?.(taal);
    },
  };
}

/** Een taal in een keuzemenu: haar eigen naam, aangevinkt als ze de huidige is. */
export type TaalKeuze = { type: "checkbox"; label: string; checked: boolean; onSelect: () => void };

/** De keuzes van de taalkiezer, in de volgorde van `TALEN`: zo zien de kiezer en het gebruikersmenu er gelijk uit. */
export function taalKeuzes(huidig: Taal, kies: (taal: Taal) => unknown): TaalKeuze[] {
  return TALEN.map((taal) => ({
    type: "checkbox",
    label: TAALNAMEN[taal],
    checked: taal === huidig,
    onSelect: () => void kies(taal),
  }));
}
