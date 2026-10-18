import { gebruikDb } from "../../db";
import { haalProject } from "../../projecten/repo";

export default defineEventHandler(async (event) => {
  const project = await haalProject(gebruikDb(), projectId(event));
  if (!project) throw createError({ statusCode: 404, statusMessage: "Project niet gevonden" });
  return project;
});
