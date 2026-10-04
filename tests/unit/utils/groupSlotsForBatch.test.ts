import { groupSlotsForBatch } from "../../../src/utils/groupSlotsForBatch";

interface Item {
  id: string;
  key: string;
}

const item = (id: string, key: string): Item => ({ id, key });
const keyOf = (value: Item) => value.key;
const ids = (groups: Item[][]) => groups.map((group) => group.map((value) => value.id));

describe("groupSlotsForBatch", () => {
  it("returns no groups for no items", () => {
    expect(groupSlotsForBatch([], keyOf, 50)).toEqual([]);
  });

  it("groups items that share a key, keeping discovery order inside each group", () => {
    const groups = groupSlotsForBatch(
      [item("1", "music"), item("2", "comedy"), item("3", "music"), item("4", "comedy")],
      keyOf,
      50,
    );

    expect(ids(groups)).toEqual([
      ["1", "3"],
      ["2", "4"],
    ]);
  });

  it("orders groups by where their first item was found", () => {
    const groups = groupSlotsForBatch([item("1", "b"), item("2", "a"), item("3", "b")], keyOf, 50);

    expect(ids(groups)).toEqual([["1", "3"], ["2"]]);
  });

  it("splits a group into chunks of at most the chunk size, in order", () => {
    const items = Array.from({ length: 5 }, (_, index) => item(String(index), "same"));

    expect(ids(groupSlotsForBatch(items, keyOf, 2))).toEqual([["0", "1"], ["2", "3"], ["4"]]);
  });

  it("fills a chunk to exactly the chunk size without an empty trailing chunk", () => {
    const items = Array.from({ length: 4 }, (_, index) => item(String(index), "same"));

    expect(ids(groupSlotsForBatch(items, keyOf, 2))).toEqual([["0", "1"], ["2", "3"]]);
  });

  it("keeps different keys apart even when each is small", () => {
    expect(ids(groupSlotsForBatch([item("1", "a"), item("2", "b")], keyOf, 50))).toEqual([["1"], ["2"]]);
  });
});
