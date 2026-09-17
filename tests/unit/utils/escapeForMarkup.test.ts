import { escapeForMarkup } from "../../../src/utils/escapeForMarkup";

describe("escapeForMarkup", () => {
  it("escapes &", () => {
    expect(escapeForMarkup("a & b")).toBe("a &amp; b");
  });

  it("escapes <", () => {
    expect(escapeForMarkup("<script>")).toBe("&lt;script&gt;");
  });

  it("escapes >", () => {
    expect(escapeForMarkup("a > b")).toBe("a &gt; b");
  });

  it('escapes "', () => {
    expect(escapeForMarkup('say "hi"')).toBe("say &quot;hi&quot;");
  });

  it("escapes '", () => {
    expect(escapeForMarkup("it's")).toBe("it&#39;s");
  });

  it("does not double-escape & from entities introduced by other replacements", () => {
    expect(escapeForMarkup("<>&\"'")).toBe("&lt;&gt;&amp;&quot;&#39;");
  });

  it("leaves plain text untouched", () => {
    expect(escapeForMarkup("Summer Sale")).toBe("Summer Sale");
  });
});
