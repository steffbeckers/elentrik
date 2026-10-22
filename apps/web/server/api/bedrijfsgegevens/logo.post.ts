import { bewaarLogo } from "../../bedrijf/repo";
import { gebruikOpslag } from "../../bestanden/opslag";
import { gebruikDb } from "../../db";

export default defineEventHandler(async (event) => {
  const data = await leesLogoUpload(event);
  const info = await metBestandFouten(() => bewaarLogo(gebruikDb(), gebruikOpslag(), data));
  setResponseStatus(event, 201);
  return info;
});
