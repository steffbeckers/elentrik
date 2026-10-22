import { gebruikDb } from "../../../db";
import { lijstExports } from "../../../exports/repo";

export default defineEventHandler(async (event) => {
  return lijstExports(gebruikDb(), projectId(event));
});
