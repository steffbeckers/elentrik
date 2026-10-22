import { describe, expect, test } from "vitest";
import { foutCode, foutStatus } from "../app/sessie/fouten";

describe("foutCode", () => {
  test("een fout van $fetch op een eigen route: de code in data.data.code", () => {
    const fout = { status: 409, data: { statusCode: 409, message: "x", data: { code: "LAATSTE_EIGENAAR" } } };
    expect(foutCode(fout)).toBe("LAATSTE_EIGENAAR");
  });

  test("een h3-fout of antwoordlichaam: de code in data.code", () => {
    expect(foutCode({ statusCode: 403, data: { code: "ALLEEN_EIGENAAR" } })).toBe("ALLEEN_EIGENAAR");
  });

  test("een fout van de Better Auth-client: de code bovenaan", () => {
    expect(foutCode({ status: 403, code: "EMAIL_NOT_VERIFIED", message: "Email not verified" })).toBe(
      "EMAIL_NOT_VERIFIED",
    );
  });

  test("een Better Auth-fout via $fetch: de code in data.code", () => {
    expect(foutCode({ status: 401, data: { code: "INVALID_EMAIL_OR_PASSWORD" } })).toBe("INVALID_EMAIL_OR_PASSWORD");
  });

  test("zonder code, of geen object: undefined", () => {
    expect(foutCode({ status: 500, data: { message: "kapot" } })).toBeUndefined();
    expect(foutCode({ code: 42 })).toBeUndefined();
    expect(foutCode(new Error("x"))).toBeUndefined();
    expect(foutCode(null)).toBeUndefined();
    expect(foutCode(undefined)).toBeUndefined();
    expect(foutCode("LAATSTE_EIGENAAR")).toBeUndefined();
  });
});

describe("foutStatus", () => {
  test("status of statusCode", () => {
    expect(foutStatus({ status: 410 })).toBe(410);
    expect(foutStatus({ statusCode: 409 })).toBe(409);
    expect(foutStatus({ status: "x" })).toBeUndefined();
    expect(foutStatus(null)).toBeUndefined();
  });
});
