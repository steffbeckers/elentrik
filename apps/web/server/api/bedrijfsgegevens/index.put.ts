import { bewaarBedrijf } from "../../bedrijf/repo";
import { gebruikDb } from "../../db";

export default defineEventHandler(async (event) => {
  const partij = await leesBody(event, BewaarBedrijfSchema);
  return metBedrijfFouten(() => bewaarBedrijf(gebruikDb(), partij));
});
