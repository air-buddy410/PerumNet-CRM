import Link from "next/link";
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronLeft, ChevronRight } from "lucide-react";

export const TABLE_PAGE_SIZES = [10, 20, 50, 100] as const;
export type TablePageSize = (typeof TABLE_PAGE_SIZES)[number];
export type TableDirection = "asc" | "desc";
export type TableQueryValue = string | undefined;
export type TableQuery = Record<string, TableQueryValue>;
export type TableSearchParams = Record<string, string | string[] | undefined>;

export type TableSortOption = {
  value: string;
  label: string;
};

type ParseTableQueryOptions = {
  defaultSort: string;
  defaultDirection?: TableDirection;
  sortOptions: readonly TableSortOption[];
};

export function toTableQuery(searchParams: TableSearchParams): TableQuery {
  return Object.fromEntries(
    Object.entries(searchParams).map(([key, value]) => [
      key,
      Array.isArray(value) ? value[0] : value,
    ]),
  );
}

export function parseTableQuery(
  searchParams: TableSearchParams,
  options: ParseTableQueryOptions,
) {
  const query = toTableQuery(searchParams);
  const requestedPage = Number(query.page);
  const requestedPageSize = Number(query.pageSize);
  const page = Number.isInteger(requestedPage) && requestedPage >= 1 ? requestedPage : 1;
  const pageSize = TABLE_PAGE_SIZES.includes(requestedPageSize as TablePageSize)
    ? requestedPageSize as TablePageSize
    : 20;
  const allowedSort = new Set(options.sortOptions.map((option) => option.value));
  const sort = query.sort && allowedSort.has(query.sort) ? query.sort : options.defaultSort;
  const direction: TableDirection = query.direction === "asc" || query.direction === "desc"
    ? query.direction
    : options.defaultDirection ?? "desc";

  return { query, page, pageSize, sort, direction };
}

export function buildTableHref(
  basePath: string,
  query: TableQuery,
  patch: Record<string, string | number | null | undefined>,
) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value) params.set(key, value);
  }
  for (const [key, value] of Object.entries(patch)) {
    if (value === null || value === undefined || value === "") params.delete(key);
    else params.set(key, String(value));
  }
  const queryString = params.toString();
  return queryString ? `${basePath}?${queryString}` : basePath;
}

function preservedEntries(query: TableQuery, excluded: Set<string>) {
  return Object.entries(query).filter(([key, value]) => !excluded.has(key) && value);
}

export function SortableTableHeader({
  basePath,
  currentDirection,
  currentSort,
  label,
  query,
  sortKey,
}: {
  basePath: string;
  currentDirection: TableDirection;
  currentSort: string;
  label: string;
  query: TableQuery;
  sortKey: string;
}) {
  const active = currentSort === sortKey;
  const nextDirection = active && currentDirection === "asc" ? "desc" : "asc";
  const href = buildTableHref(basePath, query, {
    page: 1,
    sort: sortKey,
    direction: nextDirection,
  });

  return (
    <Link
      href={href}
      className="crm-sortable-header"
      aria-label={`Urutkan berdasarkan ${label} secara ${nextDirection === "asc" ? "menaik" : "menurun"}`}
      aria-sort={active ? currentDirection === "asc" ? "ascending" : "descending" : "none"}
    >
      <span>{label}</span>
      {active ? (
        currentDirection === "asc" ? <ArrowUp aria-hidden="true" /> : <ArrowDown aria-hidden="true" />
      ) : <ArrowUpDown aria-hidden="true" />}
    </Link>
  );
}

export function TableControls({
  basePath,
  direction,
  page,
  pageSize,
  query,
  sort,
  sortOptions,
  total,
}: {
  basePath: string;
  direction: TableDirection;
  page: number;
  pageSize: TablePageSize;
  query: TableQuery;
  sort: string;
  sortOptions: readonly TableSortOption[];
  total: number;
}) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const currentPage = Math.min(page, totalPages);
  const first = total === 0 ? 0 : (currentPage - 1) * pageSize + 1;
  const last = Math.min(currentPage * pageSize, total);
  const pageSizeQuery = preservedEntries(query, new Set(["page", "pageSize"]));
  const sortQuery = preservedEntries(query, new Set(["page", "pageSize", "sort", "direction"]));
  const previousHref = buildTableHref(basePath, query, { page: Math.max(1, currentPage - 1) });
  const nextHref = buildTableHref(basePath, query, { page: Math.min(totalPages, currentPage + 1) });

  return (
    <div className="crm-table-controls" aria-label="Kontrol tabel">
      <p className="crm-table-controls-summary">
        Menampilkan <strong>{first}–{last}</strong> dari <strong>{total}</strong> data
      </p>
      <div className="crm-table-controls-forms">
        <form method="get" action={basePath} className="crm-table-control-form">
          {pageSizeQuery.map(([key, value]) => <input key={key} type="hidden" name={key} value={value} />)}
          <input type="hidden" name="page" value="1" />
          <label htmlFor={`${basePath}-page-size`}>Tampilkan</label>
          <select id={`${basePath}-page-size`} name="pageSize" defaultValue={String(pageSize)} aria-label="Jumlah data per halaman">
            {TABLE_PAGE_SIZES.map((size) => <option key={size} value={size}>{size} data</option>)}
          </select>
          <button type="submit" className="btn-secondary">Terapkan</button>
        </form>
        {sortOptions.length > 0 && (
          <form method="get" action={basePath} className="crm-table-control-form crm-table-sort-mobile">
            {sortQuery.map(([key, value]) => <input key={key} type="hidden" name={key} value={value} />)}
            <input type="hidden" name="page" value="1" />
            <input type="hidden" name="pageSize" value={pageSize} />
            <label htmlFor={`${basePath}-sort`}>Urutkan</label>
            <select id={`${basePath}-sort`} name="sort" defaultValue={sort} aria-label="Kolom pengurutan">
              {sortOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
            <select name="direction" defaultValue={direction} aria-label="Arah pengurutan">
              <option value="desc">Terbaru / Z–A</option>
              <option value="asc">Terlama / A–Z</option>
            </select>
            <button type="submit" className="btn-secondary">Urutkan</button>
          </form>
        )}
      </div>
      <nav className="crm-table-pagination" aria-label="Navigasi halaman tabel">
        {currentPage > 1 ? (
          <Link href={previousHref} className="btn-secondary" aria-label="Halaman sebelumnya">
            <ChevronLeft aria-hidden="true" /> Sebelumnya
          </Link>
        ) : (
          <span className="btn-secondary is-disabled" aria-disabled="true"><ChevronLeft aria-hidden="true" /> Sebelumnya</span>
        )}
        <span className="crm-table-page-indicator">Halaman {currentPage} dari {totalPages}</span>
        {currentPage < totalPages ? (
          <Link href={nextHref} className="btn-secondary" aria-label="Halaman berikutnya">
            Berikutnya <ChevronRight aria-hidden="true" />
          </Link>
        ) : (
          <span className="btn-secondary is-disabled" aria-disabled="true">Berikutnya <ChevronRight aria-hidden="true" /></span>
        )}
      </nav>
    </div>
  );
}
