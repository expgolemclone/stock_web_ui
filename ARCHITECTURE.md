# Architecture

stock 関連 Web UI の共通パッケージ。`formula_screening`、`invest_like_legends`、`land_value_research` から参照される。Python 製 HTTP サーバー、共有 HTML テンプレート、ブラウザ向け TypeScript テーブル描画コードをまとめて提供する。

## ディレクトリ構成

```text
stock_web_ui/
├── .githooks/
│   └── pre-push             # 下流 repo の実画面確認
├── .claude/hooks/
│   └── stop_check_downstream_ui.py
├── .github/workflows/
│   └── deploy-pages.yml    # docs/ を GitHub Pages へ公開
├── scripts/
│   ├── check_downstream_ui.mjs
│   └── downstream_server.py
├── src/stock_web_ui/
│   ├── __init__.py          # ASSETS_DIR / CONFIG_DIR / INDEX_TEMPLATE_PATH 公開
│   ├── browser.py           # 許可URL付きブラウザ起動
│   ├── config.py            # package data から TOML 読み込み
│   ├── handler.py           # 静的配信, /api/*, /open, /open-yazi
│   ├── page.py              # 共通 index.html テンプレート描画
│   ├── render_index.py      # テンプレートから index.html を生成する CLI
│   └── serve.py             # サーバー起動, ポート解放, 起動ブラウザ
├── src_ts/
│   └── stock-table.ts       # 共通テーブル描画ライブラリ
├── docs/
│   ├── index.html           # 共有静的サンプル
│   ├── index.template.html  # 共通テンプレート
│   └── assets/
│       ├── stock-table.js   # tsc 生成の共有ランタイム
│       ├── stock-table.d.ts # 共有型定義
│       ├── columns.js       # tsc 生成の共有カラム定義
│       ├── columns.d.ts     # 共有カラム型定義
│       └── style.css        # 共通スタイル
├── config/
│   ├── cli_defaults.toml
│   └── magic_numbers.toml
└── tests/
```

## パッケージングと配信

- `src_ts/stock-table.ts` と `src_ts/columns.ts` を `tsc` で `docs/assets/*.js` と `docs/assets/*.d.ts` に変換する。
- wheel ビルド時は `config/`, `docs/assets/`, `docs/index.template.html` を package data として `stock_web_ui/` 配下へ同梱する。
- 実行時のパス解決は `stock_web_ui.__init__` が担当し、install 済み環境では package data を、editable / source tree ではリポジトリ直下の `config/` と `docs/` を参照する。
- `docs/assets/stock-table.js` と `docs/assets/columns.js` は配布物の一部として Git 管理する。これにより wheel 生成時に「事前に別プロジェクトで tsc を回しておく」前提をなくす。
- `docs/assets/` は `deploy-pages.yml` により `stock_web_ui` 自身の GitHub Pages からも配信され、利用側の静的サイトが共有 runtime / style の正規 URL として直接参照できる。
- GitHub repository settings の Pages source は `GitHub Actions` を前提とする。公開 URL は `https://expgolemclone.github.io/stock_web_ui/assets/`。

## 利用側との境界

- 利用側プロジェクトは `stock-web-ui` を path dependency として参照する。
- ローカル HTTP サーバーは「利用側 `docs/assets/` を優先し、足りない共有資産は `stock_web_ui.ASSETS_DIR` からフォールバックする」構成で動く。利用側は `_PACKAGE_ASSETS` のようなパス逆算をしない。
- 利用側 `docs/index.html` は `python -m stock_web_ui.render_index ...` で共通テンプレートから生成でき、`--shared-asset-base-url` で共有 runtime / style の参照先を外部 URL に切り替えられる。
- 利用側は `docs/assets/app.js` とデータだけを保持し、共有 runtime / style のローカルコピーは持たなくてよい。

## フロントエンド

- `StockTable.init(config)` に各プロジェクトの `app.ts` がカラム定義、閾値、ソート設定、データ URL を注入する。
- `stock-table.js` は ESM として配信される一方で `globalThis.StockTable` にも公開され、利用側 `app.js` はこの共有 API を前提に起動する。
- `columns.js` は ESM として配信される一方で `globalThis.StockColumns` にも公開され、共通の `code` / `name` / `price` / 指標列と閾値を提供する。
- 共通リンクは `ColumnDef.stockLink` (`monex` / `shikiho` / `yazi`) で指定できる。runtime が `row.code` と `RenderContext.githubPages` から `href` / `linkMode` / `browserKey` を解決する。
- `code` / `name` / `price` の canonical mapping は `monex` / `yazi` / `shikiho` とする。
- `yazi` の canonical behavior は「ローカルでは `/open-yazi/{code}`、静的配信では非リンク」であり、consumer は特別な理由がない限り `stockLink: "yazi"` をそのまま使う。
- 既存の `ColumnDef.linkHref(row, context)` と `linkMode` / `browserKey` も後方互換のため維持し、`stockLink` を使わない利用側は従来どおり個別定義できる。ただし `yazi` 挙動を repo ごとに変えない用途に限る。
- `RenderContext.githubPages` により、同じカラム定義から「ローカルでは `/open-yazi`」「静的配信では四季報 URL」「静的配信では yazi 列を非リンク化」などを切り替えられる。
- 列の表示切替は `hiddenColumns` を `localStorage` に保存し、見出し (`th`)・本文セル (`td`)・トグル状態へ同じ規則で反映する。
- `defaultSortKey` の列は表示切替対象に含めず、現在ソート中の列を非表示にした場合は既定ソートへ戻す。
- ES Modules (`type="module"`) を使い、バンドラなしで動かす。
- **Detail modal** (`StockTableConfig.detailModal`, デフォルト `false`): `ColumnDef.detailContent` を持つカラムでボタンを表示し、クリック時にモーダルで HTML コンテンツを展開する。`detailModal: true` を設定した consumer だけが有効になる。`land_value_research` が調査メモ表示に使用する。

## HTTP サーバー

- `serve()` は `IndexPage` を受け取り、共通テンプレートから `index.html` をレンダリングして返す。必要なら `index_path` も使える。
- `IndexPage.shared_asset_base_url` を省略するとローカル相対の `assets/*` を使い、指定すると共有 runtime / style の script/link をその URL へ向ける。
- `handler.py` は公開ヘルパーとして `send_json_response()` と `json_route()` を提供する。利用側は `BaseHTTPRequestHandler` のヘッダ送信を手書きしなくてよい。
- `/open` は `BrowserConfig` の allowlist を通した URL だけを外部ブラウザで開く。
- `/open-yazi/{code}` は四季報 PDF 連携用のオプション機能で、`serve()` の `yazi_base_dir` 明示指定、`STOCK_WEB_UI_YAZI_BASE_DIR`、または `config/cli_defaults.toml` の `[yazi].base_dir` で有効になる。優先順位は明示指定、環境変数、TOML の順。

## 開発フック

- `npm run check:downstream-ui` は `formula_screening`、`invest_like_legends`、`land_value_research` を sibling repo として起動し、Playwright で実画面を確認する。
- 検証は fixture ではなく、各 repo のローカル HTTP サーバーと実 SQLite DB (`stock_db/var/db/stocks.db`、`japan_company_handbook/data/stock_performance.db`、`land_value_research/data/land.db`) を使う。
- `.githooks/pre-push` は Codex と Claude Code のどちらでも効く共通の強制点で、同じ検証コマンドを呼ぶ。ローカル workspace では `git config core.hooksPath .githooks` で有効化する。
- `.claude/hooks/stop_check_downstream_ui.py` は Claude Code の Stop hook から同じ検証コマンドを呼ぶ薄い wrapper であり、判定ロジックは `scripts/check_downstream_ui.mjs` に集約する。

## テスト

- `tests/test_serve.py`: ポート解放と起動ブラウザ
- `tests/test_browser.py`: allowlist 付きブラウザ起動
- `tests/test_config.py`: package data からの設定読込
- `tests/test_handler.py`: JSON 応答 helper と静的資産解決
- `tests/test_page.py`: 共通 index テンプレート描画
- `tests/stock-table.test.mjs`: `jsdom` 上で共有ランタイムの列表示切替、hidden state 正規化、ソート復帰を検証
- `scripts/check_downstream_ui.mjs`: 下流 3 repo の実 DB-backed 画面表示を Playwright で検証
