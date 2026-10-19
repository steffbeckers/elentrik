import { bestandHeaders } from "../../bestanden/headers";
import { gebruikOpslag } from "../../bestanden/opslag";
import { haalBestand } from "../../bestanden/repo";
import { gebruikDb } from "../../db";

export default defineEventHandler(async (event) => {
  const bestand = await haalBestand(gebruikDb(), bestandId(event));
  const stroom = bestand ? await gebruikOpslag().lees(bestand.sleutel) : null;
  if (!bestand || !stroom) {
    throw createError({ statusCode: 404, statusMessage: "Bestand niet gevonden" });
  }
  setResponseHeaders(event, bestandHeaders(bestand.mime));
  return stroom;
});
