import { parseBreakpointList, pickByBreakpoint } from "../../../src/utils/breakpointList";

describe("parseBreakpointList", () => {
  it("parses minWidth:value pairs in order", () => {
    expect(parseBreakpointList("0:small,768:large")).toEqual([
      { minWidth: 0, value: "small" },
      { minWidth: 768, value: "large" },
    ]);
  });

  it("trims whitespace around widths and values", () => {
    expect(parseBreakpointList(" 0 : small , 768 : large ")).toEqual([
      { minWidth: 0, value: "small" },
      { minWidth: 768, value: "large" },
    ]);
  });

  it("splits at the first colon so a value may contain colons", () => {
    expect(parseBreakpointList("0:a:b")).toEqual([{ minWidth: 0, value: "a:b" }]);
  });

  it.each([["abc:x"], ["-5:x"], ["1.5:x"], [":x"], ["768:"], ["768: "], ["nocolon"], [""], [",,"]])(
    "drops the malformed entry %j",
    (raw) => {
      expect(parseBreakpointList(raw)).toEqual([]);
    },
  );

  it("keeps valid entries next to malformed ones", () => {
    expect(parseBreakpointList("abc:x,768:large,-5:y")).toEqual([{ minWidth: 768, value: "large" }]);
  });

  it("returns an empty list for null and undefined", () => {
    expect(parseBreakpointList(null)).toEqual([]);
    expect(parseBreakpointList(undefined)).toEqual([]);
  });
});

describe("pickByBreakpoint", () => {
  const entries = parseBreakpointList("0:phone,768:tablet,1024:desktop");

  it("picks the largest minimum width not above the width", () => {
    expect(pickByBreakpoint(entries, 390)).toBe("phone");
    expect(pickByBreakpoint(entries, 900)).toBe("tablet");
    expect(pickByBreakpoint(entries, 1280)).toBe("desktop");
  });

  it("treats a minimum width as inclusive", () => {
    expect(pickByBreakpoint(entries, 768)).toBe("tablet");
    expect(pickByBreakpoint(entries, 767)).toBe("phone");
    expect(pickByBreakpoint(entries, 1024)).toBe("desktop");
  });

  it("does not depend on entry order", () => {
    expect(pickByBreakpoint(parseBreakpointList("1024:desktop,0:phone,768:tablet"), 900)).toBe("tablet");
  });

  it("lets the first listed entry win when widths tie", () => {
    expect(pickByBreakpoint(parseBreakpointList("768:first,768:second"), 800)).toBe("first");
  });

  it("returns undefined when the width is below every minimum", () => {
    expect(pickByBreakpoint(parseBreakpointList("768:tablet"), 390)).toBeUndefined();
  });

  it("returns undefined for an empty list", () => {
    expect(pickByBreakpoint([], 1280)).toBeUndefined();
  });
});
