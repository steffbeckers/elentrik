import { createError, setResponseHeaders } from "h3";
import { bestandHeaders } from "../../bestanden/headers";
import { gebruikOpslag } from "../../bestanden/opslag";
import { haalBestand } from "../../bestanden/repo";
import { gebruikDb } from "../../db";
import { exportBestandsnaam } from "../../exports/repo";
import { bestandId } from "../../utils/bestanden";
import { defineBeveiligdeHandler, vereisLid } from "../../utils/toegang";

// Een bestand is alleen bereikbaar voor een lid van de organisatie waartoe het hoort: via zijn
// project, of voor een logo via zijn eigen organisatie. Anders 404.
export default defineBeveiligdeHandler(async (event) => {
  const db = gebruikDb();
  const bestand = await haalBestand(db, bestandId(event));
  if (!bestand?.organisatieId) {
    throw createError({ statusCode: 404, statusMessage: "Bestand niet gevonden", data: { code: "BESTAND_NIET_GEVONDEN" } });
  }
  await vereisLid(event, { organisatieId: bestand.organisatieId });
  const stroom = await gebruikOpslag().lees(bestand.sleutel);
  if (!stroom) {
    throw createError({ statusCode: 404, statusMessage: "Bestand niet gevonden", data: { code: "BESTAND_NIET_GEVONDEN" } });
  }
  // Een export-PDF wordt gedownload onder "<projectnaam> - <versieLabel>.pdf".
  const download = bestand.soort === "export" ? await exportBestandsnaam(db, bestand.id) : undefined;
  setResponseHeaders(event, bestandHeaders(bestand.mime, download !== undefined ? { download } : {}));
  return stroom;
});
