import { mij } from "../organisaties/leden";
import { defineBeveiligdeHandler } from "../utils/toegang";

// De ingelogde gebruiker, zijn organisaties (eigenaar of lid) en de actieve organisatie.
export default defineBeveiligdeHandler((event) => mij(event));
