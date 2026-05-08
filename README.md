# stock-web-ui

株式スクリーニング系プロジェクトで共通利用する Web UI パッケージです。
`formula_screening` と `invest_like_legends` から参照される共有部品として、Python 製のローカル HTTP サーバー、共通 `index.html` テンプレート、ブラウザ向けの銘柄テーブルランタイム、共有 CSS、設定ファイルをまとめています。

詳細な設計方針は [ARCHITECTURE.md](ARCHITECTURE.md) を参照してください。

公開ページは [GitHub Pages](https://expgolemclone.github.io/stock_web_ui/) から確認できます。

## 提供するもの

- `stock_web_ui.serve`: ローカル静的配信、`/api/*` ルーティング、ブラウザ起動、`/open` と `/open-yazi/{code}` の補助エンドポイント
- `stock_web_ui.page`: 共通テンプレートから `index.html` を生成する `IndexPage` / `render_index_html`
- `python -m stock_web_ui.render_index`: 利用側プロジェクトの `docs/index.html` を生成する CLI
- `docs/assets/stock-table.js`: `StockTable.init(config)` で起動する ESM テーブルランタイム
- `docs/assets/style.css`: 共有テーブル UI のスタイル
- `config/*.toml`: サーバー既定値と外部ブラウザ連携設定

## セットアップ

Python は 3.13 以上が必要です。開発時は Python 依存関係と Node.js 依存関係をそれぞれ入れます。

```powershell
uv sync --dev
npm ci
```

## よく使うコマンド

```powershell
npm run build:assets
npm run typecheck
npm run test:ui
uv run pytest
```

`build:assets` は `src_ts/stock-table.ts` から `docs/assets/stock-table.js` と `docs/assets/stock-table.d.ts` を生成します。生成物は wheel と GitHub Pages 配信の両方で使うため、TypeScript を変更したら一緒に更新してください。

## 利用側での index.html 生成

利用側プロジェクトは、このパッケージのテンプレートから `docs/index.html` を生成できます。

```powershell
uv run python -m stock_web_ui.render_index `
  --title "Stock Viewer" `
  --asset-version "20260501" `
  --output "docs/index.html"
```

共有 runtime / style を GitHub Pages 上の正規 URL から読みたい場合は `--shared-asset-base-url` を指定します。

```powershell
uv run python -m stock_web_ui.render_index `
  --title "Stock Viewer" `
  --asset-version "20260501" `
  --shared-asset-base-url "https://expgolemclone.github.io/stock_web_ui/assets/" `
  --output "docs/index.html"
```

生成されるページは、利用側の `docs/assets/app.js` をアプリ固有スクリプトとして読み込みます。

## ローカルサーバーの利用例

利用側プロジェクトでは `IndexPage` と `serve()` を組み合わせ、アプリ固有の `docs/assets/` と共有 assets を同じ `/assets/` 配下として配信できます。

```python
from pathlib import Path

from stock_web_ui.handler import json_route
from stock_web_ui.page import IndexPage
from stock_web_ui.serve import serve


def main() -> None:
    serve(
        static_root=Path("docs/assets"),
        index_page=IndexPage(title="Stock Viewer", asset_version="20260501"),
        api_routes={
            "/api/stocks": json_route(lambda _params: []),
        },
    )


if __name__ == "__main__":
    main()
```

既定のサーバー設定は `config/cli_defaults.toml` で、初期値は `127.0.0.1:8080` です。

## StockTable の最小構成

利用側の `docs/assets/app.js` は、DOM 準備後に `StockTable.init(config)` を呼び出します。データは配列形式、またはタブ付きオブジェクト形式を受け付けます。

```javascript
StockTable.init({
  defaultTitle: "Stock Viewer",
  dataUrl: "/api/stocks",
  columns: [
    {
      key: "code",
      header: "コード",
      type: "code",
      render: (row) => String(row.code ?? ""),
      sortValue: (row) => Number(row.code ?? 0),
      stockLink: "shikiho",
    },
    {
      key: "name",
      header: "銘柄名",
      type: "name",
      render: (row) => String(row.name ?? ""),
      stockLink: "yazi",
    },
  ],
  metricThresholds: {},
  defaultSortKey: "code",
  defaultSortDirection: "asc",
});
```

`stockLink` には `monex`、`shikiho`、`yazi` を指定できます。ローカル実行時は `/open` や `/open-yazi/{code}` と連携し、`githubPages: true` の静的配信時は直接リンクまたは非リンクへ切り替わります。

## 配信

`docs/` は GitHub Pages の公開対象です。`main` への push で `.github/workflows/deploy-pages.yml` が `docs/` をアップロードします。

ページと共有 assets は次の URL から確認できます。

- 公開ページ: [https://expgolemclone.github.io/stock_web_ui/](https://expgolemclone.github.io/stock_web_ui/)
- 共有 assets: [https://expgolemclone.github.io/stock_web_ui/assets/](https://expgolemclone.github.io/stock_web_ui/assets/)

## 開発メモ

- 利用側プロジェクト固有の処理は利用側の `docs/assets/app.js` とデータ生成に置き、テーブル描画や共通リンク挙動はこのパッケージへ寄せます。
- `docs/assets/stock-table.js` と `docs/assets/stock-table.d.ts` は生成物ですが、配布と静的配信に必要なため Git 管理します。
- `/open` は `config/magic_numbers.toml` の URL prefix allowlist を通った URL だけを外部ブラウザで開きます。
- `/open-yazi/{code}` は `serve(..., yazi_base_dir=...)` を渡した場合だけ有効です。
