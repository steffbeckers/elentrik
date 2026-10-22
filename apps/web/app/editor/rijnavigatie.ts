// Toetsenbordnavigatie tussen de rijen van een tabel (de kringenlijst). Puur; expliciete imports (ruling E1).

/**
 * De index van de rij waar de focus heen gaat na `toets`, vanaf rij `huidig` in een tabel van `aantal`
 * rijen: pijl omhoog en omlaag gaan één rij verder (zonder rond te lopen), Home en End naar de eerste en
 * de laatste rij. Een andere toets of een lege tabel geeft `null`.
 */
export function volgendeRij(toets: string, huidig: number, aantal: number): number | null {
  if (aantal < 1) return null;
  const laatste = aantal - 1;
  switch (toets) {
    case "ArrowDown":
      return Math.min(huidig + 1, laatste);
    case "ArrowUp":
      return Math.max(huidig - 1, 0);
    case "Home":
      return 0;
    case "End":
      return laatste;
    default:
      return null;
  }
}
