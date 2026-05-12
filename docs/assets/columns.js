/**
 * Shared stock table column definitions.
 *
 * Consumers combine these canonical columns with their own row accessors and
 * pass the result to StockTable.init().
 */
const PERCENT_SCALE = 100;
export const NCR_SPEC = {
    key: "net_cash_ratio",
    header: "ncr",
    title: "(流動資産 - 棚卸資産 + 有価証券 * 0.7) / 時価総額",
    decimals: 2,
};
export const PER_A_SPEC = {
    key: "per_actual",
    header: "per_a",
    title: "時価総額 / 実績純利益",
    decimals: 1,
};
export const PER_C_SPEC = {
    key: "per",
    header: "per_c",
    title: "時価総額 / 四季報今期予想純利益",
    decimals: 1,
};
export const PER_N_SPEC = {
    key: "per_next",
    header: "per_n",
    title: "時価総額 / 四季報来期予想純利益",
    decimals: 1,
};
export const EQUITY_SPEC = {
    key: "equity_ratio",
    header: "equity%",
    title: "自己資本 / 総資産 * 100",
    decimals: 1,
    suffix: "%",
};
const PEG_5Y_SPEC = {
    key: "peg_trailing_5",
    header: "peg_5y",
    title: "実績PER / 過去5年EPS CAGR[%]",
    decimals: 2,
};
const PEG_5Y_2F_SPEC = {
    key: "peg_blended_5y_actual_2f",
    header: "peg_5y2f",
    title: "来期予想PER / (過去5年実績+2期予想)EPS CAGR[%]",
    decimals: 2,
};
const FCF_YIELD_SPEC = {
    key: "fcf_yield_avg",
    header: "fcf_y%",
    title: "過去N期の平均FCF / 時価総額",
    decimals: 2,
    scale: PERCENT_SCALE,
    suffix: "%",
};
const CROIC_SPEC = {
    key: "croic",
    header: "croic%",
    title: "FCF / (自己資本 + 有利子負債)",
    decimals: 2,
    scale: PERCENT_SCALE,
    suffix: "%",
};
export function buildMetricCol(spec, accessor) {
    return {
        key: spec.key,
        header: spec.header,
        type: "num",
        title: spec.title,
        toggleable: true,
        render: (row) => {
            const value = scaleValue(accessor(row), spec);
            return value !== null ? value.toFixed(spec.decimals) + (spec.suffix ?? "") : "-";
        },
        sortValue: (row) => scaleValue(accessor(row), spec),
    };
}
export const codeCol = {
    key: "code",
    header: "code",
    type: "code",
    title: "銘柄コード",
    render: (row) => String(row.code ?? ""),
    stockLink: "monex",
};
export const nameCol = {
    key: "name",
    header: "name",
    type: "name",
    title: "会社名",
    render: (row) => String(row.name ?? ""),
    stockLink: "yazi",
};
export const priceCol = {
    key: "price",
    header: "price",
    type: "num",
    title: "株価（終値）",
    toggleable: true,
    stockLink: "shikiho",
    render: (row) => {
        const value = toNumber(row.price);
        return value !== null
            ? value.toLocaleString("ja-JP", { minimumFractionDigits: 1, maximumFractionDigits: 1 })
            : "-";
    },
    sortValue: (row) => toNumber(row.price),
};
export const peg5yCol = buildMetricCol(PEG_5Y_SPEC, (row) => toNumber(row.peg_trailing_5));
export const peg5y2fCol = buildMetricCol(PEG_5Y_2F_SPEC, (row) => toNumber(row.peg_blended_5y_actual_2f));
export const fcfYCol = buildMetricCol(FCF_YIELD_SPEC, (row) => toNumber(row.fcf_yield_avg));
export const croicCol = buildMetricCol(CROIC_SPEC, (row) => toNumber(row.croic));
export const COMMON_THRESHOLDS = {
    net_cash_ratio: { good: (v) => v > 1 },
    per_actual: { good: (v) => v > 0 && v <= 7, bad: (v) => v > 7 },
    per: { good: (v) => v > 0 && v <= 7, bad: (v) => v > 7 },
    per_next: { good: (v) => v > 0 && v <= 7, bad: (v) => v > 7 },
    equity_ratio: { good: (v) => v >= 50 },
    fcf_yield_avg: { good: (v) => v >= 10 },
    croic: { good: (v) => v >= 15 },
};
export const StockColumns = {
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
function scaleValue(value, spec) {
    if (value === null) {
        return null;
    }
    return value * (spec.scale ?? 1);
}
function toNumber(value) {
    return typeof value === "number" && Number.isFinite(value) ? value : null;
}
