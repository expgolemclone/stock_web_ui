import assert from 'node:assert/strict';
import test from 'node:test';

async function loadColumnsModule() {
  const moduleUrl = new URL(`../docs/assets/columns.js?case=${Date.now()}-${Math.random()}`, import.meta.url);
  return import(moduleUrl.href);
}

test('StockColumns exposes the shared column API on globalThis', async function () {
  const previous = globalThis.StockColumns;
  const mod = await loadColumnsModule();

  assert.equal(globalThis.StockColumns, mod.StockColumns);
  assert.equal(mod.StockColumns.codeCol.stockLink, 'monex');
  assert.equal(mod.StockColumns.nameCol.stockLink, 'yazi');
  assert.equal(mod.StockColumns.priceCol.stockLink, 'shikiho');

  if (previous === undefined) {
    delete globalThis.StockColumns;
  } else {
    globalThis.StockColumns = previous;
  }
});

test('buildMetricCol renders nulls and scaled numeric values consistently', async function () {
  const { StockColumns } = await loadColumnsModule();
  const col = StockColumns.buildMetricCol(
    { key: 'ratio', header: 'ratio%', title: 'Ratio', decimals: 2, scale: 100, suffix: '%' },
    (row) => row.ratio,
  );

  assert.equal(col.render({ ratio: 0.1234 }), '12.34%');
  assert.equal(col.sortValue({ ratio: 0.1234 }), 12.34);
  assert.equal(col.render({ ratio: null }), '-');
  assert.equal(col.sortValue({ ratio: null }), null);
});

test('canonical metric columns and thresholds match formula_screening values', async function () {
  const { StockColumns } = await loadColumnsModule();

  assert.equal(StockColumns.fcfYCol.render({ fcf_yield_avg: 0.1234 }), '12.34%');
  assert.equal(StockColumns.croicCol.sortValue({ croic: 0.151 }), 15.1);
  assert.equal(StockColumns.COMMON_THRESHOLDS.net_cash_ratio.good(1.1), true);
  assert.equal(StockColumns.COMMON_THRESHOLDS.per.bad(8), true);
  assert.equal(StockColumns.COMMON_THRESHOLDS.equity_ratio.good(50), true);
});
