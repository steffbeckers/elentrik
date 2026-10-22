// Alle routes onder /api/auth gaan naar Better Auth.
import { defineEventHandler, toWebRequest } from "h3";
import { gebruikAuth } from "../../auth";

export default defineEventHandler((event) => gebruikAuth().handler(toWebRequest(event)));
