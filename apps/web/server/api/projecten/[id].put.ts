import { vereisProjectBewerking } from "../../abonnementen/handhaving";
import { gebruikDb } from "../../db";
import { bewaarProject, haalProject, valideerDocument } from "../../projecten/repo";
import { BewaarProjectSchema, leesBody, leesIfMatch, metProjectFouten, projectId } from "../../utils/projecten";
import { defineBeveiligdeHandler, vereisProjecttoegang, vereisVerwachteGebruiker } from "../../utils/toegang";

export default defineBeveiligdeHandler(async (event) => {
  // Het werk van een andere gebruiker (die in dit venster begon) wordt nooit onder deze sessie bewaard.
  await vereisVerwachteGebruiker(event);
  const { project } = await vereisProjecttoegang(event, projectId(event));
  const versie = leesIfMatch(event);
  const invoer = await leesBody(event, BewaarProjectSchema);
  const db = gebruikDb();
  // De limiet vergelijkt het bewaarde document (voor) met het nieuwe (na). Is het bewaarde intussen
  // een andere versie, dan weigert `bewaarProject` het bewaren toch met CONFLICT.
  const { nieuw, huidig } = await metProjectFouten(async () => ({
    nieuw: valideerDocument(invoer.document),
    huidig: (await haalProject(db, project.organisatieId, project.id))?.document,
  }));
  const { stempel } = await vereisProjectBewerking(project.id, nieuw, huidig);
  return metProjectFouten(() =>
    bewaarProject(db, project.organisatieId, project.id, versie, invoer, undefined, stempel ? { stempel: new Date() } : undefined),
  );
});
