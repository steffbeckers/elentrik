import { LOCALES, type Taal } from "@elentrik/arei";
import { EN } from "./en";
import { FR } from "./fr";
import { NL, type Teksten } from "./nl";

export { LOCALES };
export type { Taal, Teksten };

/** De vaste teksten van de pdf per taal. */
export const TEKSTEN: Readonly<Record<Taal, Teksten>> = { nl: NL, fr: FR, en: EN };
