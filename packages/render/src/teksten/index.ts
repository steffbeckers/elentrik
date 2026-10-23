import type { Taal } from "@elentrik/arei";
import { EN } from "./en";
import { FR } from "./fr";
import { NL, type Teksten } from "./nl";

export type { Taal, Teksten };

/** De vaste teksten van de pdf per taal. */
export const TEKSTEN: Readonly<Record<Taal, Teksten>> = { nl: NL, fr: FR, en: EN };

/** De locale per taal, voor `Intl` (getallen en datums) en `<html lang>`. */
export const LOCALES: Readonly<Record<Taal, string>> = { nl: "nl-BE", fr: "fr-BE", en: "en-GB" };
