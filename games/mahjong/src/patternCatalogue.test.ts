import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";
import { RULESET } from "@browser-games/engine-mahjong-analysis";

// The repo root, resolved from this file so the scan runs the same under the
// root vitest run and a per-package run.
const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");

// The trees that once held a pattern-to-display-name mapping: the two screens and
// the scorer, plus the analysis package that owns the one catalogue.
const SCAN_DIRS = [
  "games/mahjong/src",
  "packages/engines/mahjong/src",
  "packages/engines/mahjong-analysis/src",
];

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules") continue;
      out.push(...sourceFiles(full));
    } else if (
      (entry.name.endsWith(".ts") || entry.name.endsWith(".tsx")) &&
      !entry.name.endsWith(".test.ts") &&
      !entry.name.endsWith(".test.tsx")
    ) {
      // Scan production source only. A structural test names these tokens itself.
      out.push(full);
    }
  }
  return out;
}

function filesContaining(token: string): string[] {
  const hits: string[] = [];
  for (const dir of SCAN_DIRS) {
    for (const file of sourceFiles(join(REPO_ROOT, dir))) {
      if (readFileSync(file, "utf8").includes(token)) {
        hits.push(file);
      }
    }
  }
  return hits;
}

describe("pattern catalogue is the single source of pattern identity", () => {
  it("has no PATTERN_LABEL map left in any screen or the scorer", () => {
    expect(filesContaining("PATTERN_LABEL")).toEqual([]);
  });

  it("has no dead TAI_REFERENCE table left", () => {
    expect(filesContaining("TAI_REFERENCE")).toEqual([]);
  });

  it("keeps the analysis catalogue as the one id-to-name mapping", () => {
    const dealer = RULESET.taiValues.dealer;
    expect(dealer.english).toBe("Dealer");
    expect(dealer.chinese).toBe("莊家");
    for (const [id, def] of Object.entries(RULESET.taiValues)) {
      expect(def.id).toBe(id);
      expect(def.english.length).toBeGreaterThan(0);
      expect(def.chinese.length).toBeGreaterThan(0);
    }
  });
});
