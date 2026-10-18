import { gebruikDb } from "../../db";
import { lijstProjecten } from "../../projecten/repo";

export default defineEventHandler(() => lijstProjecten(gebruikDb()));
