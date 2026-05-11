/**
 * Shared column definitions for stock table consumers.
 *
 * Provides common column specs, factory functions, and metric thresholds.
 * Loaded as a separate module before each project's app.js.
 */

import type { ColumnDef, MetricThreshold } from "./stock-table";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface MetricColSpec {
  key: string;
  header: string;
  title: string;
  format: (v: number) => string;
}

/* ------------------------------------------------------------------ */
/*  Factory                                                            */
/* ------------------------------------------------------------------ */

function buildMetricCol(
  spec: MetricColSpec,
  accessor: (row: Record<string, unknown>) => number | null,
): ColumnDef {
  return {
    key: spec.key,
    header: spec.header,
    type: "num",
    title: spec.title,
    toggleable: true,
    render: (row: Record<string, unknown>): string => {
      const v: number | null = accessor(row);
      return v !== null ? spec.format(v) : "-";
    },
    sortValue: accessor,
  };
}

/* ------------------------------------------------------------------ */
/*  Fully shared columns (no accessor needed)                         */
/* ------------------------------------------------------------------ */

const codeCol: ColumnDef = {
  key: "code",
  header: "code",
  type: "code",
  title: "ticker code",
  render: (row: Record<string, unknown>): string => String(row.code ?? ""),
  stockLink: "monex",
};

const nameCol: ColumnDef = {
  key: "name",
  header: "name",
  type: "name",
  title: "company name",
  render: (row: Record<string, unknown>): string => String(row.name ?? ""),
  stockLink: "yazi",
};

const priceCol: ColumnDef = {
  key: "price",
  header: "price",
  type: "num",
  title: "stock price (close)",
  toggleable: true,
  stockLink: "shikiho",
  render: (row: Record<string, unknown>): string => {
    const v = row.price as number | null | undefined;
    return v !== null && v !== undefined
      ? v.toLocaleString("ja-JP", { minimumFractionDigits: 1, maximumFractionDigits: 1 })
      : "-";
  },
  sortValue: (row: Record<string, unknown>): number | null => (row.price as number) ?? null,
};

const peg5yCol: ColumnDef = {
  key: "peg_trailing_5",
  header: "peg_5y",
  type: "num",
  title: "per actual / trailing 5y eps cagr %",
  toggleable: true,
  render: (row: Record<string, unknown>): string => {
    const v = row.peg_trailing_5 as number | null | undefined;
    return v !== null && v !== undefined ? v.toFixed(2) : "-";
  },
  sortValue: (row: Record<string, unknown>): number | null => (row.peg_trailing_5 as number) ?? null,
};

const peg5y2fCol: ColumnDef = {
  key: "peg_blended_5y_actual_2f",
  header: "peg_5y2f",
  type: "num",
  title: "per next / (5y actual + 2f forecast) eps cagr %",
  toggleable: true,
  render: (row: Record<string, unknown>): string => {
    const v = row.peg_blended_5y_actual_2f as number | null | undefined;
    return v !== null && v !== undefined ? v.toFixed(2) : "-";
  },
  sortValue: (row: Record<string, unknown>): number | null => (row.peg_blended_5y_actual_2f as number) ?? null,
};

const fcfYCol: ColumnDef = {
  key: "fcf_yield_avg",
  header: "fcf_y%",
  type: "num",
  title: "avg fcf / market cap",
  toggleable: true,
  render: (row: Record<string, unknown>): string => {
    const v = row.fcf_yield_avg as number | null | undefined;
    if (v === null || v === undefined) { return "-"; }
    return (v * 100).toFixed(2) + "%";
  },
  sortValue: (row: Record<string, unknown>): number | null => {
    const v = row.fcf_yield_avg as number | null | undefined;
    return v != null ? v * 100 : null;
  },
};

const croicCol: ColumnDef = {
  key: "croic",
  header: "croic%",
  type: "num",
  title: "fcf / (equity + interest bearing debt)",
  toggleable: true,
  render: (row: Record<string, unknown>): string => {
    const v = row.croic as number | null | undefined;
    if (v === null || v === undefined) { return "-"; }
    return (v * 100).toFixed(2) + "%";
  },
  sortValue: (row: Record<string, unknown>): number | null => {
    const v = row.croic as number | null | undefined;
    return v != null ? v * 100 : null;
  },
};

/* ------------------------------------------------------------------ */
/*  Accessor-dependent specs                                           */
/* ------------------------------------------------------------------ */

const NCR_SPEC: MetricColSpec = {
  key: "net_cash_ratio",
  header: "ncr",
  title: "(current assets - inventories + securities * 0.7) / market cap",
  format: (v: number): string => v.toFixed(2),
};

const PER_A_SPEC: MetricColSpec = {
  key: "per_actual",
  header: "per_a",
  title: "market cap / actual net income",
  format: (v: number): string => v.toFixed(1),
};

const PER_C_SPEC: MetricColSpec = {
  key: "per",
  header: "per_c",
  title: "market cap / forecast net income (current)",
  format: (v: number): string => v.toFixed(1),
};

const PER_N_SPEC: MetricColSpec = {
  key: "per_next",
  header: "per_n",
  title: "market cap / forecast net income (next)",
  format: (v: number): string => v.toFixed(1),
};

const EQUITY_SPEC: MetricColSpec = {
  key: "equity_ratio",
  header: "equity%",
  title: "equity / total assets * 100",
  format: (v: number): string => v.toFixed(1) + "%",
};

/* ------------------------------------------------------------------ */
/*  Common metric thresholds                                           */
/* ------------------------------------------------------------------ */

const COMMON_THRESHOLDS: Record<string, MetricThreshold> = {
  net_cash_ratio: { good: (v: number): boolean => v > 1 },
  per_actual: { good: (v: number): boolean => v > 0 && v <= 7, bad: (v: number): boolean => v > 7 },
  per: { good: (v: number): boolean => v > 0 && v <= 7, bad: (v: number): boolean => v > 7 },
  per_next: { good: (v: number): boolean => v > 0 && v <= 7, bad: (v: number): boolean => v > 7 },
  equity_ratio: { good: (v: number): boolean => v >= 50 },
  fcf_yield_avg: { good: (v: number): boolean => v >= 10 },
  croic: { good: (v: number): boolean => v >= 15 },
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

const _globalScope = globalThis as typeof globalThis & { StockColumns?: typeof StockColumns };
_globalScope.StockColumns = StockColumns;
