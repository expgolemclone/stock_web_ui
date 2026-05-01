# Architecture

stock 関連 Web UI の共通パッケージ。`formula_screening` と `invest_like_legends` から参照される。Python 製 HTTP サーバー、共有 HTML テンプレート、ブラウザ向け TypeScript テーブル描画コードをまとめて提供する。

## ディレクトリ構成

```text
stock_web_ui/
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
│       └── style.css        # 共通スタイル
├── config/
│   ├── cli_defaults.toml
│   └── magic_numbers.toml
└── tests/
```

## パッケージングと配信

- `src_ts/stock-table.ts` を `tsc` で `docs/assets/stock-table.js` と `docs/assets/stock-table.d.ts` に変換する。
- wheel ビルド時は `config/`, `docs/assets/`, `docs/index.template.html` を package data として `stock_web_ui/` 配下へ同梱する。
- 実行時のパス解決は `stock_web_ui.__init__` が担当し、install 済み環境では package data を、editable / source tree ではリポジトリ直下の `config/` と `docs/` を参照する。
- `docs/assets/stock-table.js` は配布物の一部として Git 管理する。これにより wheel 生成時に「事前に別プロジェクトで tsc を回しておく」前提をなくす。

## 利用側との境界

- 利用側プロジェクトは `stock-web-ui` を path dependency として参照する。
- ローカル HTTP サーバーは「利用側 `docs/assets/` を優先し、足りない共有資産は `stock_web_ui.ASSETS_DIR` からフォールバックする」構成で動く。利用側は `_PACKAGE_ASSETS` のようなパス逆算をしない。
- 利用側 `docs/index.html` は `python -m stock_web_ui.render_index ...` で共通テンプレートから生成できる。
- `docs/assets/stock-table.js`, `docs/assets/style.css`, `src_ts/stock-table.d.ts` を利用側へコピーしておけば、GitHub Pages のような静的配信でも symlink なしで動く。

## フロントエンド

- `StockTable.init(config)` に各プロジェクトの `app.ts` がカラム定義、閾値、ソート設定、データ URL を注入する。
- URL 生成は共通ライブラリに埋め込まず、`ColumnDef.linkHref(row, context)` と `linkMode` / `browserKey` で利用側へ委譲する。
- `RenderContext.githubPages` により、同じカラム定義から「ローカルでは `/open-yazi`」「静的配信では外部 URL」などを切り替えられる。
- 列の表示切替は `hiddenColumns` を `localStorage` に保存し、見出し (`th`)・本文セル (`td`)・トグル状態へ同じ規則で反映する。
- `defaultSortKey` の列は表示切替対象に含めず、現在ソート中の列を非表示にした場合は既定ソートへ戻す。
- ES Modules (`type="module"`) を使い、バンドラなしで動かす。

## HTTP サーバー

- `serve()` は `IndexPage` を受け取り、共通テンプレートから `index.html` をレンダリングして返す。必要なら `index_path` も使える。
- `handler.py` は公開ヘルパーとして `send_json_response()` と `json_route()` を提供する。利用側は `BaseHTTPRequestHandler` のヘッダ送信を手書きしなくてよい。
- `/open` は `BrowserConfig` の allowlist を通した URL だけを外部ブラウザで開く。
- `/open-yazi/{code}` は四季報 PDF 連携用のオプション機能で、利用側が `yazi_base_dir` を渡したときだけ有効になる。

## テスト

- `tests/test_serve.py`: ポート解放と起動ブラウザ
- `tests/test_browser.py`: allowlist 付きブラウザ起動
- `tests/test_config.py`: package data からの設定読込
- `tests/test_handler.py`: JSON 応答 helper と静的資産解決
- `tests/test_page.py`: 共通 index テンプレート描画
- `tests/stock-table.test.mjs`: `jsdom` 上で共有ランタイムの列表示切替、hidden state 正規化、ソート復帰を検証
