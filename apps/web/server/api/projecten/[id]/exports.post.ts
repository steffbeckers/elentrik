import { gebruikOpslag } from "../../../bestanden/opslag";
import { gebruikDb } from "../../../db";
import { maakExport } from "../../../exports/repo";
import { maakPdf } from "../../../pdf/gotenberg";

export default defineEventHandler(async (event) => {
  const id = projectId(event);
  const invoer = await leesBody(event, ExportInvoerSchema);
  const info = await metExportFouten(id, () =>
    maakExport(gebruikDb(), gebruikOpslag(), id, invoer, { maakPdf: (pdfInvoer) => maakPdf(pdfInvoer) }),
  );
  setResponseStatus(event, 201);
  return info;
});
