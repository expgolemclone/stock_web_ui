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
  assert.equal(mod.StockColumns.priceCol.stockLink, 'buffett_code');
  assert.equal(mod.StockColumns.NCR_SPEC.stockLink, 'shikiho');

  if (previous === undefined) {
    delete globalThis.StockColumns;
  } else {
    globalThis.StockColumns = previous;
  }
});

test('buildMetricCol renders nulls and scaled numeric values consistently', async function () {
  const { StockColumns } = await loadColumnsModule();
  const col = StockColumns.buildMetricCol(
    { key: 'ratio', header: 'ratio%', decimals: 2, scale: 100, suffix: '%' },
    (row) => row.ratio,
  );

  assert.equal(col.render({ ratio: 0.1234 }), '12.34%');
  assert.equal(col.sortValue({ ratio: 0.1234 }), 12.34);
  assert.equal(col.render({ ratio: null }), '-');
  assert.equal(col.sortValue({ ratio: null }), null);
});

test('buildMetricCol resolves title from METRIC_TITLES when spec has no title', async function () {
  const { StockColumns } = await loadColumnsModule();
  const col = StockColumns.buildMetricCol(
    StockColumns.NCR_SPEC,
    (row) => row.net_cash_ratio,
  );

  assert.equal(
    col.title,
    '(流動資産 - 棚卸資産 + 有価証券 * 0.7 - 流動負債 - 固定負債) / 時価総額',
  );
});

test('buildMetricCol uses spec title when provided', async function () {
  const { StockColumns } = await loadColumnsModule();
  const col = StockColumns.buildMetricCol(
    { key: 'test_metric', header: 'tm', title: 'Custom Title', decimals: 1 },
    (row) => row.test_metric,
  );

  assert.equal(col.title, 'Custom Title');
});

test('METRIC_TITLES contains all canonical metric explanations', async function () {
  const { StockColumns } = await loadColumnsModule();
  const expectedKeys = [
    'net_cash_ratio', 'per_actual', 'per', 'per_next', 'equity_ratio',
    'fcf_yield_avg', 'croic', 'peg_trailing_5', 'peg_blended_5y_actual_2f',
    'total_payout_ratio', 'dividend_yield', 'pbr',
  ];
  for (const key of expectedKeys) {
    assert.ok(StockColumns.METRIC_TITLES[key], `METRIC_TITLES should contain ${key}`);
    assert.ok(StockColumns.METRIC_TITLES[key].length > 0, `METRIC_TITLES[${key}] should be non-empty`);
  }
});

test('buildMetricCol carries a configured stock link', async function () {
  const { StockColumns } = await loadColumnsModule();
  const col = StockColumns.buildMetricCol(
    StockColumns.NCR_SPEC,
    (row) => row.net_cash_ratio,
  );

  assert.equal(col.stockLink, 'shikiho');
  assert.equal(col.render({ net_cash_ratio: 1.234 }), '1.23');
});

test('canonical metric columns and thresholds match formula_screening values', async function () {
  const { StockColumns } = await loadColumnsModule();

  assert.equal(
    StockColumns.METRIC_TITLES.net_cash_ratio,
    '(流動資産 - 棚卸資産 + 有価証券 * 0.7 - 流動負債 - 固定負債) / 時価総額',
  );
  assert.ok(
    Object.keys(StockColumns).indexOf('fcfYCol') < Object.keys(StockColumns).indexOf('peg5yCol'),
  );
  assert.equal(
    StockColumns.fcfYCol.title,
    '平均(過去10期の各期FCF / 現在の時価総額) * 100',
  );
  assert.equal(StockColumns.fcfYCol.render({ fcf_yield_avg: 0.1234 }), '12.34%');
  assert.equal(
    StockColumns.croicCol.title,
    'FCF / (自己資本 + 有利子負債) * 100',
  );
  assert.equal(StockColumns.croicCol.sortValue({ croic: 0.151 }), 15.1);
  assert.equal(
    StockColumns.peg5yCol.render({
      peg_trailing_5: null,
      peg_trailing_5_status: 'non_positive_growth',
    }),
    'growth-',
  );
  assert.equal(
    StockColumns.peg5y2fCol.render({
      peg_blended_5y_actual_2f: null,
      peg_blended_5y_actual_2f_status: 'missing_input',
    }),
    'miss',
  );
  assert.equal(
    StockColumns.peg5yCol.render({
      peg_trailing_5: null,
      peg_trailing_5_status: 'insufficient_history',
    }),
    'hist',
  );
  assert.equal(
    StockColumns.peg5yCol.render({
      peg_trailing_5: null,
      peg_trailing_5_status: 'non_positive_per',
    }),
    'per-',
  );
  assert.equal(
    StockColumns.peg5yCol.render({
      peg_trailing_5: null,
      peg_trailing_5_status: 'non_positive_eps',
    }),
    'eps-',
  );
  assert.equal(
    StockColumns.peg5yCol.render({
      peg_trailing_5: null,
      peg_trailing_5_status: 'unknown_status',
    }),
    '-',
  );
  assert.equal(
    StockColumns.peg5yCol.sortValue({
      peg_trailing_5: null,
      peg_trailing_5_status: 'non_positive_growth',
    }),
    null,
  );
  assert.equal(StockColumns.COMMON_THRESHOLDS.net_cash_ratio.good(1.1), true);
  assert.equal(StockColumns.COMMON_THRESHOLDS.per.bad(8), true);
  assert.equal(StockColumns.COMMON_THRESHOLDS.equity_ratio.good(50), true);
});
