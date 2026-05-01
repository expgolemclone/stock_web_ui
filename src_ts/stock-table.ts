/**
 * Generic stock table renderer.
 *
 * Initialise via `StockTable.init(config)` after the DOM is ready.
 * Each page supplies a config object that declares columns, data
 * sources, metric thresholds, and optional tab/position behaviour.
 */

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export type SortDirection = "asc" | "desc";

export interface MetricThreshold {
  good?: (v: number) => boolean;
  bad?: (v: number) => boolean;
}

export type ColumnType = "text" | "num" | "code" | "name" | "links" | "position";

export interface ColumnDef {
  key: string;
  header: string;
  title?: string;
  type: ColumnType;
  render: (row: Record<string, unknown>) => string;
  sortValue?: (row: Record<string, unknown>) => number | null;
  cssClass?: string;
  url?: string;
  browserKey?: string;
  isPosition?: boolean;
  toggleable?: boolean;
}

export interface StockTableConfig {
  defaultTitle: string;
  dataUrl: string;
  columns: ColumnDef[];
  metricThresholds: Record<string, MetricThreshold>;
  defaultSortKey: string;
  defaultSortDirection: SortDirection;
  tabMode?: boolean;
  defaultTabKey?: string;
  githubPages?: boolean;
}

interface StockRow {
  code?: string;
  name?: string;
  _tabKey?: string;
  _tabName?: string;
  [key: string]: unknown;
}

interface State {
  rows: StockRow[] | null;
  currentTab: string;
  sortKey: string;
  sortDir: SortDirection;
  hiddenCols: Set<string>;
  loading: boolean;
  error: string;
}

interface Elements {
  tabBar: HTMLElement | null;
  status: HTMLElement | null;
  thead: HTMLTableSectionElement | null;
  tbody: HTMLElement | null;
  toggleBar: HTMLElement | null;
}

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const ASC_ARROW = "\u25B2";
const DESC_ARROW = "\u25BC";
const INACTIVE_ARROW = "\u25BD";
const HIDDEN_COLUMNS_KEY = "hiddenColumns";

/* ------------------------------------------------------------------ */
/*  State                                                              */
/* ------------------------------------------------------------------ */

let _config: StockTableConfig | null = null;

const _state: State = {
  rows: null,
  currentTab: "",
  sortKey: "",
  sortDir: "asc",
  hiddenCols: new Set(),
  loading: true,
  error: "",
};

const _el: Elements = {
  tabBar: null,
  status: null,
  thead: null,
  tbody: null,
  toggleBar: null,
};

/* ------------------------------------------------------------------ */
/*  Public API                                                         */
/* ------------------------------------------------------------------ */

export const StockTable = { init };

/* ------------------------------------------------------------------ */
/*  Initialisation                                                     */
/* ------------------------------------------------------------------ */

function init(config: StockTableConfig): void {
  _config = config;
  _state.sortKey = config.defaultSortKey;
  _state.sortDir = config.defaultSortDirection;
  _state.hiddenCols = _loadHiddenCols();

  _el.tabBar = document.getElementById("tabBar");
  _el.status = document.getElementById("statusMessage");
  _el.thead = document.querySelector("#stockTable > thead");
  _el.tbody = document.getElementById("tbody");
  _el.toggleBar = document.getElementById("toggleBar");

  _renderHead();
  _renderToggleChips();
  _bindEvents();
  _render();
  void _loadData();
}

/* ------------------------------------------------------------------ */
/*  Data loading                                                       */
/* ------------------------------------------------------------------ */

async function _loadData(): Promise<void> {
  if (!_config) {
    return;
  }

  try {
    const response: Response = await fetch(_config.dataUrl, { cache: "no-store" });
    if (!response.ok) {
      throw new Error("HTTP " + response.status);
    }
    const raw: unknown = await response.json();
    _state.rows = _normalizeRows(raw);
    _state.loading = false;
    _state.error = "";

    if (_config.tabMode && _state.rows.length > 0 && _state.rows[0]._tabKey !== undefined) {
      _state.currentTab = _resolveDefaultTab(_state.rows);
    }

    _render();
  } catch (err) {
    console.error(err);
    _state.loading = false;
    _state.error = "データを読み込めませんでした。";
    _render();
  }
}

/* ------------------------------------------------------------------ */
/*  Normalisation                                                      */
/* ------------------------------------------------------------------ */

/**
 * Accepts two shapes:
 *   1) Flat array  →  [{ code, name, … }, …]
 *   2) Tab object  →  { watch: { name, stocks: […] }, … }
 *
 * Tab rows receive a `_tabKey` property so the renderer can filter.
 */
function _normalizeRows(raw: unknown): StockRow[] {
  if (Array.isArray(raw)) {
    return raw as StockRow[];
  }

  if (raw && typeof raw === "object") {
    const result: StockRow[] = [];
    for (const [tabKey, ds] of Object.entries(raw as Record<string, unknown>)) {
      const dataset = ds as { name?: string; stocks?: unknown[] } | null;
      if (!dataset || !Array.isArray(dataset.stocks)) {
        continue;
      }
      for (const stock of dataset.stocks) {
        const row = stock as StockRow;
        row._tabKey = tabKey;
        row._tabName = dataset.name || tabKey;
        result.push(row);
      }
    }
    return result;
  }

  return [];
}

function _resolveDefaultTab(rows: StockRow[]): string {
  if (!_config) {
    return "";
  }
  const keys: string[] = [];
  const seen: Record<string, boolean> = {};
  for (const r of rows) {
    if (r._tabKey && !seen[r._tabKey]) {
      seen[r._tabKey] = true;
      keys.push(r._tabKey);
    }
  }
  if (_config.defaultTabKey && seen[_config.defaultTabKey]) {
    return _config.defaultTabKey;
  }
  return keys.length > 0 ? keys[0] : "";
}

/* ------------------------------------------------------------------ */
/*  Rendering                                                          */
/* ------------------------------------------------------------------ */

function _render(): void {
  _renderTabs();
  _renderSortButtons();
  _renderToggleChips();

  if (_state.loading) {
    document.title = _config ? _config.defaultTitle : "";
    _el.status!.textContent = "データを読み込み中です。";
    _renderMessageRow("データを読み込み中です。");
    return;
  }

  if (_state.error) {
    document.title = _config ? _config.defaultTitle : "";
    _el.status!.textContent = _state.error;
    _renderMessageRow(_state.error);
    return;
  }

  const visible: StockRow[] = _getVisibleRows();
  const tabName: string = _getActiveTabName();
  document.title = tabName ? tabName + " - " + _config!.defaultTitle : _config!.defaultTitle;
  _el.status!.textContent = visible.length.toLocaleString("ja-JP") + " 件";

  if (visible.length === 0) {
    _renderMessageRow("該当する銘柄はありません。");
    return;
  }

  _renderBody(visible);
}

function _renderHead(): void {
  if (!_el.thead) {
    return;
  }
  const tr: HTMLTableRowElement = _el.thead.querySelector("tr") || document.createElement("tr");
  tr.innerHTML = "";

  for (const col of _config ? _config.columns : []) {
    const th: HTMLTableCellElement = document.createElement("th");
    th.scope = "col";
    if (col.title) {
      th.title = col.title;
    }
    if (col.isPosition) {
      th.className = "column-position";
    }
    th.dataset.columnKey = col.key;

    const btn: HTMLButtonElement = document.createElement("button");
    btn.type = "button";
    btn.className = "sort-button";
    btn.dataset.sortColumn = col.key;
    btn.textContent = col.header + " ";
    const arrow: HTMLSpanElement = document.createElement("span");
    arrow.className = "arrow";
    arrow.setAttribute("aria-hidden", "true");
    arrow.textContent = INACTIVE_ARROW;
    btn.appendChild(arrow);
    th.appendChild(btn);
    tr.appendChild(th);
  }

  if (!_el.thead.contains(tr)) {
    _el.thead.appendChild(tr);
  }
}

function _renderBody(rows: StockRow[]): void {
  if (!_el.tbody || !_config) {
    return;
  }
  const cols: ColumnDef[] = _config.columns;
  const hidden: Set<string> = _state.hiddenCols;
  const isGhPages: boolean = !!_config.githubPages;

  _el.tbody.innerHTML = rows.map(function (row: StockRow): string {
    const cells: string[] = cols.map(function (col: ColumnDef): string {
      const hiddenCls: string = hidden.has(col.key) ? " hidden-col" : "";
      const baseCls: string = col.cssClass || "";
      const extraCls: string = _metricCls(col, row);

      if (col.type === "code") {
        const monexUrl: string = "https://monex.ifis.co.jp/index.php?sa=report_zaimu&bcode=" + encodeURIComponent(row.code || "");
        return '<td class="code' + hiddenCls + '"><a href="' + monexUrl + '" target="_blank" rel="noopener" data-browser="monex">' + escapeHtml(String(row.code || "")) + "</a></td>";
      }

      if (col.type === "name") {
        const shikihoUrl: string = "https://shikiho.toyokeizai.net/stocks/" + encodeURIComponent(row.code || "") + "/shikiho";
        const nameHref: string = isGhPages ? shikihoUrl : "/open-yazi/" + encodeURIComponent(row.code || "");
        const nameExtra: string = isGhPages ? "" : " data-yazi";
        return '<td class="name' + hiddenCls + '"><a href="' + nameHref + '" target="_blank" rel="noopener"' + nameExtra + '>' + escapeHtml(col.render(row)) + "</a></td>";
      }

      return '<td class="' + baseCls + hiddenCls + extraCls + '">' + col.render(row) + "</td>";
    });
    return "<tr>" + cells.join("") + "</tr>";
  }).join("");
}

function _renderMessageRow(message: string): void {
  if (!_el.tbody || !_config) {
    return;
  }
  const visibleCount: number = _config.columns.length - _state.hiddenCols.size;
  _el.tbody.innerHTML = '<tr><td class="table-message" colspan="' + visibleCount + '">' + escapeHtml(message) + "</td></tr>";
}

function _renderTabs(): void {
  if (!_el.tabBar || !_config || !_config.tabMode || !_state.rows) {
    if (_el.tabBar) {
      _el.tabBar.innerHTML = "";
    }
    return;
  }

  const tabMap: Record<string, string> = {};
  for (const r of _state.rows) {
    if (r._tabKey && !tabMap[r._tabKey]) {
      tabMap[r._tabKey] = r._tabName || r._tabKey;
    }
  }
  const entries: [string, string][] = Object.entries(tabMap);

  _el.tabBar.innerHTML = entries.map(function (pair: [string, string]): string {
    const isActive: boolean = pair[0] === _state.currentTab;
    return '<button class="tab' + (isActive ? " active" : "") + '" type="button" data-tab-key="' + escapeHtml(pair[0]) + '" aria-selected="' + String(isActive) + '">' + escapeHtml(pair[1]) + "</button>";
  }).join("");
}

function _renderSortButtons(): void {
  if (!_el.thead) {
    return;
  }
  _el.thead.querySelectorAll(".sort-button").forEach(function (btn: Element): void {
    const key: string | undefined = (btn as HTMLButtonElement).dataset.sortColumn;
    const isActive: boolean = _state.sortKey === key;
    const arrow: Element | null = btn.querySelector(".arrow");
    if (arrow) {
      arrow.textContent = isActive ? (_state.sortDir === "asc" ? ASC_ARROW : DESC_ARROW) : INACTIVE_ARROW;
    }
    btn.classList.toggle("active", isActive);
    const th: HTMLElement | null = btn.closest("th");
    if (th) {
      th.setAttribute("aria-sort", isActive ? (_state.sortDir === "asc" ? "ascending" : "descending") : "none");
    }
  });
}

function _renderToggleChips(): void {
  if (!_el.toggleBar || !_config) {
    return;
  }
  const toggleable: ColumnDef[] = _config.columns.filter(function (c: ColumnDef): boolean { return !!c.toggleable; });

  _el.toggleBar.innerHTML = toggleable.map(function (col: ColumnDef): string {
    const isActive: boolean = !_state.hiddenCols.has(col.key);
    return '<button class="toggle-chip' + (isActive ? " active" : "") + '" type="button" data-toggle-column="' + escapeHtml(col.key) + '">' + escapeHtml(col.header) + "</button>";
  }).join("");
}

/* ------------------------------------------------------------------ */
/*  Metric colouring                                                   */
/* ------------------------------------------------------------------ */

function _metricCls(col: ColumnDef, row: StockRow): string {
  if (!_config) {
    return "";
  }
  const t: MetricThreshold | undefined = _config.metricThresholds[col.key];
  if (!t) {
    return "";
  }
  const raw: number | null | undefined = col.sortValue ? col.sortValue(row) : null;
  if (raw === null || raw === undefined) {
    return "";
  }
  if (t.good && t.good(raw)) {
    return " metric-good";
  }
  if (t.bad && t.bad(raw)) {
    return " metric-bad";
  }
  return "";
}

/* ------------------------------------------------------------------ */
/*  Sorting & filtering                                                */
/* ------------------------------------------------------------------ */

function _getVisibleRows(): StockRow[] {
  if (!_state.rows || !_config) {
    return [];
  }
  let rows: StockRow[] = _state.rows;

  if (_config.tabMode && _state.currentTab) {
    rows = rows.filter(function (r: StockRow): boolean { return r._tabKey === _state.currentTab; });
  }

  return rows.slice().sort(function (a: StockRow, b: StockRow): number {
    const col: ColumnDef | null = _findColumn(_state.sortKey);
    if (!col || !col.sortValue) {
      return 0;
    }
    const av: number | null = col.sortValue(a);
    const bv: number | null = col.sortValue(b);
    const dir: number = _state.sortDir === "asc" ? 1 : -1;

    if (av === null && bv === null) {
      return (a.code || "").localeCompare(b.code || "", "ja", { numeric: true });
    }
    if (av === null) {
      return 1;
    }
    if (bv === null) {
      return -1;
    }
    return (av - bv) * dir;
  });
}

function _getActiveTabName(): string {
  if (!_state.rows || !_state.currentTab) {
    return "";
  }
  const row: StockRow | undefined = _state.rows.find(function (r: StockRow): boolean { return r._tabKey === _state.currentTab; });
  return row ? row._tabName || "" : "";
}

function _findColumn(key: string): ColumnDef | null {
  if (!_config) {
    return null;
  }
  for (const col of _config.columns) {
    if (col.key === key) {
      return col;
    }
  }
  return null;
}

/* ------------------------------------------------------------------ */
/*  Event binding                                                      */
/* ------------------------------------------------------------------ */

function _bindEvents(): void {
  /* sort buttons */
  document.addEventListener("click", function (e: MouseEvent): void {
    const btn: Element | null = e.target instanceof Element ? e.target.closest(".sort-button") : null;
    if (!btn) {
      return;
    }
    const key: string | undefined = (btn as HTMLButtonElement).dataset.sortColumn;
    if (!key) {
      return;
    }
    if (_state.sortKey === key) {
      _state.sortDir = _state.sortDir === "asc" ? "desc" : "asc";
    } else {
      _state.sortKey = key;
      _state.sortDir = key === _config!.defaultSortKey ? _config!.defaultSortDirection : "asc";
    }
    _render();
  });

  /* toggle chips */
  if (_el.toggleBar) {
    _el.toggleBar.addEventListener("click", function (e: MouseEvent): void {
      const chip: Element | null = e.target instanceof Element ? e.target.closest("[data-toggle-column]") : null;
      if (!chip) {
        return;
      }
      const col: string | undefined = (chip as HTMLElement).dataset.toggleColumn;
      if (!col) {
        return;
      }
      if (_state.hiddenCols.has(col)) {
        _state.hiddenCols.delete(col);
      } else {
        _state.hiddenCols.add(col);
      }
      _saveHiddenCols(_state.hiddenCols);
      _render();
    });
  }

  /* tabs */
  if (_el.tabBar) {
    _el.tabBar.addEventListener("click", function (e: MouseEvent): void {
      const tab: Element | null = e.target instanceof Element ? e.target.closest("[data-tab-key]") : null;
      if (!tab) {
        return;
      }
      const key: string | undefined = (tab as HTMLElement).dataset.tabKey;
      if (!key) {
        return;
      }
      _state.currentTab = key;
      _state.sortKey = _config ? _config.defaultSortKey : "";
      _state.sortDir = _config ? _config.defaultSortDirection : "asc";
      _render();
    });
  }

  /* browser link interception */
  document.addEventListener("click", function (e: MouseEvent): void {
    const link: Element | null = e.target instanceof Element ? e.target.closest("a[data-browser]") : null;
    if (!link) {
      return;
    }
    const browserKey: string = (link as HTMLAnchorElement).getAttribute("data-browser") || "";
    const url: string = (link as HTMLAnchorElement).href;
    e.preventDefault();
    fetch("/open?browser=" + encodeURIComponent(browserKey) + "&url=" + encodeURIComponent(url))
      .then(function (response: Response): void {
        if (!response.ok) {
          window.open(url, "_blank", "noopener");
        }
      })
      .catch(function (): void {
        window.open(url, "_blank", "noopener");
      });
  });

  /* yazi link interception */
  document.addEventListener("click", function (e: MouseEvent): void {
    const link: Element | null = e.target instanceof Element ? e.target.closest("a[data-yazi]") : null;
    if (!link) {
      return;
    }
    e.preventDefault();
    fetch((link as HTMLAnchorElement).href).catch(function (): void { /* ignore */ });
  });
}

/* ------------------------------------------------------------------ */
/*  LocalStorage helpers                                               */
/* ------------------------------------------------------------------ */

function _loadHiddenCols(): Set<string> {
  try {
    const stored: string | null = localStorage.getItem(HIDDEN_COLUMNS_KEY);
    if (stored) {
      return new Set(JSON.parse(stored) as string[]);
    }
  } catch (_e) {
    localStorage.removeItem(HIDDEN_COLUMNS_KEY);
  }
  return new Set();
}

function _saveHiddenCols(cols: Set<string>): void {
  try {
    localStorage.setItem(HIDDEN_COLUMNS_KEY, JSON.stringify(Array.from(cols)));
  } catch (_e) {
    /* storage full or blocked → silently degrade */
  }
}

/* ------------------------------------------------------------------ */
/*  Utilities                                                          */
/* ------------------------------------------------------------------ */

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
