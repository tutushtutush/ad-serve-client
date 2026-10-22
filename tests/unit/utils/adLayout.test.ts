import { AD_LAYOUTS, layoutGeometry, normalizeLayout } from "../../../src/utils/adLayout";

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

  it("drops the logo before the button, and the button last", () => {
    // image-top text box: 40% of the height
    expect(layoutGeometry("image-top", 970, 250)).toMatchObject({ showLogo: true, showCta: true });
    expect(layoutGeometry("image-top", 300, 150)).toMatchObject({ showLogo: false, showCta: true });
    expect(layoutGeometry("image-top", 300, 50)).toMatchObject({ showLogo: false, showCta: false });
  });
});
