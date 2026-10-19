import { gebruikDb } from "../../db";
import { maakProject } from "../../projecten/repo";

export default defineEventHandler(async (event) => {
  const invoer = await leesBody(event, NieuwProjectSchema);
  const project = await maakProject(gebruikDb(), invoer);
  setResponseStatus(event, 201);
  return project;
});
