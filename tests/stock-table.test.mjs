import assert from 'node:assert/strict';
import test from 'node:test';

import { JSDOM } from 'jsdom';

const BASE_ROWS = [
  { code: '7203', name: 'Toyota', per: 15, pbr: 1.2 },
  { code: '6501', name: 'Hitachi', per: 8, pbr: 1.4 },
];

function createColumns({ defaultColumnToggleable = false } = {}) {
  return [
    {
      key: 'code',
      header: 'コード',
      type: 'code',
      render: (row) => String(row.code ?? ''),
      sortValue: (row) => Number(row.code ?? 0),
      toggleable: defaultColumnToggleable,
    },
    {
      key: 'name',
      header: '銘柄名',
      type: 'name',
      render: (row) => String(row.name ?? ''),
    },
    {
      key: 'per',
      header: 'PER',
      type: 'num',
      render: (row) => String(row.per ?? ''),
      sortValue: (row) => toNumber(row.per),
      toggleable: true,
    },
    {
      key: 'pbr',
      header: 'PBR',
      type: 'num',
      render: (row) => String(row.pbr ?? ''),
      sortValue: (row) => toNumber(row.pbr),
      toggleable: true,
    },
  ];
}

function createConfig(columns) {
  return {
    defaultTitle: '銘柄一覧',
    dataUrl: '/api/stocks',
    columns,
    metricThresholds: {},
    defaultSortKey: 'code',
    defaultSortDirection: 'desc',
  };
}

function toNumber(value) {
  return typeof value === 'number' ? value : null;
}

function restoreGlobal(name, value) {
  if (value === undefined) {
    delete globalThis[name];
    return;
  }
  globalThis[name] = value;
}

async function loadStockTableModule() {
  const moduleUrl = new URL(`../docs/assets/stock-table.js?case=${Date.now()}-${Math.random()}`, import.meta.url);
  return import(moduleUrl.href);
}

async function flushAsync() {
  await Promise.resolve();
  await Promise.resolve();
  await new Promise(function (resolve) {
    setTimeout(resolve, 0);
  });
}

async function setupTable({ rows = BASE_ROWS, storedHiddenColumns = null, columns = createColumns() } = {}) {
  const dom = new JSDOM(
    `<!DOCTYPE html>
    <html lang="ja">
      <body>
        <nav id="tabBar"></nav>
        <p id="statusMessage"></p>
        <div id="toggleBar"></div>
        <table id="stockTable">
          <thead><tr></tr></thead>
          <tbody id="tbody"></tbody>
        </table>
      </body>
    </html>`,
    { url: 'https://example.test/' },
  );

  const previousGlobals = {
    window: globalThis.window,
    document: globalThis.document,
    localStorage: globalThis.localStorage,
    Element: globalThis.Element,
    HTMLElement: globalThis.HTMLElement,
    HTMLAnchorElement: globalThis.HTMLAnchorElement,
    HTMLButtonElement: globalThis.HTMLButtonElement,
    HTMLTableCellElement: globalThis.HTMLTableCellElement,
    HTMLTableRowElement: globalThis.HTMLTableRowElement,
    HTMLTableSectionElement: globalThis.HTMLTableSectionElement,
    Event: globalThis.Event,
    MouseEvent: globalThis.MouseEvent,
    fetch: globalThis.fetch,
  };

  Object.assign(globalThis, {
    window: dom.window,
    document: dom.window.document,
    localStorage: dom.window.localStorage,
    Element: dom.window.Element,
    HTMLElement: dom.window.HTMLElement,
    HTMLAnchorElement: dom.window.HTMLAnchorElement,
    HTMLButtonElement: dom.window.HTMLButtonElement,
    HTMLTableCellElement: dom.window.HTMLTableCellElement,
    HTMLTableRowElement: dom.window.HTMLTableRowElement,
    HTMLTableSectionElement: dom.window.HTMLTableSectionElement,
    Event: dom.window.Event,
    MouseEvent: dom.window.MouseEvent,
  });

  dom.window.open = function () { return null; };
  globalThis.fetch = async function (url) {
    if (String(url) === '/api/stocks') {
      return {
        ok: true,
        async json() {
          return rows;
        },
      };
    }
    return {
      ok: true,
      async json() {
        return {};
      },
    };
  };

  if (storedHiddenColumns !== null) {
    globalThis.localStorage.setItem('hiddenColumns', JSON.stringify(storedHiddenColumns));
  }

  const { StockTable } = await loadStockTableModule();
  StockTable.init(createConfig(columns));
  await flushAsync();

  return {
    document: dom.window.document,
    localStorage: dom.window.localStorage,
    window: dom.window,
    cleanup() {
      dom.window.close();
      for (const [name, value] of Object.entries(previousGlobals)) {
        restoreGlobal(name, value);
      }
    },
  };
}

function getHeaderCell(document, key) {
  return document.querySelector(`th[data-column-key="${key}"]`);
}

function getSortButton(document, key) {
  return document.querySelector(`.sort-button[data-sort-column="${key}"]`);
}

function getToggleChip(document, key) {
  return document.querySelector(`[data-toggle-column="${key}"]`);
}

function getColumnCells(document, key) {
  const headers = Array.from(document.querySelectorAll('th'));
  const index = headers.findIndex(function (header) {
    return header.dataset.columnKey === key;
  });
  assert.notEqual(index, -1, `column ${key} should exist`);
  return Array.from(document.querySelectorAll(`tbody tr td:nth-child(${index + 1})`));
}

function getFirstCellText(document, key) {
  const cells = getColumnCells(document, key);
  assert.ok(cells.length > 0, `column ${key} should have cells`);
  return cells[0].textContent.trim();
}

function click(window, element) {
  element.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
}

test('初期表示で非表示列が見出しと本文の両方に反映される', async function (t) {
  const page = await setupTable({ storedHiddenColumns: ['per'] });
  t.after(function () {
    page.cleanup();
  });

  assert.ok(getHeaderCell(page.document, 'per').classList.contains('hidden-col'));
  assert.ok(getColumnCells(page.document, 'per').every(function (cell) {
    return cell.classList.contains('hidden-col');
  }));
  assert.ok(!getToggleChip(page.document, 'per').classList.contains('active'));
});

test('ソート中の列を非表示にすると既定ソートへ戻る', async function (t) {
  const page = await setupTable();
  t.after(function () {
    page.cleanup();
  });

  click(page.window, getSortButton(page.document, 'per'));
  assert.equal(getFirstCellText(page.document, 'code'), '6501');

  click(page.window, getToggleChip(page.document, 'per'));

  assert.equal(getFirstCellText(page.document, 'code'), '7203');
  assert.equal(getHeaderCell(page.document, 'code').getAttribute('aria-sort'), 'descending');
  assert.equal(getHeaderCell(page.document, 'per').getAttribute('aria-sort'), 'none');
  assert.ok(getHeaderCell(page.document, 'per').classList.contains('hidden-col'));
  assert.ok(getColumnCells(page.document, 'per').every(function (cell) {
    return cell.classList.contains('hidden-col');
  }));
  assert.ok(!getToggleChip(page.document, 'per').classList.contains('active'));
  assert.equal(page.localStorage.getItem('hiddenColumns'), '["per"]');
});

test('保存済み hidden state を正規化し既定ソート列をトグル対象から外す', async function (t) {
  const page = await setupTable({
    storedHiddenColumns: ['code', 'missing', 'per'],
    columns: createColumns({ defaultColumnToggleable: true }),
  });
  t.after(function () {
    page.cleanup();
  });

  assert.ok(!getHeaderCell(page.document, 'code').classList.contains('hidden-col'));
  assert.ok(getHeaderCell(page.document, 'per').classList.contains('hidden-col'));
  assert.equal(getToggleChip(page.document, 'code'), null);
  assert.ok(getToggleChip(page.document, 'per'));
  assert.equal(page.localStorage.getItem('hiddenColumns'), '["per"]');
});
