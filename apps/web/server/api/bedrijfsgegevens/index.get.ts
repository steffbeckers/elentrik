import { haalBedrijf } from "../../bedrijf/repo";
import { gebruikDb } from "../../db";

export default defineEventHandler(() => haalBedrijf(gebruikDb()));
