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

function createConfig(columns, { githubPages = false, metadataUrl = undefined } = {}) {
  return {
    defaultTitle: '銘柄一覧',
    dataUrl: '/api/stocks',
    metadataUrl,
    columns,
    metricThresholds: {},
    defaultSortKey: 'code',
    defaultSortDirection: 'desc',
    githubPages,
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

async function setupTable({
  rows = BASE_ROWS,
  metadata = null,
  storedHiddenColumns = null,
  columns = createColumns(),
  githubPages = false,
} = {}) {
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
    if (String(url) === '/api/stock-price-meta') {
      return {
        ok: metadata !== false,
        async json() {
          return metadata ?? {};
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
  StockTable.init(createConfig(columns, {
    githubPages,
    metadataUrl: metadata === null ? undefined : '/api/stock-price-meta',
  }));
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

function getFirstCellAnchor(document, key) {
  const cells = getColumnCells(document, key);
  assert.ok(cells.length > 0, `column ${key} should have cells`);
  return cells[0].querySelector('a');
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

test('code と name は横スクロール時の固定列クラスを持つ', async function (t) {
  const page = await setupTable();
  t.after(function () {
    page.cleanup();
  });

  assert.ok(getHeaderCell(page.document, 'code').classList.contains('sticky-col'));
  assert.ok(getHeaderCell(page.document, 'code').classList.contains('sticky-code'));
  assert.ok(getHeaderCell(page.document, 'code').classList.contains('sticky-left-0'));
  assert.ok(getHeaderCell(page.document, 'name').classList.contains('sticky-col'));
  assert.ok(getHeaderCell(page.document, 'name').classList.contains('sticky-name'));
  assert.ok(getHeaderCell(page.document, 'name').classList.contains('sticky-left-code'));
  assert.ok(!getHeaderCell(page.document, 'per').classList.contains('sticky-col'));
  assert.ok(getColumnCells(page.document, 'code').every(function (cell) {
    return cell.classList.contains('sticky-col')
      && cell.classList.contains('sticky-code')
      && cell.classList.contains('sticky-left-0');
  }));
  assert.ok(getColumnCells(page.document, 'name').every(function (cell) {
    return cell.classList.contains('sticky-col')
      && cell.classList.contains('sticky-name')
      && cell.classList.contains('sticky-left-code');
  }));
});

test('name だけの表では name を左端固定にする', async function (t) {
  const page = await setupTable({
    rows: [{ name: 'Shareholder A' }, { name: 'Shareholder B' }],
    columns: [
      {
        key: 'name',
        header: 'shareholder',
        type: 'name',
        render: (row) => String(row.name ?? ''),
      },
      {
        key: 'amount',
        header: 'amount',
        type: 'num',
        render: (row) => String(row.amount ?? '-'),
      },
    ],
  });
  t.after(function () {
    page.cleanup();
  });

  assert.ok(getHeaderCell(page.document, 'name').classList.contains('sticky-col'));
  assert.ok(getHeaderCell(page.document, 'name').classList.contains('sticky-name'));
  assert.ok(getHeaderCell(page.document, 'name').classList.contains('sticky-left-0'));
  assert.ok(!getHeaderCell(page.document, 'amount').classList.contains('sticky-col'));
  assert.ok(getColumnCells(page.document, 'name').every(function (cell) {
    return cell.classList.contains('sticky-col')
      && cell.classList.contains('sticky-name')
      && cell.classList.contains('sticky-left-0');
  }));
});

test('metadataUrl の価格基準日をステータス欄に表示する', async function (t) {
  const page = await setupTable({ metadata: { price_date: '2026-05-15' } });
  t.after(function () {
    page.cleanup();
  });

  assert.equal(page.document.getElementById('statusMessage').textContent.trim(), '2 件 / 株価基準日: 2026-05-15');
});

test('metadataUrl の取得に失敗しても件数表示を維持する', async function (t) {
  const page = await setupTable({ metadata: false });
  t.after(function () {
    page.cleanup();
  });

  assert.equal(page.document.getElementById('statusMessage').textContent.trim(), '2 件');
});

test('株価が未取得または基準日より古い行は price セルに警告バッジを出す', async function (t) {
  const columns = createColumns();
  columns.splice(2, 0, {
    key: 'price',
    header: 'price',
    type: 'num',
    render: (row) => String(row.price ?? '-'),
    sortValue: (row) => toNumber(row.price),
    stockLink: 'shikiho',
  });
  const page = await setupTable({
    rows: [
      { code: '7203', name: 'Toyota', price: 1000, price_date: '2026-05-20' },
      { code: '6501', name: 'Hitachi', price: 800, price_date: '2026-05-19' },
      { code: '1301', name: 'Kyokuyo', price: null, price_date: null },
    ],
    columns,
    metadata: { price_date: '2026-05-20', target_price_date: '2026-05-20' },
  });
  t.after(function () {
    page.cleanup();
  });

  const rows = Array.from(page.document.querySelectorAll('tbody tr'));
  const priceCells = getColumnCells(page.document, 'price');
  assert.equal(rows.length, 3);
  assert.equal(rows[0].textContent.includes('7203'), true);
  assert.equal(rows[0].classList.contains('price-unavailable'), false);
  assert.equal(priceCells[0].classList.contains('price-caution-cell'), false);
  assert.equal(priceCells[0].querySelector('.price-caution-badge'), null);
  assert.equal(rows[1].textContent.includes('6501'), true);
  assert.equal(rows[1].classList.contains('price-unavailable'), true);
  assert.equal(priceCells[1].classList.contains('price-caution-cell'), true);
  assert.equal(
    priceCells[1].querySelector('.price-caution-badge').getAttribute('title'),
    '株価が古い: 2026-05-19 / 基準日: 2026-05-20',
  );
  assert.equal(rows[2].textContent.includes('1301'), true);
  assert.equal(rows[2].classList.contains('price-unavailable'), true);
  assert.equal(priceCells[2].classList.contains('price-caution-cell'), true);
  assert.equal(priceCells[2].querySelector('.price-caution-badge').getAttribute('aria-label'), '株価未取得');
  assert.equal(getColumnCells(page.document, 'code')[1].classList.contains('price-caution-cell'), false);
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

test('stockLink=yazi はローカル環境で /open-yazi に解決する', async function (t) {
  const columns = createColumns();
  columns[1] = { ...columns[1], stockLink: 'yazi' };
  const page = await setupTable({ columns });
  t.after(function () {
    page.cleanup();
  });

  const anchor = getFirstCellAnchor(page.document, 'name');
  assert.ok(anchor);
  assert.equal(anchor.getAttribute('href'), '/open-yazi/7203');
  assert.ok(anchor.hasAttribute('data-yazi'));
  assert.equal(anchor.textContent.trim(), 'Toyota');
});

test('stockLink=yazi は静的環境では非リンクにする', async function (t) {
  const columns = createColumns();
  columns[1] = { ...columns[1], stockLink: 'yazi' };
  const page = await setupTable({ columns, githubPages: true });
  t.after(function () {
    page.cleanup();
  });

  assert.equal(getFirstCellAnchor(page.document, 'name'), null);
  assert.equal(getFirstCellText(page.document, 'name'), 'Toyota');
});

test('stockLink=shikiho はローカル環境で browser 経由リンクにする', async function (t) {
  const rows = [{ code: '7203', name: 'Toyota', price: 1234.5 }];
  const columns = [
    {
      key: 'code',
      header: 'コード',
      type: 'code',
      render: (row) => String(row.code ?? ''),
      sortValue: (row) => Number(row.code ?? 0),
    },
    {
      key: 'price',
      header: '株価',
      type: 'num',
      render: (row) => String(row.price ?? ''),
      sortValue: (row) => toNumber(row.price),
      stockLink: 'shikiho',
    },
  ];
  const page = await setupTable({ rows, columns });
  t.after(function () {
    page.cleanup();
  });

  const anchor = getFirstCellAnchor(page.document, 'price');
  assert.ok(anchor);
  assert.equal(anchor.getAttribute('href'), 'https://shikiho.toyokeizai.net/stocks/7203/shikiho');
  assert.equal(anchor.getAttribute('data-browser'), 'shikiho');
});

test('stockLink=shikiho は静的環境で direct リンクにする', async function (t) {
  const rows = [{ code: '7203', name: 'Toyota', price: 1234.5 }];
  const columns = [
    {
      key: 'code',
      header: 'コード',
      type: 'code',
      render: (row) => String(row.code ?? ''),
      sortValue: (row) => Number(row.code ?? 0),
    },
    {
      key: 'price',
      header: '株価',
      type: 'num',
      render: (row) => String(row.price ?? ''),
      sortValue: (row) => toNumber(row.price),
      stockLink: 'shikiho',
    },
  ];
  const page = await setupTable({ rows, columns, githubPages: true });
  t.after(function () {
    page.cleanup();
  });

  const anchor = getFirstCellAnchor(page.document, 'price');
  assert.ok(anchor);
  assert.equal(anchor.getAttribute('href'), 'https://shikiho.toyokeizai.net/stocks/7203/shikiho');
  assert.equal(anchor.hasAttribute('data-browser'), false);
  assert.equal(anchor.hasAttribute('data-yazi'), false);
});
