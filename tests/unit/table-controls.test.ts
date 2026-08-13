import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { buildTableHref, parseTableQuery, type TableSortOption } from "@/components/table-controls";

const sortOptions: readonly TableSortOption[] = [
  { value: "createdAt", label: "Terbaru" },
  { value: "name", label: "Nama" },
];

describe("table query controls", () => {
  test("normalizes invalid page, size, sort, and direction", () => {
    const query = parseTableQuery(
      { page: "0", pageSize: "25", sort: "unsafeField", direction: "sideways" },
      { defaultSort: "createdAt", sortOptions },
    );

    assert.equal(query.page, 1);
    assert.equal(query.pageSize, 20);
    assert.equal(query.sort, "createdAt");
    assert.equal(query.direction, "desc");
  });

  test("accepts whitelisted values and preserves array query values", () => {
    const query = parseTableQuery(
      { page: ["3"], pageSize: ["50"], sort: ["name"], direction: ["asc"], status: ["OPEN"] },
      { defaultSort: "createdAt", sortOptions },
    );

    assert.deepEqual(query, {
      query: { page: "3", pageSize: "50", sort: "name", direction: "asc", status: "OPEN" },
      page: 3,
      pageSize: 50,
      sort: "name",
      direction: "asc",
    });
  });

  test("builds links while resetting or preserving query state", () => {
    const query = { page: "4", pageSize: "20", sort: "createdAt", direction: "desc", status: "OPEN" };

    assert.equal(
      buildTableHref("/tickets", query, { page: 1, sort: "name", direction: "asc" }),
      "/tickets?page=1&pageSize=20&sort=name&direction=asc&status=OPEN",
    );
    assert.equal(
      buildTableHref("/tickets", query, { page: 1, pageSize: 50 }),
      "/tickets?page=1&pageSize=50&sort=createdAt&direction=desc&status=OPEN",
    );
  });
});
