import assert from 'node:assert/strict';
import test from 'node:test';

import { JSDOM } from 'jsdom';

async function loadBsChartModule() {
  const moduleUrl = new URL(`../docs/assets/bs-chart.js?case=${Date.now()}-${Math.random()}`, import.meta.url);
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

function setupChartPage(payload) {
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

  const previousGlobals = {
    window: globalThis.window,
    document: globalThis.document,
    Element: globalThis.Element,
    HTMLTableCellElement: globalThis.HTMLTableCellElement,
    MouseEvent: globalThis.MouseEvent,
    StockTable: globalThis.StockTable,
    BsChart: globalThis.BsChart,
    fetch: globalThis.fetch,
  };

  const requestedUrls = [];
  Object.assign(globalThis, {
    window: dom.window,
    document: dom.window.document,
    Element: dom.window.Element,
    HTMLTableCellElement: dom.window.HTMLTableCellElement,
    MouseEvent: dom.window.MouseEvent,
    StockTable: {
      getBalanceSheetHistoryUrl(code) {
        assert.equal(code, '7203');
        return `/api/balance-sheet?code=${code}`;
      },
    },
    fetch(url) {
      requestedUrls.push(url);
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve(payload),
      });
    },
  });

  return {
    document: dom.window.document,
    window: dom.window,
    requestedUrls,
    cleanup() {
      dom.window.close();
      for (const [name, value] of Object.entries(previousGlobals)) {
        restoreGlobal(name, value);
      }
    },
  };
}

async function showChart(page) {
  const codeCell = page.document.querySelector('td.code');
  codeCell.dispatchEvent(new page.window.MouseEvent('mouseenter', { bubbles: true }));
  await delay(330);
}

test('BS chart loads from StockTable URL and scales year heights from baseline assets', async function (t) {
  const page = setupChartPage({
    ticker: '7203',
    periods: ['2024-03', '2025-03'],
    baseline_period: '2024-03',
    baseline_total_assets: 1000,
    total_assets: [1000, 1200],
    unit: 'JPY',
    roots: [
      {
        concept_namespace: 'http://example.test',
        concept_name: null,
        label: 'BalanceSheetHeading',
        values: [null, null],
        children: [
          {
            concept_namespace: 'http://example.test',
            concept_name: null,
            label: 'BalanceSheetLineItems',
            values: [null, null],
            children: [
              {
                concept_namespace: 'http://example.test',
                concept_name: 'Assets',
                label: '資産',
                values: [1000, 1200],
                children: [
                  {
                    concept_namespace: 'http://example.test',
                    concept_name: 'CurrentAssets',
                    label: 'CurrentAssetsAbstract',
                    values: [600, 700],
                    children: [
                      {
                        concept_namespace: 'http://example.test',
                        concept_name: 'CashAndDeposits',
                        label: 'CashAndDeposits',
                        values: [100, 150],
                        children: [],
                      },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      },
    ],
  });
  t.after(function () {
    page.cleanup();
  });

  await loadBsChartModule();
  await showChart(page);

  assert.deepEqual(page.requestedUrls, ['/api/balance-sheet?code=7203']);
  const tooltip = page.document.querySelector('.bs-tooltip');
  assert.ok(tooltip);
  assert.match(tooltip.textContent, /BALANCE SHEET \/ XBRL/);
  assert.match(tooltip.textContent, /資産/);
  assert.match(tooltip.textContent, /流動資産/);
  assert.match(tooltip.textContent, /現預金/);
  assert.match(tooltip.textContent, /大分類/);
  assert.match(tooltip.textContent, /内訳/);
  assert.equal(page.document.querySelectorAll('.bs-lane-assets .bs-segment').length, 6);

  const rootHue = page.document.querySelector('.bs-lane-assets .bs-segment.depth-0')
    .style.getPropertyValue('--bs-scope-hue');
  const childHue = page.document.querySelector('.bs-lane-assets .bs-segment.depth-1')
    .style.getPropertyValue('--bs-scope-hue');
  const leafHue = page.document.querySelector('.bs-lane-assets .bs-segment.depth-2')
    .style.getPropertyValue('--bs-scope-hue');
  assert.notEqual(rootHue, '');
  assert.notEqual(childHue, '');
  assert.notEqual(leafHue, '');
  assert.notEqual(rootHue, childHue);
  assert.notEqual(childHue, leafHue);

  const years = [...page.document.querySelectorAll('.bs-year')];
  assert.equal(years.length, 2);
  assert.equal(years[0].style.getPropertyValue('--bs-year-height'), '220px');
  assert.equal(years[1].style.getPropertyValue('--bs-year-height'), '264px');
});
