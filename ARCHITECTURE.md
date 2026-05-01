# Architecture

stock関連Web UIの共通パッケージ。`formula_screening`, `invest_like_legends` から利用される。Python製HTTPサーバーとブラウザ向けTypeScriptモジュールで構成される。

## ディレクトリ構成

```
stock_web_ui/
├── src/stock_web_ui/            # Pythonパッケージ
│   ├── __init__.py              # パッケージ初期化 (static_root パス公開)
│   ├── browser.py               # ブラウザ起動 (xdg-open / startfile)
│   ├── config.py                # サーバー・ブラウザ設定 (TOML読み込み)
│   ├── handler.py               # HTTPリクエストハンドラ (静的ファイル配信, /api, /open, /open-yazi)
│   └── serve.py                 # サーバー起動 (ポート解放, ブラウザ自動オープン)
├── src_ts/                      # TypeScriptソース
│   └── stock-table.ts           # 共通テーブルライブラリ (StockTable.init)
├── docs/                        # 静的ファイル
│   ├── index.html               # テンプレートHTML (type="module" でJS読み込み)
│   └── assets/
│       ├── stock-table.js       # tsc生成 (git管理外)
│       ├── stock-table.d.ts     # tsc生成 (型定義, 他プロジェクトがsymlink参照)
│       └── style.css            # スタイルシート
├── tests/                       # テストスイート
├── config/                      # サーバー・ブラウザ設定ファイル
├── tsconfig.json                # TypeScript設定
├── package.json                 # TypeScript依存関係
└── pyproject.toml               # Python設定 (hatchling build)
```

## ビルドフロー

```
src_ts/stock-table.ts  ──tsc──▶  docs/assets/stock-table.js
                              └─▶ docs/assets/stock-table.d.ts
```

- TypeScriptソース (`src_ts/*.ts`) を `tsc` でコンパイルし `docs/assets/*.js` を生成
- `docs/assets/stock-table.js` は `.gitignore` で除外（ビルド成果物）
- `docs/assets/stock-table.d.ts` はGit管理対象（他プロジェクトがsymlinkで参照）

## 他プロジェクトとの連携

### formula_screening

- `pyproject.toml` で `stock-web-ui` をローカルパス参照
- `docs/assets/stock-table.js` → symlink → `stock_web_ui/docs/assets/stock-table.js`
- `docs/assets/style.css` → symlink → `stock_web_ui/docs/assets/style.css`
- `src_ts/stock-table.d.ts` → symlink → `stock_web_ui/docs/assets/stock-table.d.ts`
- `src_ts/app.ts` で `import { StockTable } from "./stock-table.js"` により型安全に連携

### invest_like_legends

- symlink構成は formula_screening と同じ
- Tab mode で投資家保有銘柄を表示

## フロントエンドアーキテクチャ

- ES Modules (`type="module"`) でブラウザネイティブに動作（バンドラなし）
- `stock-table.ts` が `StockTable` オブジェクトを export
- 各プロジェクトの `app.ts` がカラム定義・閾値・ソート設定を注入
- JSDoc型定義は TypeScript interface/type に移行済み

## HTTPサーバー機能

- `handler.py`: 静的ファイル配信, `/api/*` ルーティング, `/open` (ブラウザ起動), `/open-yazi` (PDFビューア)
- `serve.py`: ポート解放, ブラウザ自動オープン
- symlink先のアセットは `extra_static_roots` でパストラバーサルチェックを通過
