/**
 * Shared column definitions for stock table consumers.
 *
 * Provides common column specs, factory functions, and metric thresholds.
 * Loaded as a separate module before each project's app.js.
 */
export interface MetricColSpec {
    key: string;
    header: string;
    title: string;
    format: (v: number) => string;
}
