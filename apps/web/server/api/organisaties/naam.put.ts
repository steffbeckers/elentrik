import { hernoem } from "../../organisaties/leden";
import { defineBeveiligdeHandler } from "../../utils/toegang";

// De actieve organisatie hernoemen: alleen een eigenaar, 1 tot 80 tekens.
export default defineBeveiligdeHandler((event) => hernoem(event));
