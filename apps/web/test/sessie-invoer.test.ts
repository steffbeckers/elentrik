import { describe, expect, test } from "vitest";
import { isBedrijfsnaam, isEmail, isNaam, wachtwoordFout } from "../app/sessie/invoer";

describe("invoer", () => {
  test("isEmail", () => {
    expect(isEmail("an@peeters.be")).toBe(true);
    expect(isEmail(" an@peeters.be ")).toBe(true);
    expect(isEmail("an@peeters")).toBe(false);
    expect(isEmail("an peeters@x.be")).toBe(false);
    expect(isEmail("")).toBe(false);
    expect(isEmail(`${"a".repeat(250)}@x.be`)).toBe(false);
  });

  test("wachtwoordFout: minstens 10 en hoogstens 128 tekens", () => {
    expect(wachtwoordFout("123456789")).toBe("wachtwoordTeKort");
    expect(wachtwoordFout("1234567890")).toBeNull();
    expect(wachtwoordFout("x".repeat(128))).toBeNull();
    expect(wachtwoordFout("x".repeat(129))).toBe("wachtwoordTeLang");
  });

  test("isBedrijfsnaam: 1 tot 80 tekens na trimmen", () => {
    expect(isBedrijfsnaam("  ")).toBe(false);
    expect(isBedrijfsnaam(" Peeters ")).toBe(true);
    expect(isBedrijfsnaam("x".repeat(80))).toBe(true);
    expect(isBedrijfsnaam("x".repeat(81))).toBe(false);
  });

  test("isNaam: 1 tot 100 tekens na trimmen", () => {
    expect(isNaam(" ")).toBe(false);
    expect(isNaam("An")).toBe(true);
    expect(isNaam("x".repeat(101))).toBe(false);
  });
});
