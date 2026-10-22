import { gebruikOpslag } from "../../../bestanden/opslag";
import { gebruikDb } from "../../../db";
import { maakExport } from "../../../exports/repo";
import { maakPdf } from "../../../pdf/gotenberg";

export default defineEventHandler(async (event) => {
  const id = projectId(event);
  // De versie die de editor toont: is het opgeslagen project intussen anders, dan volgt 409.
  const versie = leesIfMatch(event);
  const invoer = await leesBody(event, ExportInvoerSchema);
  const info = await metExportFouten(id, () =>
    maakExport(gebruikDb(), gebruikOpslag(), id, versie, invoer, { maakPdf: (pdfInvoer) => maakPdf(pdfInvoer) }),
  );
  setResponseStatus(event, 201);
  return info;
});
