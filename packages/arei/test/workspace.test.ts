import { expect, test } from "vitest";
import { nieuwDocument, parseDocument } from "@elentrik/model";

test("arei kan een modeldocument lezen", () => { const doc = nieuwDocument(); expect(parseDocument(doc)).toEqual(doc); });
