import { bewaarBestand } from "../../../bestanden/repo";
import { gebruikOpslag } from "../../../bestanden/opslag";
import { gebruikDb } from "../../../db";

export default defineEventHandler(async (event) => {
  const id = projectId(event);
  const { soort, data } = await leesPlanUpload(event);
  const info = await metBestandFouten(() =>
    bewaarBestand(gebruikDb(), gebruikOpslag(), { projectId: id, soort, data }),
  );
  setResponseStatus(event, 201);
  return info;
});
