import { setResponseStatus } from "h3";
import { vereisSchrijfrecht } from "../../abonnementen/handhaving";
import { gebruikOpslag } from "../../bestanden/opslag";
import { gebruikDb } from "../../db";
import { maakProjectUitDocument } from "../../projecten/repo";
import { leesBody, metProjectFouten, ProjectUitDocumentSchema } from "../../utils/projecten";
import { defineBeveiligdeHandler, vereisLid, vereisVerwachteGebruiker } from "../../utils/toegang";

// "Bewaar als nieuw project" in de editor, nadat het project elders verwijderd werd: een nieuw
// project in de actieve organisatie uit het lokale document. De planbestanden van de organisatie
// die het document noemt, worden mee gekopieerd (ook die van het verwijderde project).
export default defineBeveiligdeHandler(async (event) => {
  // Nooit onder de sessie van een andere gebruiker dan wie dit venster opende.
  await vereisVerwachteGebruiker(event);
  const { organisatieId } = await vereisLid(event);
  await vereisSchrijfrecht(organisatieId);
  const invoer = await leesBody(event, ProjectUitDocumentSchema);
  const project = await metProjectFouten(() =>
    maakProjectUitDocument(gebruikDb(), gebruikOpslag(), organisatieId, invoer),
  );
  setResponseStatus(event, 201);
  return project;
});
