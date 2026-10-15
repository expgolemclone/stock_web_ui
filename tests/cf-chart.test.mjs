import assert from 'node:assert/strict';
import test from 'node:test';

import { JSDOM } from 'jsdom';

async function loadCfChartModule() {
  const moduleUrl = new URL(`../docs/assets/cf-chart.js?case=${Date.now()}-${Math.random()}`, import.meta.url);
  return import(moduleUrl.href);
}

function restoreGlobal(name, value) {
  if (value === undefined) {
    delete globalThis[name];
    return;
  }
  globalThis[name] = value;
}

function delay(ms) {
  return new Promise(function (resolve) {
    setTimeout(resolve, ms);
  });
}

function setupChartPage(rowData, { devicePixelRatio = 2 } = {}) {
  const dom = new JSDOM(
    `<!DOCTYPE html>
    <html lang="ja">
      <body>
        <table>
          <tbody>
            <tr>
              <td class="code">7203</td>
              <td class="name">Toyota</td>
            </tr>
          </tbody>
        </table>
      </body>
    </html>`,
    { url: 'https://example.test/' },
  );

  Object.defineProperty(dom.window, 'devicePixelRatio', {
    configurable: true,
    value: devicePixelRatio,
  });

  const previousGlobals = {
    window: globalThis.window,
    document: globalThis.document,
    Element: globalThis.Element,
    HTMLTableCellElement: globalThis.HTMLTableCellElement,
    MouseEvent: globalThis.MouseEvent,
    StockTable: globalThis.StockTable,
    Chart: globalThis.Chart,
    CfChart: globalThis.CfChart,
  };

  const chartCalls = [];
  class ChartStub {
    constructor(canvas, config) {
      chartCalls.push({ canvas, config });
    }

    destroy() {}
  }

  Object.assign(globalThis, {
    window: dom.window,
    document: dom.window.document,
    Element: dom.window.Element,
    HTMLTableCellElement: dom.window.HTMLTableCellElement,
    MouseEvent: dom.window.MouseEvent,
    StockTable: {
      getRowData(code) {
        assert.equal(code, '7203');
        return rowData;
      },
    },
    Chart: ChartStub,
  });

  return {
    chartCalls,
    document: dom.window.document,
    window: dom.window,
    cleanup() {
      dom.window.close();
      for (const [name, value] of Object.entries(previousGlobals)) {
        restoreGlobal(name, value);
      }
    },
  };
}

async function showChart(page) {
  const nameCell = page.document.querySelector('td.name');
  nameCell.dispatchEvent(new page.window.MouseEvent('mouseenter', { bubbles: true }));
  await delay(350);
}

test('CF chart tooltip data uses explicit free_cf and keeps missing values null', async function (t) {
  const page = setupChartPage({
    cf_history: [
      {
        period: '2025-03',
        items: {
          operating_cf: 10_000_000,
          investing_cf: -4_000_000,
          free_cf: 7_000_000,
          cash_equivalents: 8_000_000,
        },
      },
      {
        period: '2023-03',
        items: {
          operating_cf: 5_000_000,
          financing_cf: 2_000_000,
          cash_equivalents: 4_000_000,
        },
      },
      {
        period: '2024-03',
        items: {
          operating_cf: null,
          investing_cf: -2_000_000,
          financing_cf: 1_000_000,
          cash_equivalents: 3_000_000,
        },
      },
    ],
  });
  t.after(function () {
    page.cleanup();
  });

  await loadCfChartModule();
  await showChart(page);

  assert.equal(page.chartCalls.length, 1);
  const { config } = page.chartCalls[0];
  assert.deepEqual(config.data.labels, ['23/03', '24/03', '25/03']);

  const datasets = Object.fromEntries(config.data.datasets.map(function (dataset) {
    return [dataset.label, dataset];
  }));
  assert.deepEqual(datasets['営業CF'].data, [5, null, 10]);
  assert.deepEqual(datasets['投資CF'].data, [null, -2, -4]);
  assert.deepEqual(datasets['財務CF'].data, [2, 1, null]);
  assert.deepEqual(datasets['現金等価物'].data, [4, 3, 8]);
  assert.deepEqual(datasets['フリーCF'].data, [null, null, 7]);

  for (const dataset of config.data.datasets) {
    assert.equal(dataset.data.some(Number.isNaN), false, `${dataset.label} should not contain NaN`);
  }

  const label = config.options.plugins.tooltip.callbacks.label;
  assert.equal(label({ dataset: { label: 'フリーCF' }, parsed: { y: 7 } }), 'フリーCF: 7 百万円');
  assert.equal(label({ dataset: { label: '投資CF' }, parsed: { y: null } }), '投資CF: -');
});

test('CF chart leaves device pixel ratio scaling to Chart.js', async function (t) {
  const page = setupChartPage({
    cf_history: [
      {
        period: '2025-03',
        items: {
          operating_cf: 10_000_000,
          investing_cf: -4_000_000,
          financing_cf: 1_000_000,
          cash_equivalents: 8_000_000,
        },
      },
    ],
  }, { devicePixelRatio: 2 });
  t.after(function () {
    page.cleanup();
  });

  await loadCfChartModule();
  await showChart(page);

  assert.equal(page.chartCalls.length, 1);
  assert.equal(page.chartCalls[0].canvas.width, 760);
  assert.equal(page.chartCalls[0].canvas.height, 400);
});
