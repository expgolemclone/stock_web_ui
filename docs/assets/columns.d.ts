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
export declare const NCR_SPEC: MetricColSpec;
export declare const PER_A_SPEC: MetricColSpec;
export declare const PER_C_SPEC: MetricColSpec;
export declare const PER_N_SPEC: MetricColSpec;
export declare const EQUITY_SPEC: MetricColSpec;
export declare function buildMetricCol(spec: MetricColSpec, accessor: MetricAccessor): ColumnDef;
export declare const codeCol: ColumnDef;
export declare const nameCol: ColumnDef;
export declare const priceCol: ColumnDef;
export declare const peg5yCol: ColumnDef;
export declare const peg5y2fCol: ColumnDef;
export declare const fcfYCol: ColumnDef;
export declare const croicCol: ColumnDef;
export declare const COMMON_THRESHOLDS: Record<string, MetricThreshold>;
export declare const StockColumns: {
    buildMetricCol: typeof buildMetricCol;
    codeCol: ColumnDef;
    nameCol: ColumnDef;
    priceCol: ColumnDef;
    peg5yCol: ColumnDef;
    peg5y2fCol: ColumnDef;
    fcfYCol: ColumnDef;
    croicCol: ColumnDef;
    NCR_SPEC: MetricColSpec;
    PER_A_SPEC: MetricColSpec;
    PER_C_SPEC: MetricColSpec;
    PER_N_SPEC: MetricColSpec;
    EQUITY_SPEC: MetricColSpec;
    COMMON_THRESHOLDS: Record<string, MetricThreshold>;
};
export {};
