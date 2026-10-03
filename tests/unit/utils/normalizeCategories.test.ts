import { MAX_CATEGORIES, normalizeCategories } from "../../../src/utils/normalizeCategories";

describe("normalizeCategories", () => {
  it("keeps valid entries in order", () => {
    expect(normalizeCategories(["music", "IAB1-6"])).toEqual(["music", "IAB1-6"]);
  });

  it("trims entries and drops blank ones", () => {
    expect(normalizeCategories(["  music ", "", "   "])).toEqual(["music"]);
  });

  it("drops entries that are not strings", () => {
    expect(normalizeCategories(["music", 5, null, undefined, {}, ["x"]])).toEqual(["music"]);
  });

  it("removes duplicates ignoring case and keeps the first spelling", () => {
    expect(normalizeCategories(["Music", "music", "MUSIC", "sports"])).toEqual(["Music", "sports"]);
  });

  it("caps the list at MAX_CATEGORIES", () => {
    const many = Array.from({ length: 25 }, (_, i) => `cat${i}`);

    const result = normalizeCategories(many);

    expect(result).toHaveLength(MAX_CATEGORIES);
    expect(result[0]).toBe("cat0");
  });

  it("returns an empty list for anything that is not an array", () => {
    expect(normalizeCategories(undefined)).toEqual([]);
    expect(normalizeCategories("music")).toEqual([]);
    expect(normalizeCategories({ 0: "music" })).toEqual([]);
  });

  it("returns an empty list for an empty array", () => {
    expect(normalizeCategories([])).toEqual([]);
  });
});
