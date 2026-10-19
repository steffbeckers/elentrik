import { gebruikDb } from "../../db";
import { verwijderProject } from "../../projecten/repo";

export default defineEventHandler(async (event) => {
  const id = projectId(event);
  await metProjectFouten(() => verwijderProject(gebruikDb(), id));
  setResponseStatus(event, 204);
  return null;
});
