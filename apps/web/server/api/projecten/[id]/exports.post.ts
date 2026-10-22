import { setResponseStatus } from "h3";
import { gebruikOpslag } from "../../../bestanden/opslag";
import { gebruikDb } from "../../../db";
import { maakExport } from "../../../exports/repo";
import { maakPdf } from "../../../pdf/gotenberg";
import { ExportInvoerSchema, metExportFouten } from "../../../utils/exports";
import { leesBody, leesIfMatch, projectId } from "../../../utils/projecten";
import { defineBeveiligdeHandler, vereisProjecttoegang } from "../../../utils/toegang";

export default defineBeveiligdeHandler(async (event) => {
  const { project } = await vereisProjecttoegang(event, projectId(event));
  // De versie die de editor toont: is het opgeslagen project intussen anders, dan volgt 409.
  const versie = leesIfMatch(event);
  const invoer = await leesBody(event, ExportInvoerSchema);
  const info = await metExportFouten(project.id, () =>
    maakExport(gebruikDb(), gebruikOpslag(), project.organisatieId, project.id, versie, invoer, {
      maakPdf: (pdfInvoer) => maakPdf(pdfInvoer),
    }),
  );
  setResponseStatus(event, 201);
  return info;
});
