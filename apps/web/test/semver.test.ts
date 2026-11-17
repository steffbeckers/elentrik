// De volgende versie uit de git-geschiedenis (shared/semver.ts): de hoogste tag vX.Y.Z en de Conventional
// Commits sinds die tag. Ook tegen een echte git-repo in een tijdelijke map, met de takken zoals in de
// repo: een release-tag op een merge-commit van `main` die `staging` niet in zijn geschiedenis heeft.
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, test } from "vitest";
import { EERSTE_VERSIE, bepaalVersie, hoogsteTag, isSemver, volgendeVersie } from "../shared/semver";

describe("volgendeVersie", () => {
  test("zonder tag: de eerste versie", () => {
    expect(volgendeVersie(null, ["feat: iets"])).toBe(EERSTE_VERSIE);
    expect(EERSTE_VERSIE).toBe("1.0.0");
  });

  test("zonder nieuwe commits: dezelfde versie", () => {
    expect(volgendeVersie("v1.2.3", [])).toBe("1.2.3");
  });

  test.each([
    [["fix(web): iets"], "1.2.4"],
    [["chore: iets", "docs: iets"], "1.2.4"],
    [["iets zonder type"], "1.2.4"],
    [["fix: a", "feat(web): b"], "1.3.0"],
    [["feat: b"], "1.3.0"],
    [["feat(web)!: weg met x"], "2.0.0"],
    [["fix!: anders"], "2.0.0"],
    [["feat: x\n\nBREAKING CHANGE: de API is anders"], "2.0.0"],
    [["fix: x\n\nBREAKING-CHANGE: anders"], "2.0.0"],
    [["fix: x\n\nGeen breaking change: in de tekst"], "1.2.4"],
    [["docs: over feat: in de tekst"], "1.2.4"],
  ] as const)("v1.2.3 + %j -> %s", (berichten, verwacht) => {
    expect(volgendeVersie("v1.2.3", berichten)).toBe(verwacht);
  });
});

describe("hoogsteTag", () => {
  test("de hoogste vX.Y.Z, numeriek; andere tags tellen niet", () => {
    expect(hoogsteTag(["v1.9.0", "v1.10.0", "v1.2.30", "vrij", "2.0.0", "v3.0.0-rc.1", ""])).toBe("v1.10.0");
    expect(hoogsteTag([])).toBeNull();
  });
});

describe("isSemver", () => {
  test.each([
    ["1.0.0", true],
    ["1.1.0-staging", true],
    ["1.1.0-dev", true],
    ["1.0.0+abc", true],
    ["v1.0.0", false],
    ["1.0", false],
    ["", false],
    [null, false],
  ] as const)("%j -> %j", (waarde, verwacht) => {
    expect(isSemver(waarde)).toBe(verwacht);
  });
});

describe("bepaalVersie in een echte git-repo", () => {
  const map = mkdtempSync(join(tmpdir(), "elentrik-semver-"));
  afterAll(() => rmSync(map, { recursive: true, force: true }));

  const git = (args: string[]) =>
    execFileSync("git", args, {
      cwd: map,
      encoding: "utf8",
      env: {
        ...process.env,
        GIT_AUTHOR_NAME: "t",
        GIT_AUTHOR_EMAIL: "t@example.invalid",
        GIT_COMMITTER_NAME: "t",
        GIT_COMMITTER_EMAIL: "t@example.invalid",
      },
    });
  const commit = (bericht: string) => git(["commit", "--allow-empty", "--no-gpg-sign", "-q", "-m", bericht]);
  const merge = (tak: string) => git(["merge", "--no-ff", "--no-gpg-sign", "-q", "-m", `Merge ${tak}`, tak]);

  test("eerste release, daarna feat op staging met de tag alleen op main", () => {
    git(["init", "-q", "-b", "main"]);
    git(["config", "tag.gpgSign", "false"]);
    commit("chore: begin");
    expect(bepaalVersie(git)).toEqual({ vorigeTag: null, versie: "1.0.0" });
    git(["tag", "v1.0.0"]);

    // develop → staging → main, telkens met een merge-commit; de tag v1.1.0 op main.
    git(["switch", "-q", "-c", "staging"]);
    git(["switch", "-q", "-c", "develop"]);
    commit("fix(web): a");
    git(["switch", "-q", "staging"]);
    merge("develop");
    expect(bepaalVersie(git).versie).toBe("1.0.1");
    git(["switch", "-q", "main"]);
    merge("staging");
    expect(bepaalVersie(git)).toEqual({ vorigeTag: "v1.0.0", versie: "1.0.1" });
    git(["tag", "v1.0.1"]);
    // Zonder nieuwe commits: dezelfde versie, ook op main na de tag.
    expect(bepaalVersie(git).versie).toBe("1.0.1");

    // Staging heeft de merge-commit (en dus de tag) niet, maar ziet alleen wat sindsdien nieuw is.
    git(["switch", "-q", "develop"]);
    commit("feat(web): b");
    git(["switch", "-q", "staging"]);
    merge("develop");
    expect(bepaalVersie(git)).toEqual({ vorigeTag: "v1.0.1", versie: "1.1.0" });
  });
});
