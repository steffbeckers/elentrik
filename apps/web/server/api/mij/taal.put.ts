import { createError } from "h3";
import { z } from "zod";
import { isTaal } from "../../../shared/taal";
import { gebruikDb } from "../../db";
import { zetGebruikerstaal } from "../../gebruikers/taal";
import { leesBody } from "../../utils/projecten";
import { defineBeveiligdeHandler, vereisSessie } from "../../utils/toegang";

// De taal van de ingelogde gebruiker wijzigen. Alleen een sessie, geen organisatie nodig. Dit is
// de enige weg: Better Auth weigert `taal` via /update-user.
export default defineBeveiligdeHandler(async (event) => {
  const { gebruiker } = await vereisSessie(event);
  const { taal } = await leesBody(event, z.object({ taal: z.unknown().optional() }));
  if (!isTaal(taal)) {
    throw createError({ statusCode: 400, statusMessage: "Ongeldige taal", data: { code: "ONGELDIGE_TAAL" } });
  }
  await zetGebruikerstaal(gebruikDb(), gebruiker.id, taal);
  return { taal };
});
