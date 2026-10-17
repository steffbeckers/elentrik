import { v7 } from "uuid";
import type { NodeId } from "./schema";

/** Nieuw node-id: een UUIDv7-string. */
export function nieuwId(): NodeId {
  return v7();
}
