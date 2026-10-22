import { readFileSync } from "fs";
import { join } from "path";
import { AD_LAYOUTS, classicFit, classicHeadlineLines, layoutGeometry, normalizeLayout, type AdLayout } from "../../../src/utils/adLayout";

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

describe("classicFit (spec 019)", () => {
  it.each([250, 600, 100, 90, 82])("draws classic as before at a height of %i", (height) => {
    expect(classicFit(height)).toBeNull();
  });

  it("drops the logo but keeps the button and one line of headline at 60", () => {
    expect(classicFit(60)).toEqual({ showLogo: false, showCta: true, headlineLines: 1 });
  });

  it("drops the logo and the button at 50 and keeps one line of headline", () => {
    expect(classicFit(50)).toEqual({ showLogo: false, showCta: false, headlineLines: 1 });
  });

  it("changes at a height of 82, the first with room for the logo, headline and button", () => {
    expect(classicFit(81)).not.toBeNull();
    expect(classicFit(82)).toBeNull();
  });

  it.each([0, -5, NaN, Infinity])("draws classic as before for a size of %s", (height) => {
    expect(classicFit(height)).toBeNull();
  });

  it("agrees with the layouts about what fits in the same text box height", () => {
    const geometry = layoutGeometry("text-only", 468, 60)!;
    expect(classicFit(60)).toEqual({ showLogo: geometry.showLogo, showCta: geometry.showCta, headlineLines: geometry.headlineLines });
  });
});

// The Classic table of the shared contract (a copy of adconfig's spec 109 file) is the source of truth for both renderers;
// columns are read by name because the table has one more column than the arrangement table's.
describe("the shared contract's classic table", () => {
  const contract = readFileSync(join(__dirname, "../../../specs/019-classic-fit-short/contracts/classic-fit.md"), "utf8");
  const lines = contract.split("\n").filter((line) => line.startsWith("|"));
  const header = lines[0].split("|").map((cell) => cell.trim());
  const rows = lines
    .slice(2)
    .map((line) => line.split("|").map((cell) => cell.trim()))
    .filter((cells) => cells[1] === "classic" && /^\d+x\d+$/.test(cells[2]))
    .map((cells) => Object.fromEntries(header.map((name, i) => [name, cells[i]])) as Record<string, string>);

  it("has a row for each of the seven standard sizes", () => {
    expect(rows.map((row) => row["Size"])).toEqual(["300x250", "970x250", "300x600", "728x90", "320x100", "468x60", "320x50"]);
  });

  it.each(rows.map((row) => [row["Size"], row] as const))("classic at %s", (size, row) => {
    const height = Number(size.split("x")[1]);
    const fit = classicFit(height);

    expect(fit === null ? "yes" : "no").toBe(row["As before"]);
    expect(String(height - 16)).toBe(row["inner"]);
    if (fit) {
      expect(fit.showLogo ? "yes" : "no").toBe(row["Logo"]);
      expect(fit.showCta ? "yes" : "no").toBe(row["Button"]);
      expect(String(fit.headlineLines)).toBe(row["Headline lines"]);
    }
  });
});

describe("classicHeadlineLines (spec 020)", () => {
  const both = { hasLogo: true, hasCta: true };

  it.each([
    [250, 11],
    [600, 31],
    [90, 1],
    [100, 2],
  ])("allows %i-high ads %i lines with a logo and a button", (height, lines) => {
    expect(classicHeadlineLines(height, both)).toBe(lines);
  });

  it("gives the room of a missing logo or button to the headline", () => {
    expect(classicHeadlineLines(250, { hasLogo: false, hasCta: true })).toBe(12);
    expect(classicHeadlineLines(250, { hasLogo: true, hasCta: false })).toBe(12);
    expect(classicHeadlineLines(100, { hasLogo: false, hasCta: false })).toBe(4);
  });

  it("has no cap at three lines, and never fewer than one", () => {
    expect(classicHeadlineLines(600, both)).toBeGreaterThan(3);
    expect(classicHeadlineLines(82, both)).toBe(1);
  });

  it.each([60, 50, 81])("leaves a short ad (%i) to spec 019's rule", (height) => {
    expect(classicHeadlineLines(height, both)).toBeNull();
  });

  it.each([0, -5, NaN, Infinity])("keeps today's markup for a height of %s", (height) => {
    expect(classicHeadlineLines(height, both)).toBeNull();
  });
});

// The headline table of the shared contract (a copy of adconfig's spec 110 file) is the source of truth for both
// renderers' line counts; columns are read by name and this renderer's own column is "Lines (SDK)".
describe("the shared contract's classic headline table", () => {
  const contract = readFileSync(join(__dirname, "../../../specs/020-classic-headline-clamp/contracts/classic-headline.md"), "utf8");
  const lines = contract.split("\n").filter((line) => line.startsWith("|"));
  const headerAt = lines.findIndex((line) => line.includes("Lines (SDK)"));
  if (headerAt < 0) throw new Error("the classic headline table with a 'Lines (SDK)' column was not found in the contract");
  const header = lines[headerAt].split("|").map((cell) => cell.trim());
  const rows = lines
    .slice(headerAt + 2)
    .map((line) => line.split("|").map((cell) => cell.trim()))
    .filter((cells) => /^\d+x\d+$/.test(cells[1]))
    .map((cells) => Object.fromEntries(header.map((name, i) => [name, cells[i]])) as Record<string, string>);

  it("has a row for each of the five sizes of 82px and over", () => {
    expect(rows.map((row) => row["Size"])).toEqual(["300x250", "970x250", "300x600", "728x90", "320x100"]);
  });

  it.each(rows.map((row) => [row["Size"], row] as const))("classic at %s", (size, row) => {
    const height = Number(size.split("x")[1]);

    expect(String(height - 16)).toBe(row["inner"]);
    expect(classicHeadlineLines(height, { hasLogo: true, hasCta: true })).toBe(Number(row["Lines (SDK)"]));
  });
});
