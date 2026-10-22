import { bewaarBedrijf } from "../../bedrijf/repo";
import { gebruikDb } from "../../db";

export default defineEventHandler(async (event) => {
  const partij = await leesBedrijfBody(event);
  return bewaarBedrijf(gebruikDb(), partij);
});
