/**
 * Cash-flow hover chart component.
 *
 * Shows a Chart.js mixed chart (bar + line) when the user hovers over
 * a `td.name` cell in the stock table. Reads `cf_history` from the
 * row data provided by `StockTable.getRowData()`.
 */

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

type CfHistoryEntry = [string, Record<string, number | null>];

interface StockTableRef {
  getRowData(code: string): Record<string, unknown> | null;
}

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const SHOW_DELAY_MS = 300;
const HIDE_DELAY_MS = 200;
const MILLION = 1_000_000;

const CF_COLORS = {
  operating_cf: "#d4a574",
  investing_cf: "#4caf50",
  financing_cf: "#ab47bc",
  cash_equivalents: "#42a5f5",
  free_cf: "#ef5350",
} as const;

const CF_LABELS: Record<string, string> = {
  operating_cf: "営業CF",
  investing_cf: "投資CF",
  financing_cf: "財務CF",
  cash_equivalents: "現金等価物",
  free_cf: "フリーCF",
};

const CHART_FONT_COLOR = "#c9d1d9";
const GRID_COLOR = "rgba(255,255,255,0.08)";

/* ------------------------------------------------------------------ */
/*  State                                                              */
/* ------------------------------------------------------------------ */

let _tooltip: HTMLDivElement | null = null;
let _chart: ChartInstance | null = null;
let _showTimer: ReturnType<typeof setTimeout> | null = null;
let _hideTimer: ReturnType<typeof setTimeout> | null = null;

/* ------------------------------------------------------------------ */
/*  Public API                                                         */
/* ------------------------------------------------------------------ */

export const CfChart = { init };

const _globalScope = globalThis as typeof globalThis & { CfChart?: typeof CfChart };
_globalScope.CfChart = CfChart;

/* ------------------------------------------------------------------ */
/*  Initialisation                                                     */
/* ------------------------------------------------------------------ */

function init(): void {
  document.addEventListener("mouseenter", _onMouseEnter, true);
  document.addEventListener("mouseleave", _onMouseLeave, true);
}

/* ------------------------------------------------------------------ */
/*  Event handlers                                                     */
/* ------------------------------------------------------------------ */

function _onMouseEnter(e: MouseEvent): void {
  const target = e.target instanceof Element ? e.target.closest("td.name") : null;
  if (!target) {
    return;
  }
  _cancelHide();
  _cancelShow();
  _showTimer = setTimeout(function (): void {
    _showChart(target as HTMLTableCellElement);
  }, SHOW_DELAY_MS);
}

function _onMouseLeave(e: MouseEvent): void {
  const target = e.target instanceof Element ? e.target.closest("td.name") : null;
  if (!target) {
    return;
  }
  _cancelShow();
  _hideTimer = setTimeout(_hideChart, HIDE_DELAY_MS);
}

/* ------------------------------------------------------------------ */
/*  Chart lifecycle                                                    */
/* ------------------------------------------------------------------ */

function _showChart(cell: HTMLTableCellElement): void {
  const code = _getCodeFromCell(cell);
  if (!code) {
    return;
  }

  const stockTable = _getStockTable();
  if (!stockTable) {
    return;
  }

  const rowData = stockTable.getRowData(code);
  if (!rowData) {
    return;
  }

  const cfHistory = rowData.cf_history as CfHistoryEntry[] | undefined;
  if (!cfHistory || cfHistory.length === 0) {
    return;
  }

  _ensureTooltip();
  _createChart(cfHistory);
  _positionTooltip(cell);
}

function _hideChart(): void {
  if (_chart) {
    _chart.destroy();
    _chart = null;
  }
  if (_tooltip) {
    _tooltip.style.display = "none";
  }
}

/* ------------------------------------------------------------------ */
/*  Tooltip DOM                                                        */
/* ------------------------------------------------------------------ */

function _ensureTooltip(): void {
  if (_tooltip) {
    _tooltip.style.display = "";
    return;
  }

  _tooltip = document.createElement("div");
  _tooltip.className = "cf-tooltip";

  const canvas = document.createElement("canvas");
  _tooltip.appendChild(canvas);

  _tooltip.addEventListener("mouseenter", function (): void {
    _cancelHide();
  });
  _tooltip.addEventListener("mouseleave", function (): void {
    _hideTimer = setTimeout(_hideChart, HIDE_DELAY_MS);
  });

  document.body.appendChild(_tooltip);
}

function _positionTooltip(cell: HTMLTableCellElement): void {
  if (!_tooltip) {
    return;
  }

  const rect = cell.getBoundingClientRect();
  const tooltipWidth = 580;
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;

  let left = rect.left;
  if (left + tooltipWidth > viewportWidth) {
    left = viewportWidth - tooltipWidth - 12;
  }
  if (left < 12) {
    left = 12;
  }

  let top = rect.bottom + 8;
  if (top + 350 > viewportHeight) {
    top = rect.top - 350 - 8;
  }
  if (top < 12) {
    top = 12;
  }

  _tooltip.style.left = left + "px";
  _tooltip.style.top = top + "px";
}

/* ------------------------------------------------------------------ */
/*  Chart creation                                                     */
/* ------------------------------------------------------------------ */

type ChartInstance = { destroy: () => void };

function _createChart(cfHistory: CfHistoryEntry[]): void {
  if (_chart) {
    _chart.destroy();
    _chart = null;
  }

  const canvas = _tooltip!.querySelector("canvas") as HTMLCanvasElement;
  const sorted = cfHistory.slice().sort(function (a, b): number {
    return a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0;
  });

  const labels = sorted.map(function (entry: CfHistoryEntry): string {
    return _formatPeriod(entry[0]);
  });

  const operatingData = sorted.map(_extractField("operating_cf"));
  const investingData = sorted.map(_extractField("investing_cf"));
  const financingData = sorted.map(_extractField("financing_cf"));
  const cashData = sorted.map(_extractField("cash_equivalents"));
  const freeCfData = sorted.map(function (entry: CfHistoryEntry): number | null {
    const op = entry[1].operating_cf;
    const inv = entry[1].investing_cf;
    if (op !== null && inv !== null) {
      return (op + inv) / MILLION;
    }
    return null;
  });

  const Chart = _getChartConstructor();
  if (!Chart) {
    return;
  }

  _chart = new Chart(canvas, {
    type: "bar",
    data: {
      labels: labels,
      datasets: [
        {
          label: CF_LABELS.operating_cf,
          type: "bar",
          data: operatingData,
          backgroundColor: CF_COLORS.operating_cf + "cc",
          borderColor: CF_COLORS.operating_cf,
          borderWidth: 1,
          order: 2,
        },
        {
          label: CF_LABELS.investing_cf,
          type: "bar",
          data: investingData,
          backgroundColor: CF_COLORS.investing_cf + "cc",
          borderColor: CF_COLORS.investing_cf,
          borderWidth: 1,
          order: 3,
        },
        {
          label: CF_LABELS.financing_cf,
          type: "bar",
          data: financingData,
          backgroundColor: CF_COLORS.financing_cf + "cc",
          borderColor: CF_COLORS.financing_cf,
          borderWidth: 1,
          order: 4,
        },
        {
          label: CF_LABELS.cash_equivalents,
          type: "bar",
          data: cashData,
          backgroundColor: CF_COLORS.cash_equivalents + "cc",
          borderColor: CF_COLORS.cash_equivalents,
          borderWidth: 1,
          order: 5,
        },
        {
          label: CF_LABELS.free_cf,
          type: "line",
          data: freeCfData,
          borderColor: CF_COLORS.free_cf,
          backgroundColor: CF_COLORS.free_cf + "33",
          borderWidth: 2.5,
          pointRadius: 3,
          pointBackgroundColor: CF_COLORS.free_cf,
          tension: 0.2,
          fill: false,
          order: 1,
        },
      ],
    },
    options: {
      responsive: false,
      maintainAspectRatio: false,
      animation: { duration: 200 },
      interaction: {
        mode: "index",
        intersect: false,
      },
      plugins: {
        legend: {
          display: true,
          position: "top",
          labels: {
            color: CHART_FONT_COLOR,
            font: { size: 11 },
            boxWidth: 12,
            padding: 10,
          },
        },
        tooltip: {
          backgroundColor: "rgba(13,17,23,0.95)",
          titleColor: "#e0e0e0",
          bodyColor: CHART_FONT_COLOR,
          borderColor: "#444c6a",
          borderWidth: 1,
          callbacks: {
            label: function (ctx: { dataset: { label?: string }; parsed: { y: number | null } }): string {
              const value = ctx.parsed.y;
              if (value === null) {
                return (ctx.dataset.label ?? "") + ": -";
              }
              return (ctx.dataset.label ?? "") + ": " + value.toLocaleString("ja-JP", { maximumFractionDigits: 0 });
            },
          },
        },
      },
      scales: {
        x: {
          ticks: { color: CHART_FONT_COLOR, font: { size: 11 } },
          grid: { color: GRID_COLOR },
        },
        y: {
          ticks: {
            color: CHART_FONT_COLOR,
            font: { size: 11 },
            callback: function (value: string | number): string {
              return Number(value).toLocaleString("ja-JP", { maximumFractionDigits: 0 });
            },
          },
          grid: { color: GRID_COLOR },
        },
      },
    },
  }) as ChartInstance;
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function _extractField(field: string): (entry: CfHistoryEntry) => number | null {
  return function (entry: CfHistoryEntry): number | null {
    const v = entry[1][field];
    return v !== null ? v / MILLION : null;
  };
}

function _formatPeriod(period: string): string {
  if (period.length >= 7 && period[4] === "-") {
    return period.substring(2, 4) + "/" + period.substring(5, 7);
  }
  return period;
}

function _getCodeFromCell(cell: HTMLTableCellElement): string | null {
  const row = cell.closest("tr");
  if (!row) {
    return null;
  }
  const codeCell = row.querySelector("td.code");
  if (!codeCell) {
    return null;
  }
  const text = codeCell.textContent?.trim() ?? "";
  return text || null;
}

function _getStockTable(): StockTableRef | null {
  const g = globalThis as typeof globalThis & { StockTable?: StockTableRef };
  return g.StockTable ?? null;
}

function _getChartConstructor(): (new (canvas: HTMLCanvasElement, config: unknown) => unknown) | null {
  const g = globalThis as typeof globalThis & { Chart?: new (canvas: HTMLCanvasElement, config: unknown) => unknown };
  return g.Chart ?? null;
}

function _cancelShow(): void {
  if (_showTimer !== null) {
    clearTimeout(_showTimer);
    _showTimer = null;
  }
}

function _cancelHide(): void {
  if (_hideTimer !== null) {
    clearTimeout(_hideTimer);
    _hideTimer = null;
  }
}

/* ------------------------------------------------------------------ */
/*  Auto-initialise                                                    */
/* ------------------------------------------------------------------ */

init();
