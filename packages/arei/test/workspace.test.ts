import { expect, test } from "vitest";
import { SCHEMA_VERSIE } from "@elentrik/model";

test("arei kan model importeren", () => expect(SCHEMA_VERSIE).toBe(1));
