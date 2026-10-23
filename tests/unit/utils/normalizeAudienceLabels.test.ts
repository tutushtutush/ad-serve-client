import {
  MAX_AUDIENCE_LABELS,
  MAX_AUDIENCE_LABEL_LENGTH,
  normalizeAudienceLabels,
} from "../../../src/utils/normalizeAudienceLabels";

describe("normalizeAudienceLabels", () => {
  it("trims and lowercases", () => {
    expect(normalizeAudienceLabels([" Follows-Team-X ", "AGE-25-34"])).toEqual(["follows-team-x", "age-25-34"]);
  });

  it("keeps the characters the serving API allows", () => {
    expect(normalizeAudienceLabels(["event:final-2026", "a.b_c", "7up"])).toEqual(["event:final-2026", "a.b_c", "7up"]);
  });

  it.each([1, null, undefined, {}, true, ["nested"]])("drops the non-string entry %p", (bad) => {
    expect(normalizeAudienceLabels([bad, "ok"])).toEqual(["ok"]);
  });

  it.each(["", "   ", "has space", "-lead", "_lead", ".lead", "a/b", "a@b.com", "emoji😀"])("drops the invalid entry %j", (bad) => {
    expect(normalizeAudienceLabels([bad, "ok"])).toEqual(["ok"]);
  });

  it("keeps a label of exactly the maximum length and drops one longer", () => {
    const longest = "a".repeat(MAX_AUDIENCE_LABEL_LENGTH);
    expect(normalizeAudienceLabels([longest])).toEqual([longest]);
    expect(normalizeAudienceLabels([longest + "a"])).toEqual([]);
  });

  it("removes repeats after normalizing and keeps the first position", () => {
    expect(normalizeAudienceLabels(["b", "a", "B", " a "])).toEqual(["b", "a"]);
  });

  it("keeps the first 20 and does not let invalid or repeated entries use up a slot", () => {
    const many = Array.from({ length: 25 }, (_, i) => `x${i}`);
    expect(normalizeAudienceLabels(many)).toEqual(many.slice(0, MAX_AUDIENCE_LABELS));

    const noisy = [...Array.from({ length: 10 }, () => "bad one"), ...Array.from({ length: 10 }, () => "dup"), ...many.slice(0, 19)];
    const result = normalizeAudienceLabels(noisy);
    expect(result).toHaveLength(20);
    expect(result[0]).toBe("dup");
  });

  it.each(["a", 7, null, undefined, { 0: "a" }])("gives an empty list for %p, which is not a list", (value) => {
    expect(normalizeAudienceLabels(value)).toEqual([]);
  });
});
