// Bewaren namens een bepaalde gebruiker; gedeeld door de server (`server/utils/toegang.ts`) en de
// client (de editor). Expliciet geïmporteerd (ruling E1).
//
// Een editorvenster hoort bij de gebruiker die het opende. Logt intussen een andere gebruiker in
// (in een ander tabblad), dan zou de cookie van die ander het werk bewaren. Daarom stuurt de editor
// bij elke bewaring mee voor wie het werk is; wijkt dat af van de sessie, dan weigert de server.

/** De header met het id van de gebruiker voor wie de client bewaart. */
export const VERWACHTE_GEBRUIKER_HEADER = "x-elentrik-gebruiker";

/** De foutcode (bij status 401) als de sessie van een andere gebruiker is dan verwacht. */
export const ANDERE_GEBRUIKER = "ANDERE_GEBRUIKER";
