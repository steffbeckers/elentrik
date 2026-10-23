import { setResponseStatus } from "h3";
import { vereisSchrijfrecht } from "../../abonnementen/handhaving";
import { gebruikDb } from "../../db";
import { leesGebruikerstaal } from "../../gebruikers/taal";
import { maakProject } from "../../projecten/repo";
import { leesBody, NieuwProjectSchema } from "../../utils/projecten";
import { defineBeveiligdeHandler, vereisLid } from "../../utils/toegang";

// Een nieuw project komt altijd in de actieve organisatie.
export default defineBeveiligdeHandler(async (event) => {
  const { gebruiker, organisatieId } = await vereisLid(event);
  await vereisSchrijfrecht(organisatieId);
  const invoer = await leesBody(event, NieuwProjectSchema);
  // Het dossier krijgt de taal van wie het aanmaakt; het blijft die taal, wie het ook exporteert.
  const dossierTaal = await leesGebruikerstaal(gebruikDb(), gebruiker.id);
  const project = await maakProject(gebruikDb(), organisatieId, { ...invoer, dossierTaal });
  setResponseStatus(event, 201);
  return project;
});
