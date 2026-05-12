/**
 * Shared stock table column definitions.
 *
 * Consumers combine these canonical columns with their own row accessors and
 * pass the result to StockTable.init().
 */

import type { ColumnDef, MetricThreshold } from "./stock-table";

export interface MetricColSpec {
  key: string;
  header: string;
  title: string;
  decimals: number;
  scale?: number;
  suffix?: string;
}

type Row = Record<string, unknown>;
type MetricAccessor = (row: Row) => number | null;

const PERCENT_SCALE = 100;

export const NCR_SPEC: MetricColSpec = {
  key: "net_cash_ratio",
  header: "ncr",
  title: "(流動資産 - 棚卸資産 + 有価証券 * 0.7) / 時価総額",
  decimals: 2,
};

export const PER_A_SPEC: MetricColSpec = {
  key: "per_actual",
  header: "per_a",
  title: "時価総額 / 実績純利益",
  decimals: 1,
};

export const PER_C_SPEC: MetricColSpec = {
  key: "per",
  header: "per_c",
  title: "時価総額 / 四季報今期予想純利益",
  decimals: 1,
};

export const PER_N_SPEC: MetricColSpec = {
  key: "per_next",
  header: "per_n",
  title: "時価総額 / 四季報来期予想純利益",
  decimals: 1,
};

export const EQUITY_SPEC: MetricColSpec = {
  key: "equity_ratio",
  header: "equity%",
  title: "自己資本 / 総資産 * 100",
  decimals: 1,
  suffix: "%",
};

const PEG_5Y_SPEC: MetricColSpec = {
  key: "peg_trailing_5",
  header: "peg_5y",
  title: "実績PER / 過去5年EPS CAGR[%]",
  decimals: 2,
};

const PEG_5Y_2F_SPEC: MetricColSpec = {
  key: "peg_blended_5y_actual_2f",
  header: "peg_5y2f",
  title: "来期予想PER / (過去5年実績+2期予想)EPS CAGR[%]",
  decimals: 2,
};

const FCF_YIELD_SPEC: MetricColSpec = {
  key: "fcf_yield_avg",
  header: "fcf_y%",
  title: "過去N期の平均FCF / 時価総額",
  decimals: 2,
  scale: PERCENT_SCALE,
  suffix: "%",
};

const CROIC_SPEC: MetricColSpec = {
  key: "croic",
  header: "croic%",
  title: "FCF / (自己資本 + 有利子負債)",
  decimals: 2,
  scale: PERCENT_SCALE,
  suffix: "%",
};

export function buildMetricCol(spec: MetricColSpec, accessor: MetricAccessor): ColumnDef {
  return {
    key: spec.key,
    header: spec.header,
    type: "num",
    title: spec.title,
    toggleable: true,
    render: (row: Row): string => {
      const value = scaleValue(accessor(row), spec);
      return value !== null ? value.toFixed(spec.decimals) + (spec.suffix ?? "") : "-";
    },
    sortValue: (row: Row): number | null => scaleValue(accessor(row), spec),
  };
}

export const codeCol: ColumnDef = {
  key: "code",
  header: "code",
  type: "code",
  title: "銘柄コード",
  render: (row: Row): string => String(row.code ?? ""),
  stockLink: "monex",
};

export const nameCol: ColumnDef = {
  key: "name",
  header: "name",
  type: "name",
  title: "会社名",
  render: (row: Row): string => String(row.name ?? ""),
  stockLink: "yazi",
};

export const priceCol: ColumnDef = {
  key: "price",
  header: "price",
  type: "num",
  title: "株価（終値）",
  toggleable: true,
  stockLink: "shikiho",
  render: (row: Row): string => {
    const value = toNumber(row.price);
    return value !== null
      ? value.toLocaleString("ja-JP", { minimumFractionDigits: 1, maximumFractionDigits: 1 })
      : "-";
  },
  sortValue: (row: Row): number | null => toNumber(row.price),
};

export const peg5yCol: ColumnDef = buildMetricCol(
  PEG_5Y_SPEC,
  (row: Row): number | null => toNumber(row.peg_trailing_5),
);

export const peg5y2fCol: ColumnDef = buildMetricCol(
  PEG_5Y_2F_SPEC,
  (row: Row): number | null => toNumber(row.peg_blended_5y_actual_2f),
);

export const fcfYCol: ColumnDef = buildMetricCol(
  FCF_YIELD_SPEC,
  (row: Row): number | null => toNumber(row.fcf_yield_avg),
);

export const croicCol: ColumnDef = buildMetricCol(
  CROIC_SPEC,
  (row: Row): number | null => toNumber(row.croic),
);

export const COMMON_THRESHOLDS: Record<string, MetricThreshold> = {
  net_cash_ratio: { good: (v: number): boolean => v > 1 },
  per_actual: { good: (v: number): boolean => v > 0 && v <= 7, bad: (v: number): boolean => v > 7 },
  per: { good: (v: number): boolean => v > 0 && v <= 7, bad: (v: number): boolean => v > 7 },
  per_next: { good: (v: number): boolean => v > 0 && v <= 7, bad: (v: number): boolean => v > 7 },
  equity_ratio: { good: (v: number): boolean => v >= 50 },
  fcf_yield_avg: { good: (v: number): boolean => v >= 10 },
  croic: { good: (v: number): boolean => v >= 15 },
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

const _globalScope = globalThis as typeof globalThis & { StockColumns?: typeof StockColumns };
_globalScope.StockColumns = StockColumns;

function scaleValue(value: number | null, spec: MetricColSpec): number | null {
  if (value === null) {
    return null;
  }
  return value * (spec.scale ?? 1);
}

function toNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}
