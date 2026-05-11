/**
 * Shared column definitions for stock table consumers.
 *
 * Provides common column specs, factory functions, and metric thresholds.
 * Loaded as a separate module before each project's app.js.
 */
/* ------------------------------------------------------------------ */
/*  Factory                                                            */
/* ------------------------------------------------------------------ */
function buildMetricCol(spec, accessor) {
    return {
        key: spec.key,
        header: spec.header,
        type: "num",
        title: spec.title,
        toggleable: true,
        render: (row) => {
            const v = accessor(row);
            return v !== null ? spec.format(v) : "-";
        },
        sortValue: accessor,
    };
}
/* ------------------------------------------------------------------ */
/*  Fully shared columns (no accessor needed)                         */
/* ------------------------------------------------------------------ */
const codeCol = {
    key: "code",
    header: "code",
    type: "code",
    title: "ticker code",
    render: (row) => String(row.code ?? ""),
    stockLink: "monex",
};
const nameCol = {
    key: "name",
    header: "name",
    type: "name",
    title: "company name",
    render: (row) => String(row.name ?? ""),
    stockLink: "yazi",
};
const priceCol = {
    key: "price",
    header: "price",
    type: "num",
    title: "stock price (close)",
    toggleable: true,
    stockLink: "shikiho",
    render: (row) => {
        const v = row.price;
        return v !== null && v !== undefined
            ? v.toLocaleString("ja-JP", { minimumFractionDigits: 1, maximumFractionDigits: 1 })
            : "-";
    },
    sortValue: (row) => row.price ?? null,
};
const peg5yCol = {
    key: "peg_trailing_5",
    header: "peg_5y",
    type: "num",
    title: "per actual / trailing 5y eps cagr %",
    toggleable: true,
    render: (row) => {
        const v = row.peg_trailing_5;
        return v !== null && v !== undefined ? v.toFixed(2) : "-";
    },
    sortValue: (row) => row.peg_trailing_5 ?? null,
};
const peg5y2fCol = {
    key: "peg_blended_5y_actual_2f",
    header: "peg_5y2f",
    type: "num",
    title: "per next / (5y actual + 2f forecast) eps cagr %",
    toggleable: true,
    render: (row) => {
        const v = row.peg_blended_5y_actual_2f;
        return v !== null && v !== undefined ? v.toFixed(2) : "-";
    },
    sortValue: (row) => row.peg_blended_5y_actual_2f ?? null,
};
const fcfYCol = {
    key: "fcf_yield_avg",
    header: "fcf_y%",
    type: "num",
    title: "avg fcf / market cap",
    toggleable: true,
    render: (row) => {
        const v = row.fcf_yield_avg;
        if (v === null || v === undefined) {
            return "-";
        }
        return (v * 100).toFixed(2) + "%";
    },
    sortValue: (row) => {
        const v = row.fcf_yield_avg;
        return v != null ? v * 100 : null;
    },
};
const croicCol = {
    key: "croic",
    header: "croic%",
    type: "num",
    title: "fcf / (equity + interest bearing debt)",
    toggleable: true,
    render: (row) => {
        const v = row.croic;
        if (v === null || v === undefined) {
            return "-";
        }
        return (v * 100).toFixed(2) + "%";
    },
    sortValue: (row) => {
        const v = row.croic;
        return v != null ? v * 100 : null;
    },
};
/* ------------------------------------------------------------------ */
/*  Accessor-dependent specs                                           */
/* ------------------------------------------------------------------ */
const NCR_SPEC = {
    key: "net_cash_ratio",
    header: "ncr",
    title: "(current assets - inventories + securities * 0.7) / market cap",
    format: (v) => v.toFixed(2),
};
const PER_A_SPEC = {
    key: "per_actual",
    header: "per_a",
    title: "market cap / actual net income",
    format: (v) => v.toFixed(1),
};
const PER_C_SPEC = {
    key: "per",
    header: "per_c",
    title: "market cap / forecast net income (current)",
    format: (v) => v.toFixed(1),
};
const PER_N_SPEC = {
    key: "per_next",
    header: "per_n",
    title: "market cap / forecast net income (next)",
    format: (v) => v.toFixed(1),
};
const EQUITY_SPEC = {
    key: "equity_ratio",
    header: "equity%",
    title: "equity / total assets * 100",
    format: (v) => v.toFixed(1) + "%",
};
/* ------------------------------------------------------------------ */
/*  Common metric thresholds                                           */
/* ------------------------------------------------------------------ */
const COMMON_THRESHOLDS = {
    net_cash_ratio: { good: (v) => v > 1 },
    per_actual: { good: (v) => v > 0 && v <= 7, bad: (v) => v > 7 },
    per: { good: (v) => v > 0 && v <= 7, bad: (v) => v > 7 },
    per_next: { good: (v) => v > 0 && v <= 7, bad: (v) => v > 7 },
    equity_ratio: { good: (v) => v >= 50 },
    fcf_yield_avg: { good: (v) => v >= 10 },
    croic: { good: (v) => v >= 15 },
};
/* ------------------------------------------------------------------ */
/*  Public API                                                         */
/* ------------------------------------------------------------------ */
const StockColumns = {
    buildMetricCol,
    codeCol,
    nameCol,
    priceCol,
    peg5yCol,
    peg5y2fCol,
    fcfYCol,
    croicCol,
    NCR_SPEC,
    PER_A_SPEC,
    PER_C_SPEC,
    PER_N_SPEC,
    EQUITY_SPEC,
    COMMON_THRESHOLDS,
};
const _globalScope = globalThis;
_globalScope.StockColumns = StockColumns;
export {};
