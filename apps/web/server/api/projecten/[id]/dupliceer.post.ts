import { gebruikDb } from "../../../db";
import { dupliceerProject } from "../../../projecten/repo";

export default defineEventHandler(async (event) => {
  const id = projectId(event);
  const kopie = await metProjectFouten(() => dupliceerProject(gebruikDb(), id));
  setResponseStatus(event, 201);
  return kopie;
});
