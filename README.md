- `stock_web_ui`はstock関連のweb_uiの共通moduleである.
- `../formula_screening/`, `../invest_like_legends` から参照されている. - 修正を行うときは, 3つのrepoで一貫性を保つこと. - 積極的に`stock_web_ui`の共通moduleに機能を移行し,  
  `../formula_screening/`, `../invest_like_legends` にはプロジェクト固有の差分しか置かないこと.
