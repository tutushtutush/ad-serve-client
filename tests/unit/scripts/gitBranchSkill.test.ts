/** @jest-environment node */
import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// Spec 079. The skill runner replaces positional shell names in a skill's text with the words of the
// invocation arguments (and its arguments placeholder with the whole text) before the agent reads it,
// so the first-three-words command arrived broken, and a description with a quote or a backtick was
// pasted inside a quoted command. This reads the skill the way the runner presents it and runs the
// snippets for real.
const ROOT = path.join(__dirname, "../../..");
const SKILL = path.join(ROOT, ".claude/skills/speckit-git-branch/SKILL.md");
const SKILLS_DIR = path.join(ROOT, ".claude/skills");

function present(text: string, description: string): string {
  const words = description.split(/\s+/).filter(Boolean);
  return text
    .replace(/\$ARGUMENTS/g, () => description)
    .replace(/\$([0-9])/g, (_match, digit: string) => words[Number(digit)] ?? "");
}

// The fenced bash snippets of the word-picking and branch-name steps.
function snippets(text: string): string {
  const blocks = [...text.matchAll(/```bash\n([\s\S]*?)```/g)].map((match) => match[1]);
  return blocks.filter((block) => block.includes("FIRST_THREE") || block.includes("create-new-feature.sh")).join("\n");
}

function shells(): string[] {
  return ["/bin/bash", "bash", "zsh"].filter((shell) => spawnSync(shell, ["-c", "exit 0"]).status === 0);
}

function workspace(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "git-branch-skill-"));
  fs.cpSync(path.join(ROOT, ".specify"), path.join(dir, ".specify"), { recursive: true });
  fs.mkdirSync(path.join(dir, "specs/001-first-spec"), { recursive: true });
  execFileSync("git", ["init", "-q"], { cwd: dir });
  return dir;
}

function run(shell: string, description: string, dir: string): { words: string; branch: string | null; status: number | null; stderr: string } {
  const script = `${snippets(present(fs.readFileSync(SKILL, "utf8"), description))}\nprintf 'WORDS=[%s]\\n' "$FIRST_THREE"\n`;
  const result = spawnSync(shell, ["-c", script], { cwd: dir, encoding: "utf8" });
  const words = /WORDS=\[(.*)\]/.exec(result.stdout)?.[1] ?? "";
  const branch = /"BRANCH_NAME":"([^"]*)"/.exec(result.stdout)?.[1] ?? null;
  return { words, branch, status: result.status, stderr: result.stderr };
}

// What the existing numbering and normalizing script makes of exactly those words: the skill must give
// the same branch, so its quirks (such as doubled hyphens around punctuation) are not this test's to guess.
function referenceBranch(words: string, dir: string): string {
  const output = execFileSync(
    path.join(dir, ".specify/scripts/bash/create-new-feature.sh"),
    ["--json", "--dry-run", "--short-name", words, words],
    { cwd: dir, encoding: "utf8" },
  );
  return /"BRANCH_NAME":"([^"]*)"/.exec(output)![1];
}

describe("speckit-git-branch skill (spec 079)", () => {
  let dir: string;
  beforeAll(() => {
    dir = workspace();
  });
  afterAll(() => fs.rmSync(dir, { recursive: true, force: true }));

  it("has no positional shell names in any skill text, which the skill runner would replace", () => {
    const offenders = fs
      .readdirSync(SKILLS_DIR)
      .map((name) => path.join(SKILLS_DIR, name, "SKILL.md"))
      .filter((file) => fs.existsSync(file))
      .filter((file) => /\$[0-9@*]/.test(fs.readFileSync(file, "utf8")))
      .map((file) => path.relative(ROOT, file));

    expect(offenders).toEqual([]);
  });

  const cases: [string, string, string][] = [
    ["an ordinary description", "Dayparting enforcement in the service", "Dayparting enforcement in"],
    ["two words", "Dayparting enforcement", "Dayparting enforcement"],
    ["one word", "Dayparting", "Dayparting"],
    ["extra spaces and tabs", "  Pace\t\tthe   daily budget  ", "Pace the daily"],
    ["a line break after the words", "Fix the git\nbranch skill", "Fix the git"],
    ["an apostrophe and a double quote", `Fix the skill's "quoted" words`, `Fix the skill's`],
    ["a dollar sign", "Handle $1 and $HOME properly", "Handle $1 and"],
    ["a backtick", "Use `tick` marks in names", "Use `tick` marks"],
    ["unbalanced parentheses", "Fix (the paren handling", "Fix (the paren"],
  ];

  for (const shell of shells()) {
    describe(`under ${shell}`, () => {
      it.each(cases)("picks the first three words for %s", (_name, description, expectedWords) => {
        const result = run(shell, description, dir);

        expect(result.status).toBe(0);
        expect(result.words).toBe(expectedWords);
        expect(result.branch).toMatch(/^002-/);
        expect(result.branch).toBe(referenceBranch(expectedWords, dir));
      });

      it("runs nothing that the description contains (a command substitution and a backtick command)", () => {
        const marker = path.join(dir, `pwned-${path.basename(shell)}`);
        const description = `Run $(touch ${marker}) and \`touch ${marker}\` now`;

        const result = run(shell, description, dir);

        expect(fs.existsSync(marker)).toBe(false);
        expect(result.status).toBe(0);
        expect(result.words).toBe(`Run $(touch ${marker})`.split(/\s+/).slice(0, 3).join(" "));
      });

      it("reports the script's own error for an empty description and creates nothing", () => {
        const result = run(shell, "   ", dir);

        expect(result.branch).toBeNull();
        expect(fs.readdirSync(path.join(dir, "specs"))).toEqual(["001-first-spec"]);
      });
    });
  }
});
