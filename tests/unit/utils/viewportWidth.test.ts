import { readViewportWidth } from "../../../src/utils/viewportWidth";

describe("readViewportWidth", () => {
  it("returns the window's inner width", () => {
    expect(readViewportWidth({ innerWidth: 1280 })).toBe(1280);
    expect(readViewportWidth({ innerWidth: 0 })).toBe(0);
  });

  it.each([[undefined], [null], ["1280"], [NaN], [Infinity], [-1]])("returns 0 for %j", (value) => {
    expect(readViewportWidth({ innerWidth: value })).toBe(0);
  });

  it("returns 0 when reading the width throws", () => {
    const hostile = {
      get innerWidth(): number {
        throw new Error("blocked");
      },
    };

    expect(readViewportWidth(hostile)).toBe(0);
  });
});
