import { readFileSync } from "fs";
import { join } from "path";
import { AD_LAYOUTS, layoutGeometry, normalizeLayout, type AdLayout } from "../../../src/utils/adLayout";

describe("normalizeLayout", () => {
  it.each(AD_LAYOUTS)("keeps %s", (name) => {
    expect(normalizeLayout(name)).toBe(name);
  });

  it.each([
    undefined,
    null,
    "",
    "IMAGE-LEFT",
    " image-left",
    5,
    {},
    [],
    ["image-left"],
    "constructor",
    "__proto__",
    "toString",
    '"><script>alert(1)</script>',
    "x".repeat(10_000),
  ])("treats %j as classic", (value) => {
    expect(normalizeLayout(value)).toBe("classic");
  });
});

describe("layoutGeometry", () => {
  it("has no geometry for classic", () => {
    expect(layoutGeometry("classic", 300, 250)).toBeNull();
  });

  it.each([0, -1, NaN, Infinity])("has no geometry for a size of %s", (size) => {
    expect(layoutGeometry("image-left", size, 250)).toBeNull();
    expect(layoutGeometry("image-left", 300, size)).toBeNull();
  });

  it("puts the image on the left half and the text on the right half", () => {
    const geometry = layoutGeometry("image-left", 300, 250);
    expect(geometry?.image).toEqual({ left: 0, top: 0, width: 50, height: 100 });
    expect(geometry?.text).toEqual({ left: 50, top: 0, width: 50, height: 100 });
    expect(geometry).toMatchObject({ centered: false, scrim: false, showPlaceholder: true });
  });

  it("stacks image-left like image-top on a tall ad", () => {
    expect(layoutGeometry("image-left", 300, 600)).toEqual(layoutGeometry("image-top", 300, 600));
  });

  it("puts the image on top for 60% of the height", () => {
    const geometry = layoutGeometry("image-top", 300, 250);
    expect(geometry?.image).toEqual({ left: 0, top: 0, width: 100, height: 60 });
    expect(geometry?.text).toEqual({ left: 0, top: 60, width: 100, height: 40 });
    expect(geometry?.showPlaceholder).toBe(true);
  });

  it("centers text over a full-size image on a scrim, with no placeholder", () => {
    const geometry = layoutGeometry("overlay", 300, 250);
    expect(geometry).toMatchObject({ centered: true, scrim: true, showPlaceholder: false });
    expect(geometry?.image).toEqual({ left: 0, top: 0, width: 100, height: 100 });
  });

  it("has no image for text only", () => {
    expect(layoutGeometry("text-only", 300, 250)).toMatchObject({
      image: null,
      centered: true,
      scrim: false,
      showPlaceholder: false,
    });
  });

  it("draws image-top side by side on a short ad, and image-left stacked on a tall one", () => {
    expect(layoutGeometry("image-top", 728, 90)).toEqual(layoutGeometry("image-left", 728, 90));
    expect(layoutGeometry("image-top", 320, 100)?.image?.height).toBe(60);
    expect(layoutGeometry("image-left", 300, 600)).toEqual(layoutGeometry("image-top", 300, 600));
  });

  it("drops the logo first, then the button, and always keeps room for one headline line", () => {
    expect(layoutGeometry("overlay", 300, 90)).toMatchObject({ showLogo: true, showCta: true, headlineLines: 1 });
    expect(layoutGeometry("overlay", 300, 70)).toMatchObject({ showLogo: false, showCta: true });
    expect(layoutGeometry("overlay", 300, 50)).toMatchObject({ showLogo: false, showCta: false });
    expect(layoutGeometry("overlay", 300, 20)).toMatchObject({ showCta: false, headlineLines: 1 });
  });

  it("gives the headline the lines left over once the logo and button are placed", () => {
    expect(layoutGeometry("overlay", 300, 100)?.headlineLines).toBe(2);
    expect(layoutGeometry("overlay", 300, 250)?.headlineLines).toBe(3);
  });
});

// The table in the shared contract is the source of truth for every repo's renderer.
describe("the shared contract's arrangement table", () => {
  const contract = readFileSync(
    join(__dirname, "../../../specs/018-ad-layout-presets/contracts/resolved-render.md"),
    "utf8",
  );
  const rows = contract
    .split("\n")
    .map((line) => line.split("|").map((cell) => cell.trim()))
    .filter((cells) => cells.length === 8 && /^\d+x\d+$/.test(cells[2]))
    .map(([, layout, size, arrangement, logo, button, lines]) => ({ layout, size, arrangement, logo, button, lines }));

  const arrangementOf = (geometry: NonNullable<ReturnType<typeof layoutGeometry>>) =>
    geometry.image === null
      ? "no image"
      : geometry.image.width === 50
        ? "side by side"
        : geometry.image.height === 60
          ? "stacked"
          : "full";

  it("has a row for every layout and size it describes", () => {
    expect(rows).toHaveLength(28);
  });

  it.each(rows.map((row) => [`${row.layout} at ${row.size}`, row] as const))("%s", (_name, row) => {
    const [width, height] = row.size.split("x").map(Number);
    const geometry = layoutGeometry(row.layout as AdLayout, width, height)!;

    expect(arrangementOf(geometry)).toBe(row.arrangement);
    expect(geometry.showLogo ? "yes" : "no").toBe(row.logo);
    expect(geometry.showCta ? "yes" : "no").toBe(row.button);
    expect(String(geometry.headlineLines)).toBe(row.lines);
  });
});
