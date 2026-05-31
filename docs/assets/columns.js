/**
 * Shared stock table column definitions.
 *
 * Consumers combine these canonical columns with their own row accessors and
 * pass the result to StockTable.init().
 */
const PERCENT_SCALE = 100;
const PEG_STATUS_LABELS = {
    missing_input: "miss",
    insufficient_history: "hist",
    non_positive_per: "per-",
    non_positive_eps: "eps-",
    non_positive_growth: "growth-",
};
const PEG_STATUS_LEGEND = "未算出: miss=入力欠損 / hist=履歴不足 / per-=PER<=0 / eps-=EPS<=0 / growth-=成長率<=0";
export const NCR_SPEC = {
    key: "net_cash_ratio",
    header: "ncr",
    decimals: 2,
    stockLink: "shikiho",
};
export const PER_A_SPEC = {
    key: "per_actual",
    header: "per_a",
    decimals: 1,
};
export const PER_C_SPEC = {
    key: "per",
    header: "per_c",
    decimals: 1,
};
export const PER_N_SPEC = {
    key: "per_next",
    header: "per_n",
    decimals: 1,
};
export const EQUITY_SPEC = {
    key: "equity_ratio",
    header: "equity%",
    decimals: 1,
    suffix: "%",
};
const FCF_YIELD_SPEC = {
    key: "fcf_yield_avg",
    header: "fcf_10y%",
    decimals: 2,
    scale: PERCENT_SCALE,
    suffix: "%",
};
const PEG_5Y_SPEC = {
    key: "peg_trailing_5",
    header: "peg_5y",
    decimals: 2,
};
const PEG_5Y_2F_SPEC = {
    key: "peg_blended_5y_actual_2f",
    header: "peg_5y2f",
    decimals: 2,
};
const CROIC_SPEC = {
    key: "croic",
    header: "croic%",
    decimals: 2,
    scale: PERCENT_SCALE,
    suffix: "%",
};
export const METRIC_TITLES = {
    net_cash_ratio: "(流動資産 - 棚卸資産 + 有価証券 * 0.7 - 流動負債 - 固定負債) / 時価総額",
    per_actual: "時価総額 / 実績純利益",
    per: "時価総額 / 四季報今期予想純利益",
    per_next: "時価総額 / 四季報来期予想純利益",
    equity_ratio: "自己資本 / 総資産 * 100",
    fcf_yield_avg: "平均(過去10期の各期FCF / 現在の時価総額) * 100",
    croic: "FCF / (自己資本 + 有利子負債) * 100",
    peg_trailing_5: "実績PER / 過去5年EPS CAGR[%]",
    peg_blended_5y_actual_2f: "来期予想PER / (過去5年実績+2期予想)EPS CAGR[%]",
    total_payout_ratio: "(|配当支払額| + |自己株式取得額|) / 時価総額 * 100",
    dividend_yield: "1株配当 / 株価 * 100",
    pbr: "時価総額 / 純資産",
};
export function buildMetricCol(spec, accessor) {
    return {
        key: spec.key,
        header: spec.header,
        type: "num",
        title: spec.title ?? METRIC_TITLES[spec.key],
        toggleable: true,
        stockLink: spec.stockLink,
        render: (row) => {
            const value = scaleValue(accessor(row), spec);
            return value !== null ? value.toFixed(spec.decimals) + (spec.suffix ?? "") : "-";
        },
        sortValue: (row) => scaleValue(accessor(row), spec),
    };
}
function buildPegCol(spec, accessor, statusAccessor) {
    const resolvedTitle = spec.title ?? METRIC_TITLES[spec.key];
    return {
        key: spec.key,
        header: spec.header,
        type: "num",
        title: resolvedTitle ? `${resolvedTitle} (${PEG_STATUS_LEGEND})` : undefined,
        toggleable: true,
        stockLink: spec.stockLink,
        render: (row) => {
            const value = scaleValue(accessor(row), spec);
            if (value !== null) {
                return value.toFixed(spec.decimals) + (spec.suffix ?? "");
            }
            return renderPegStatus(statusAccessor(row));
        },
        sortValue: (row) => scaleValue(accessor(row), spec),
    };
}
function renderPegStatus(status) {
    if (status === null || status === "ok") {
        return "-";
    }
    return PEG_STATUS_LABELS[status] ?? "-";
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
    stockLink: "buffett_code",
    render: (row) => {
        const value = toNumber(row.price);
        return value !== null
            ? value.toLocaleString("ja-JP", { minimumFractionDigits: 1, maximumFractionDigits: 1 })
            : "-";
    },
    sortValue: (row) => toNumber(row.price),
};
export const fcfYCol = buildMetricCol(FCF_YIELD_SPEC, (row) => toNumber(row.fcf_yield_avg));
export const croicCol = buildMetricCol(CROIC_SPEC, (row) => toNumber(row.croic));
export const peg5yCol = buildPegCol(PEG_5Y_SPEC, (row) => toNumber(row.peg_trailing_5), (row) => toStatus(row.peg_trailing_5_status));
export const peg5y2fCol = buildPegCol(PEG_5Y_2F_SPEC, (row) => toNumber(row.peg_blended_5y_actual_2f), (row) => toStatus(row.peg_blended_5y_actual_2f_status));
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
    fcfYCol,
    croicCol,
    peg5yCol,
    peg5y2fCol,
    NCR_SPEC,
    PER_A_SPEC,
    PER_C_SPEC,
    PER_N_SPEC,
    EQUITY_SPEC,
    COMMON_THRESHOLDS,
    METRIC_TITLES,
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
function toStatus(value) {
    return typeof value === "string" ? value : null;
}
