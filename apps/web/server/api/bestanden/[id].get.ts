import { bestandHeaders } from "../../bestanden/headers";
import { gebruikOpslag } from "../../bestanden/opslag";
import { haalBestand } from "../../bestanden/repo";
import { gebruikDb } from "../../db";
import { exportBestandsnaam } from "../../exports/repo";

export default defineEventHandler(async (event) => {
  const db = gebruikDb();
  const bestand = await haalBestand(db, bestandId(event));
  const stroom = bestand ? await gebruikOpslag().lees(bestand.sleutel) : null;
  if (!bestand || !stroom) {
    throw createError({ statusCode: 404, statusMessage: "Bestand niet gevonden" });
  }
  // Een export-PDF wordt gedownload onder "<projectnaam> - <versieLabel>.pdf".
  const download = bestand.soort === "export" ? await exportBestandsnaam(db, bestand.id) : undefined;
  setResponseHeaders(event, bestandHeaders(bestand.mime, download !== undefined ? { download } : {}));
  return stroom;
});
