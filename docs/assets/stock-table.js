/**
 * Generic stock table renderer.
 *
 * Initialise via `StockTable.init(config)` after the DOM is ready.
 * Each page supplies a config object that declares columns, data
 * sources, metric thresholds, and optional tab/position behaviour.
 *
 * @module StockTable
 */
"use strict";

/* ------------------------------------------------------------------ */
/*  Types (JSDoc)                                                     */
/* ------------------------------------------------------------------ */

/**
 * @typedef {"asc" | "desc"} SortDirection
 */

/**
 * @typedef {Object} MetricThreshold
 * @property {function(number): boolean} [good]
 * @property {function(number): boolean} [bad]
 */

/**
 * @typedef {Object} ColumnDef
 * @property {string} key          - unique identifier used in sort / toggle
 * @property {string} header       - column header label
 * @property {string} [title]      - tooltip text
 * @property {"text" | "num" | "code" | "name" | "links" | "position"} type
 * @property {function(Object): string} render  - (row) → formatted cell content
 * @property {function(Object): (number|null)} [sortValue] - (row) → numeric value for sorting
 * @property {string} [cssClass]   - extra CSS class for <td>
 * @property {string} [url]        - template: {code} replaced with row code
 * @property {string} [browserKey] - data-browser attribute value
 * @property {boolean} [isPosition] - true → position-style header styling
 * @property {boolean} [toggleable] - true → shows in toggle bar
 */

/**
 * @typedef {Object} StockTableConfig
 * @property {string} defaultTitle
 * @property {string} dataUrl          - URL that returns the JSON row data
 * @property {ColumnDef[]} columns
 * @property {Object.<string, MetricThreshold>} metricThresholds
 * @property {string} defaultSortKey
 * @property {SortDirection} defaultSortDirection
 * @property {boolean} [tabMode]       - true → enable investor tabs
 * @property {string} [defaultTabKey]  - default tab to select
 * @property {boolean} [githubPages]   - true → static JSON, no /api calls
 */

/* ------------------------------------------------------------------ */
/*  Constants                                                         */
/* ------------------------------------------------------------------ */

var ASC_ARROW = "\u25B2";
var DESC_ARROW = "\u25BC";
var INACTIVE_ARROW = "\u25BD";
var HIDDEN_COLUMNS_KEY = "hiddenColumns";

/* ------------------------------------------------------------------ */
/*  State                                                             */
/* ------------------------------------------------------------------ */

/** @type {StockTableConfig | null} */
var _config = null;

/** @type {{ rows: Object[] | null, currentTab: string, sortKey: string, sortDir: SortDirection, hiddenCols: Set<string>, loading: boolean, error: string }} */
var _state = {
    rows: null,
    currentTab: "",
    sortKey: "",
    sortDir: "asc",
    hiddenCols: new Set(),
    loading: true,
    error: "",
};

/** @type {{ tabBar: HTMLElement, status: HTMLElement, thead: HTMLTableSectionElement, tbody: HTMLElement, toggleBar: HTMLElement }} */
var _el = {
    tabBar: /** @type {HTMLElement} */ (null),
    status: /** @type {HTMLElement} */ (null),
    thead: /** @type {HTMLTableSectionElement} */ (null),
    tbody: /** @type {HTMLElement} */ (null),
    toggleBar: /** @type {HTMLElement} */ (null),
};

/* ------------------------------------------------------------------ */
/*  Public API                                                        */
/* ------------------------------------------------------------------ */

var StockTable = {
    init: init,
};

/* ------------------------------------------------------------------ */
/*  Initialisation                                                    */
/* ------------------------------------------------------------------ */

/**
 * @param {StockTableConfig} config
 */
function init(config) {
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
/*  Data loading                                                      */
/* ------------------------------------------------------------------ */

async function _loadData() {
    if (!_config) {
        return;
    }

    try {
        var response = await fetch(_config.dataUrl, { cache: "no-store" });
        if (!response.ok) {
            throw new Error("HTTP " + response.status);
        }
        var raw = await response.json();
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
        _state.error = "\u30C7\u30FC\u30BF\u3092\u8AAD\u307F\u8FBC\u3081\u307E\u305B\u3093\u3067\u3057\u305F\u3002";
        _render();
    }
}

/* ------------------------------------------------------------------ */
/*  Normalisation                                                     */
/* ------------------------------------------------------------------ */

/**
 * Accepts two shapes:
 *   1) Flat array  →  [{ code, name, … }, …]
 *   2) Tab object  →  { watch: { name, stocks: […] }, … }
 *
 * Tab rows receive a `_tabKey` property so the renderer can filter.
 */
function _normalizeRows(raw) {
    if (Array.isArray(raw)) {
        return raw;
    }

    if (raw && typeof raw === "object") {
        var result = [];
        Object.keys(raw).forEach(function (tabKey) {
            var ds = raw[tabKey];
            if (!ds || !Array.isArray(ds.stocks)) {
                return;
            }
            ds.stocks.forEach(function (stock) {
                stock._tabKey = tabKey;
                stock._tabName = ds.name || tabKey;
                result.push(stock);
            });
        });
        return result;
    }

    return [];
}

function _resolveDefaultTab(rows) {
    if (!_config) {
        return "";
    }
    var keys = [];
    var seen = {};
    rows.forEach(function (r) {
        if (r._tabKey && !seen[r._tabKey]) {
            seen[r._tabKey] = true;
            keys.push(r._tabKey);
        }
    });
    if (_config.defaultTabKey && seen[_config.defaultTabKey]) {
        return _config.defaultTabKey;
    }
    return keys.length > 0 ? keys[0] : "";
}

/* ------------------------------------------------------------------ */
/*  Rendering                                                         */
/* ------------------------------------------------------------------ */

function _render() {
    _renderTabs();
    _renderSortButtons();
    _renderToggleChips();

    if (_state.loading) {
        document.title = _config ? _config.defaultTitle : "";
        _el.status.textContent = "\u30C7\u30FC\u30BF\u3092\u8AAD\u307F\u8FBC\u307F\u4E2D\u3067\u3059\u3002";
        _renderMessageRow("\u30C7\u30FC\u30BF\u3092\u8AAD\u307F\u8FBC\u307F\u4E2D\u3067\u3059\u3002");
        return;
    }

    if (_state.error) {
        document.title = _config ? _config.defaultTitle : "";
        _el.status.textContent = _state.error;
        _renderMessageRow(_state.error);
        return;
    }

    var visible = _getVisibleRows();
    var tabName = _getActiveTabName();
    document.title = tabName ? tabName + " - " + _config.defaultTitle : _config.defaultTitle;
    _el.status.textContent = visible.length.toLocaleString("ja-JP") + " \u4EF6";

    if (visible.length === 0) {
        _renderMessageRow("\u8A72\u5F53\u3059\u308B\u9298\u67C4\u306F\u3042\u308A\u307E\u305B\u3093\u3002");
        return;
    }

    _renderBody(visible);
}

function _renderHead() {
    if (!_el.thead) {
        return;
    }
    var tr = _el.thead.querySelector("tr") || document.createElement("tr");
    tr.innerHTML = "";

    (_config ? _config.columns : []).forEach(function (col) {
        var th = document.createElement("th");
        th.scope = "col";
        if (col.title) {
            th.title = col.title;
        }
        if (col.isPosition) {
            th.className = "column-position";
        }
        th.dataset.columnKey = col.key;

        var btn = document.createElement("button");
        btn.type = "button";
        btn.className = "sort-button";
        btn.dataset.sortColumn = col.key;
        btn.textContent = col.header + " ";
        var arrow = document.createElement("span");
        arrow.className = "arrow";
        arrow.setAttribute("aria-hidden", "true");
        arrow.textContent = INACTIVE_ARROW;
        btn.appendChild(arrow);
        th.appendChild(btn);
        tr.appendChild(th);
    });

    if (!_el.thead.contains(tr)) {
        _el.thead.appendChild(tr);
    }
}

function _renderBody(rows) {
    if (!_el.tbody || !_config) {
        return;
    }
    var cols = _config.columns;
    var hidden = _state.hiddenCols;
    var isGhPages = !!_config.githubPages;

    _el.tbody.innerHTML = rows.map(function (row) {
        var cells = cols.map(function (col) {
            var hiddenCls = hidden.has(col.key) ? " hidden-col" : "";
            var baseCls = col.cssClass || "";
            var extraCls = _metricCls(col, row);

            if (col.type === "code") {
                var monexUrl = "https://monex.ifis.co.jp/index.php?sa=report_zaimu&bcode=" + encodeURIComponent(row.code);
                return '<td class="code' + hiddenCls + '"><a href="' + monexUrl + '" target="_blank" rel="noopener" data-browser="monex">' + escapeHtml(row.code) + "</a></td>";
            }

            if (col.type === "name") {
                var shikihoUrl = "https://shikiho.toyokeizai.net/stocks/" + encodeURIComponent(row.code) + "/shikiho";
                var nameHref = isGhPages ? shikihoUrl : "/open-yazi/" + encodeURIComponent(row.code);
                var nameExtra = isGhPages ? "" : " data-yazi";
                return '<td class="name' + hiddenCls + '"><a href="' + nameHref + '" target="_blank" rel="noopener"' + nameExtra + '>' + escapeHtml(col.render(row)) + "</a></td>";
            }

            return '<td class="' + baseCls + hiddenCls + extraCls + '">' + col.render(row) + "</td>";
        });
        return "<tr>" + cells.join("") + "</tr>";
    }).join("");
}

function _renderMessageRow(message) {
    if (!_el.tbody || !_config) {
        return;
    }
    var visibleCount = _config.columns.length - _state.hiddenCols.size;
    _el.tbody.innerHTML = '<tr><td class="table-message" colspan="' + visibleCount + '">' + escapeHtml(message) + "</td></tr>";
}

function _renderTabs() {
    if (!_el.tabBar || !_config || !_config.tabMode || !_state.rows) {
        if (_el.tabBar) {
            _el.tabBar.innerHTML = "";
        }
        return;
    }

    var tabMap = {};
    _state.rows.forEach(function (r) {
        if (r._tabKey && !tabMap[r._tabKey]) {
            tabMap[r._tabKey] = r._tabName || r._tabKey;
        }
    });
    var entries = Object.entries(tabMap);

    _el.tabBar.innerHTML = entries.map(function (pair) {
        var isActive = pair[0] === _state.currentTab;
        return '<button class="tab' + (isActive ? " active" : "") + '" type="button" data-tab-key="' + escapeHtml(pair[0]) + '" aria-selected="' + String(isActive) + '">' + escapeHtml(pair[1]) + "</button>";
    }).join("");
}

function _renderSortButtons() {
    if (!_el.thead) {
        return;
    }
    _el.thead.querySelectorAll(".sort-button").forEach(function (btn) {
        var key = btn.dataset.sortColumn;
        var isActive = _state.sortKey === key;
        var arrow = btn.querySelector(".arrow");
        if (arrow) {
            arrow.textContent = isActive ? (_state.sortDir === "asc" ? ASC_ARROW : DESC_ARROW) : INACTIVE_ARROW;
        }
        btn.classList.toggle("active", isActive);
        var th = btn.closest("th");
        if (th) {
            th.setAttribute("aria-sort", isActive ? (_state.sortDir === "asc" ? "ascending" : "descending") : "none");
        }
    });
}

function _renderToggleChips() {
    if (!_el.toggleBar || !_config) {
        return;
    }
    var toggleable = _config.columns.filter(function (c) { return c.toggleable; });

    _el.toggleBar.innerHTML = toggleable.map(function (col) {
        var isActive = !_state.hiddenCols.has(col.key);
        return '<button class="toggle-chip' + (isActive ? " active" : "") + '" type="button" data-toggle-column="' + escapeHtml(col.key) + '">' + escapeHtml(col.header) + "</button>";
    }).join("");
}

/* ------------------------------------------------------------------ */
/*  Metric colouring                                                  */
/* ------------------------------------------------------------------ */

function _metricCls(col, row) {
    if (!_config) {
        return "";
    }
    var t = _config.metricThresholds[col.key];
    if (!t) {
        return "";
    }
    var raw = col.sortValue ? col.sortValue(row) : null;
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
/*  Sorting & filtering                                               */
/* ------------------------------------------------------------------ */

function _getVisibleRows() {
    if (!_state.rows || !_config) {
        return [];
    }
    var rows = _state.rows;

    if (_config.tabMode && _state.currentTab) {
        rows = rows.filter(function (r) { return r._tabKey === _state.currentTab; });
    }

    return rows.slice().sort(function (a, b) {
        var col = _findColumn(_state.sortKey);
        if (!col || !col.sortValue) {
            return 0;
        }
        var av = col.sortValue(a);
        var bv = col.sortValue(b);
        var dir = _state.sortDir === "asc" ? 1 : -1;

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

function _getActiveTabName() {
    if (!_state.rows || !_state.currentTab) {
        return "";
    }
    var row = _state.rows.find(function (r) { return r._tabKey === _state.currentTab; });
    return row ? row._tabName || "" : "";
}

function _findColumn(key) {
    if (!_config) {
        return null;
    }
    for (var i = 0; i < _config.columns.length; i++) {
        if (_config.columns[i].key === key) {
            return _config.columns[i];
        }
    }
    return null;
}

/* ------------------------------------------------------------------ */
/*  Event binding                                                     */
/* ------------------------------------------------------------------ */

function _bindEvents() {
    /* sort buttons */
    document.addEventListener("click", function (e) {
        var btn = e.target instanceof Element ? e.target.closest(".sort-button") : null;
        if (!btn) {
            return;
        }
        var key = btn.dataset.sortColumn;
        if (!key) {
            return;
        }
        if (_state.sortKey === key) {
            _state.sortDir = _state.sortDir === "asc" ? "desc" : "asc";
        } else {
            _state.sortKey = key;
            _state.sortDir = key === _config.defaultSortKey ? _config.defaultSortDirection : "asc";
        }
        _render();
    });

    /* toggle chips */
    if (_el.toggleBar) {
        _el.toggleBar.addEventListener("click", function (e) {
            var chip = e.target instanceof Element ? e.target.closest("[data-toggle-column]") : null;
            if (!chip) {
                return;
            }
            var col = chip.dataset.toggleColumn;
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
        _el.tabBar.addEventListener("click", function (e) {
            var tab = e.target instanceof Element ? e.target.closest("[data-tab-key]") : null;
            if (!tab) {
                return;
            }
            var key = tab.dataset.tabKey;
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
    document.addEventListener("click", function (e) {
        var link = e.target instanceof Element ? e.target.closest("a[data-browser]") : null;
        if (!link) {
            return;
        }
        var browserKey = link.getAttribute("data-browser") || "";
        var url = link.href;
        e.preventDefault();
        fetch("/open?browser=" + encodeURIComponent(browserKey) + "&url=" + encodeURIComponent(url))
            .then(function (response) {
                if (!response.ok) {
                    window.open(url, "_blank", "noopener");
                }
            })
            .catch(function () {
                window.open(url, "_blank", "noopener");
            });
    });

    /* yazi link interception */
    document.addEventListener("click", function (e) {
        var link = e.target instanceof Element ? e.target.closest("a[data-yazi]") : null;
        if (!link) {
            return;
        }
        e.preventDefault();
        fetch(link.href).catch(function () { /* ignore */ });
    });
}

/* ------------------------------------------------------------------ */
/*  LocalStorage helpers                                              */
/* ------------------------------------------------------------------ */

function _loadHiddenCols() {
    try {
        var stored = localStorage.getItem(HIDDEN_COLUMNS_KEY);
        if (stored) {
            return new Set(JSON.parse(stored));
        }
    } catch (_e) {
        /* corrupt data → reset */
        localStorage.removeItem(HIDDEN_COLUMNS_KEY);
    }
    return new Set();
}

function _saveHiddenCols(cols) {
    try {
        localStorage.setItem(HIDDEN_COLUMNS_KEY, JSON.stringify(Array.from(cols)));
    } catch (_e) {
        /* storage full or blocked → silently degrade */
    }
}

/* ------------------------------------------------------------------ */
/*  Utilities                                                         */
/* ------------------------------------------------------------------ */

function escapeHtml(value) {
    return value
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#39;");
}
