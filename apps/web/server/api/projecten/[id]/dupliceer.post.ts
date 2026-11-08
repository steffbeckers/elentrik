import { setResponseStatus } from "h3";
import { vereisNieuwProject } from "../../../abonnementen/handhaving";
import { gebruikOpslag } from "../../../bestanden/opslag";
import { gebruikDb } from "../../../db";
import { dupliceerProject, haalProject } from "../../../projecten/repo";
import { nietGevondenFout } from "../../../fouten";
import { DupliceerSchema, leesBody, metProjectFouten, projectId } from "../../../utils/projecten";
import { defineBeveiligdeHandler, vereisProjecttoegang, vereisVerwachteGebruiker } from "../../../utils/toegang";

// De kopie blijft in de organisatie van het bronproject. Ze start als nieuw project: zonder
// `gekocht_op`, met een stempel alleen als de organisatie nu op niveau `abonnement` staat.
export default defineBeveiligdeHandler(async (event) => {
  // "Bewaren als kopie" in de editor: nooit onder de sessie van een andere gebruiker.
  await vereisVerwachteGebruiker(event);
  const { project } = await vereisProjecttoegang(event, projectId(event));
  const { bestandIds } = await leesBody(event, DupliceerSchema);
  const db = gebruikDb();
  const bron = await metProjectFouten(() => haalProject(db, project.organisatieId, project.id));
  if (!bron) throw nietGevondenFout();
  const { stempel } = await vereisNieuwProject(project.organisatieId, bron.document);
  const kopie = await metProjectFouten(() =>
    dupliceerProject(db, gebruikOpslag(), project.organisatieId, project.id, bestandIds, stempel ? { stempel: new Date() } : undefined),
  );
  setResponseStatus(event, 201);
  return kopie;
});
