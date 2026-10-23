// Schrijven namens de actieve organisatie die de pagina kent; gedeeld door de server
// (`server/utils/toegang.ts`) en de client (de API-composables). Expliciet geïmporteerd (ruling E1).
//
// De actieve organisatie hoort bij de sessie, en die delen alle tabbladen. Wisselt de gebruiker in
// een ander tabblad (of wisselt de editor automatisch, spec 5b.1), dan zou een oud tabblad zijn
// wijziging in de nieuwe organisatie schrijven. Daarom stuurt elke schrijfactie op de actieve
// organisatie mee welke organisatie de pagina bedoelt; wijkt dat af van de sessie, dan weigert de
// server met 409 en verandert er niets.

/** De header met het id van de actieve organisatie zoals de pagina die kent. */
export const ACTIEVE_ORGANISATIE_HEADER = "x-elentrik-organisatie";

/** De foutcode (bij status 409) als de actieve organisatie van de sessie intussen een andere is. */
export const ANDERE_ORGANISATIE = "ANDERE_ORGANISATIE";
