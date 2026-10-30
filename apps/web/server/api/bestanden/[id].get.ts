import { setResponseHeaders } from "h3";
import { bestandHeaders } from "../../bestanden/headers";
import { gebruikOpslag } from "../../bestanden/opslag";
import { haalBestand } from "../../bestanden/repo";
import { gebruikDb } from "../../db";
import { exportBestandsnaam } from "../../exports/repo";
import { nietGevondenFout } from "../../fouten";
import { bestandId } from "../../utils/bestanden";
import { defineBeveiligdeHandler, vereisLid } from "../../utils/toegang";

// Een bestand is alleen bereikbaar voor een lid van de organisatie waartoe het hoort: via zijn
// project, of voor een logo via zijn eigen organisatie. Anders 404, voor een onbekend bestand, het
// bestand van een andere organisatie en dat van een verwijderd project dezelfde (zie
// server/fouten.ts).
export default defineBeveiligdeHandler(async (event) => {
  const db = gebruikDb();
  const bestand = await haalBestand(db, bestandId(event));
  if (!bestand?.organisatieId || bestand.projectVerwijderd) throw nietGevondenFout();
  await vereisLid(event, { organisatieId: bestand.organisatieId });
  const stroom = await gebruikOpslag().lees(bestand.sleutel);
  if (!stroom) throw nietGevondenFout();
  // Een export-PDF wordt gedownload onder "<projectnaam> - <versieLabel>.pdf".
  const download = bestand.soort === "export" ? await exportBestandsnaam(db, bestand.id) : undefined;
  setResponseHeaders(event, bestandHeaders(bestand.mime, download !== undefined ? { download } : {}));
  return stroom;
});
