/**
 * Cash-flow hover chart component.
 *
 * Shows a Chart.js mixed chart (bar + line) when the user hovers over
 * a `td.name` cell in the stock table. Reads `cf_history` from the
 * row data provided by `StockTable.getRowData()`.
 */
export declare const CfChart: {
    init: typeof init;
};
declare function init(): void;
export {};
