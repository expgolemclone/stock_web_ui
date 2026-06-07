/**
 * Balance-sheet hover chart component.
 *
 * Shows a dense 10-year XBRL balance-sheet tree when the user hovers over
 * a `td.code` cell. Data is loaded lazily through StockTable.
 */

type BsNode = {
  concept_namespace: string;
  concept_name: string;
  label: string;
  values: Array<number | null>;
  children: BsNode[];
};

type BsHistory = {
  ticker: string;
  periods: string[];
  baseline_period: string | null;
  baseline_total_assets: number | null;
  total_assets: Array<number | null>;
  unit: string;
  roots: BsNode[];
  error?: string;
};

interface StockTableRef {
  getBalanceSheetHistoryUrl(code: string): string | null;
}

type BsLaneKind = "assets" | "funding" | "other";

const SHOW_DELAY_MS = 260;
const HIDE_DELAY_MS = 180;
const BASE_HEIGHT = 220;
const MIN_YEAR_HEIGHT = 92;
const MAX_YEAR_HEIGHT = 430;
const MAX_DEPTH = 9;
const MILLION = 1_000_000;
const JAPANESE_TEXT_RE = /[\u3040-\u30ff\u3400-\u9fff]/;
const SCOPE_DEPTH_HUES: Record<BsLaneKind, number[]> = {
  assets: [166, 205, 130, 52, 292, 18, 242, 102, 334, 214],
  funding: [34, 354, 284, 220, 146, 92, 310, 190, 18, 250],
  other: [220, 286, 340, 32, 156, 96, 252, 12, 184, 314],
};
const SCOPE_DEPTH_LABELS = ["大分類", "内訳", "明細", "深部"];
const LABEL_OVERRIDES: Record<string, string> = {
  AccountsPayableTrade: "買掛金",
  AccountsPayableForConstructionContractsCNS: "工事未払金",
  AccountsPayableOther: "未払金",
  AccountsReceivableFromCompletedConstructionContractsCNS: "完成工事未収入金",
  AccountsReceivableOther: "未収入金",
  AccountsReceivableTrade: "売掛金",
  AccruedExpenses: "未払費用",
  AccumulatedDepreciationBuildings: "建物償却累計",
  AccumulatedDepreciationMachineryAndEquipment: "機械償却累計",
  AccumulatedDepreciationStructures: "構築物償却累計",
  AccumulatedDepreciationToolsFurnitureAndFixtures: "工具器具償却累計",
  AccumulatedDepreciationVehicles: "車両償却累計",
  AdvancesReceivedOnUncompletedConstructionContractsCNS: "未成工事受入金",
  AllowanceForDoubtfulAccountsIOAByGroup: "貸倒引当金",
  AssetRetirementObligationsNCL: "資産除去債務",
  Assets: "資産合計",
  AssetsAbstract: "資産",
  Buildings: "建物",
  BuildingsNet: "建物純額",
  BuildingsAndStructures: "建物構築物",
  CapitalStock: "資本金",
  CapitalSurplus: "資本剰余金",
  CapitalSurplusAbstract: "資本剰余金",
  CashAndDeposits: "現預金",
  ConstructionInProgress: "建設仮勘定",
  CurrentAssets: "流動資産合計",
  CurrentAssetsAbstract: "流動資産",
  CurrentLiabilities: "流動負債合計",
  CurrentLiabilitiesAbstract: "流動負債",
  DeferredTaxAssets: "繰延税金資産",
  DeferredTaxLiabilities: "繰延税金負債",
  DepositsReceived: "預り金",
  ElectronicallyRecordedMonetaryClaimsOperatingCA: "電子記録債権",
  GeneralReserve: "別途積立金",
  IncomeTaxesPayable: "未払法人税等",
  InsuranceFunds: "保険積立金",
  IntangibleAssets: "無形固定資産合計",
  IntangibleAssetsAbstract: "無形固定資産",
  Inventories: "棚卸資産",
  InvestmentSecurities: "投資有価証券",
  InvestmentsAndOtherAssets: "投資その他合計",
  InvestmentsAndOtherAssetsAbstract: "投資その他",
  Land: "土地",
  LeaseObligationsCL: "リース債務",
  LeaseObligationsNCL: "長期リース債務",
  LegalCapitalSurplus: "資本準備金",
  LegalRetainedEarnings: "利益準備金",
  Liabilities: "負債合計",
  LiabilitiesAbstract: "負債",
  LiabilitiesAndNetAssets: "負債純資産",
  LongTermLoansReceivableFromSubsidiariesAndAffiliates: "関係会社長期貸付",
  LongTermPrepaidExpenses: "長期前払費用",
  MachineryAndEquipment: "機械装置",
  MachineryAndEquipmentNet: "機械装置純額",
  NetAssets: "純資産合計",
  NetAssetsAbstract: "純資産",
  NoncurrentAssets: "固定資産合計",
  NoncurrentAssetsAbstract: "固定資産",
  NoncurrentLiabilities: "固定負債合計",
  NoncurrentLiabilitiesAbstract: "固定負債",
  NotesAndAccountsPayableTrade: "支払手形買掛金",
  NotesAndAccountsReceivableTrade: "受取手形売掛金",
  OtherCA: "その他流動資産",
  OtherCL: "その他流動負債",
  OtherCapitalSurplus: "その他資本剰余金",
  OtherIA: "その他無形資産",
  OtherIOA: "その他投資資産",
  OtherNCL: "その他固定負債",
  OtherRetainedEarningsAbstract: "その他利益剰余金",
  PrepaidExpenses: "前払費用",
  PropertyPlantAndEquipment: "有形固定資産合計",
  PropertyPlantAndEquipmentAbstract: "有形固定資産",
  ProvisionForBonuses: "賞与引当金",
  ProvisionForRetirementBenefits: "退職給付引当金",
  RawMaterialsAndSuppliesCNS: "材料貯蔵品",
  RealEstateForRentNet: "賃貸不動産純額",
  ReserveForAdvancedDepreciationOfNoncurrentAssets: "圧縮積立金",
  ReserveForDividendEqualization: "配当平均積立金",
  RetainedEarnings: "利益剰余金",
  RetainedEarningsAbstract: "利益剰余金",
  RetainedEarningsBroughtForward: "繰越利益剰余金",
  ShareholdersEquity: "株主資本合計",
  ShareholdersEquityAbstract: "株主資本",
  ShortTermInvestmentSecurities: "短期有価証券",
  StocksOfSubsidiariesAndAffiliates: "関係会社株式",
  Structures: "構築物",
  StructuresNet: "構築物純額",
  ToolsFurnitureAndFixtures: "工具器具備品",
  ToolsFurnitureAndFixturesNet: "工具器具備品純額",
  TreasuryStock: "自己株式",
  ValuationAndTranslationAdjustments: "評価換算差額合計",
  ValuationAndTranslationAdjustmentsAbstract: "評価換算差額",
  ValuationDifferenceOnAvailableForSaleSecurities: "その他有価証券評価差額",
  Vehicles: "車両運搬具",
  VehiclesNet: "車両運搬具純額",
};

let _tooltip: HTMLDivElement | null = null;
let _showTimer: ReturnType<typeof setTimeout> | null = null;
let _hideTimer: ReturnType<typeof setTimeout> | null = null;
let _activeCode: string | null = null;
let _requestSeq = 0;
const _cache: Map<string, BsHistory> = new Map();

export const BsChart = { init };

const _globalScope = globalThis as typeof globalThis & { BsChart?: typeof BsChart };
_globalScope.BsChart = BsChart;

function init(): void {
  document.addEventListener("mouseenter", _onMouseEnter, true);
  document.addEventListener("mouseleave", _onMouseLeave, true);
}

function _onMouseEnter(e: MouseEvent): void {
  const target = e.target instanceof Element ? e.target.closest("td.code") : null;
  if (!target) {
    return;
  }
  _cancelHide();
  _cancelShow();
  _showTimer = setTimeout(function (): void {
    void _showChart(target as HTMLTableCellElement);
  }, SHOW_DELAY_MS);
}

function _onMouseLeave(e: MouseEvent): void {
  const target = e.target instanceof Element ? e.target.closest("td.code") : null;
  if (!target) {
    return;
  }
  _cancelShow();
  _hideTimer = setTimeout(_hideChart, HIDE_DELAY_MS);
}

async function _showChart(cell: HTMLTableCellElement): Promise<void> {
  const code = _getCodeFromCell(cell);
  if (!code) {
    return;
  }
  const stockTable = _getStockTable();
  const url = stockTable?.getBalanceSheetHistoryUrl(code) ?? null;
  if (!url) {
    return;
  }

  _activeCode = code;
  const seq = ++_requestSeq;
  _ensureTooltip();
  _renderLoading(code);
  _positionTooltip(cell);

  try {
    const history = await _loadHistory(url);
    if (_activeCode !== code || seq !== _requestSeq) {
      return;
    }
    _renderHistory(code, history);
    _positionTooltip(cell);
  } catch (err) {
    console.error(err);
    if (_activeCode === code && seq === _requestSeq) {
      _renderError(code, "BS履歴を読み込めませんでした。");
      _positionTooltip(cell);
    }
  }
}

function _hideChart(): void {
  _activeCode = null;
  if (_tooltip) {
    _tooltip.style.display = "none";
  }
}

function _ensureTooltip(): void {
  if (_tooltip) {
    _tooltip.style.display = "";
    return;
  }
  _tooltip = document.createElement("div");
  _tooltip.className = "bs-tooltip";
  _tooltip.addEventListener("mouseenter", _cancelHide);
  _tooltip.addEventListener("mouseleave", function (): void {
    _hideTimer = setTimeout(_hideChart, HIDE_DELAY_MS);
  });
  document.body.appendChild(_tooltip);
}

function _positionTooltip(cell: HTMLTableCellElement): void {
  if (!_tooltip) {
    return;
  }
  const rect = cell.getBoundingClientRect();
  const tooltipWidth = _tooltip.offsetWidth;
  const tooltipHeight = _tooltip.offsetHeight;
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;

  let left = rect.left;
  if (left + tooltipWidth > viewportWidth) {
    left = viewportWidth - tooltipWidth - 12;
  }
  if (left < 12) {
    left = 12;
  }

  let top = rect.bottom + 8;
  if (top + tooltipHeight > viewportHeight) {
    top = rect.top - tooltipHeight - 8;
  }
  if (top < 12) {
    top = 12;
  }

  _tooltip.style.left = left + "px";
  _tooltip.style.top = top + "px";
}

async function _loadHistory(url: string): Promise<BsHistory> {
  const cached = _cache.get(url);
  if (cached) {
    return cached;
  }
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) {
    throw new Error("HTTP " + response.status);
  }
  const history = _normalizeHistory(await response.json());
  if (!history.error) {
    _cache.set(url, history);
  }
  return history;
}

function _normalizeHistory(raw: unknown): BsHistory {
  if (!raw || typeof raw !== "object") {
    return _emptyHistory("invalid_payload");
  }
  const record = raw as Record<string, unknown>;
  return {
    ticker: typeof record.ticker === "string" ? record.ticker : "",
    periods: Array.isArray(record.periods) ? record.periods.filter(_isString) : [],
    baseline_period: typeof record.baseline_period === "string" ? record.baseline_period : null,
    baseline_total_assets: _toFiniteNumber(record.baseline_total_assets),
    total_assets: Array.isArray(record.total_assets) ? record.total_assets.map(_toFiniteNumber) : [],
    unit: typeof record.unit === "string" ? record.unit : "JPY",
    roots: Array.isArray(record.roots) ? record.roots.map(_normalizeNode).filter(_isNode) : [],
    error: typeof record.error === "string" ? record.error : undefined,
  };
}

function _normalizeNode(raw: unknown): BsNode | null {
  if (!raw || typeof raw !== "object") {
    return null;
  }
  const record = raw as Record<string, unknown>;
  const conceptName = typeof record.concept_name === "string" ? record.concept_name : "";
  const children = Array.isArray(record.children) ? record.children.map(_normalizeNode).filter(_isNode) : [];
  const sourceLabel = typeof record.label === "string" && record.label ? record.label : conceptName;
  const label = _displayLabel(sourceLabel, conceptName);
  if (!conceptName && !label && children.length === 0) {
    return null;
  }
  return {
    concept_namespace: typeof record.concept_namespace === "string" ? record.concept_namespace : "",
    concept_name: conceptName,
    label,
    values: Array.isArray(record.values) ? record.values.map(_toFiniteNumber) : [],
    children,
  };
}

function _emptyHistory(error: string): BsHistory {
  return {
    ticker: "",
    periods: [],
    baseline_period: null,
    baseline_total_assets: null,
    total_assets: [],
    unit: "JPY",
    roots: [],
    error,
  };
}

function _renderLoading(code: string): void {
  if (!_tooltip) {
    return;
  }
  _tooltip.innerHTML = '<div class="bs-tooltip-message">' + escapeHtml(code) + " BSを読み込み中...</div>";
}

function _renderError(code: string, message: string): void {
  if (!_tooltip) {
    return;
  }
  _tooltip.innerHTML = '<div class="bs-tooltip-message"><b>' + escapeHtml(code) + "</b> " + escapeHtml(message) + "</div>";
}

function _renderHistory(code: string, history: BsHistory): void {
  if (!_tooltip) {
    return;
  }
  if (history.error || history.periods.length === 0 || !history.baseline_total_assets) {
    _renderError(code, _errorMessage(history.error));
    return;
  }

  const years = history.periods.map(function (period, index): string {
    return _renderYear(history, period, index);
  }).join("");

  _tooltip.innerHTML = [
    '<div class="bs-head">',
    '<div><span class="bs-kicker">BALANCE SHEET / XBRL</span><strong>' + escapeHtml(code) + "</strong></div>",
    '<div class="bs-head-meta">',
    '<div class="bs-base">基準 ' + escapeHtml(history.baseline_period ?? "-") + " / " + escapeHtml(_formatMoney(history.baseline_total_assets)) + "</div>",
    _renderScopeLegend(),
    "</div>",
    "</div>",
    '<div class="bs-years">' + years + "</div>",
  ].join("");
}

function _renderYear(history: BsHistory, period: string, index: number): string {
  const total = history.total_assets[index] ?? null;
  const baseline = history.baseline_total_assets ?? null;
  const ratio = total !== null && baseline !== null && baseline > 0 ? total / baseline : 1;
  const height = _clamp(Math.round(BASE_HEIGHT * ratio), MIN_YEAR_HEIGHT, MAX_YEAR_HEIGHT);
  const lanes = _groupRoots(history.roots);
  const denominator = Math.max(Math.abs(total ?? baseline ?? 1), 1);

  return [
    '<section class="bs-year" style="--bs-year-height:' + String(height) + 'px">',
    '<div class="bs-year-label">' + escapeHtml(_formatPeriod(period)) + "</div>",
    '<div class="bs-year-total">' + escapeHtml(_formatMoney(total)) + "</div>",
    '<div class="bs-lanes">',
    _renderLane("資産", lanes.assets, index, denominator, "assets"),
    _renderLane("負債+純資産", lanes.funding, index, denominator, "funding"),
    _renderLane("その他", lanes.other, index, denominator, "other"),
    "</div>",
    "</section>",
  ].join("");
}

function _renderLane(
  title: string,
  roots: BsNode[],
  periodIndex: number,
  denominator: number,
  kind: BsLaneKind,
): string {
  if (roots.length === 0) {
    return "";
  }
  return [
    '<div class="bs-lane bs-lane-' + kind + '">',
    '<div class="bs-lane-title">' + escapeHtml(title) + "</div>",
    '<div class="bs-stack">',
    _renderSegments(roots, periodIndex, denominator, 0, [], kind),
    "</div>",
    "</div>",
  ].join("");
}

function _renderSegments(
  nodes: BsNode[],
  periodIndex: number,
  denominator: number,
  depth: number,
  path: string[],
  laneKind: BsLaneKind,
): string {
  if (depth > MAX_DEPTH) {
    return "";
  }
  return nodes.map(function (node): string {
    const value = _nodeValue(node, periodIndex);
    const absValue = Math.abs(value ?? _sumChildValues(node, periodIndex));
    if (absValue <= 0 && node.children.length === 0) {
      return "";
    }
    const grow = Math.max(absValue / Math.max(denominator, 1), 0.0002);
    const nextPath = path.concat([node.label || node.concept_name]);
    const conceptSuffix = node.concept_name ? " | " + node.concept_name : "";
    const scopeStyle = _scopeStyle(node, laneKind, depth, nextPath);
    const childHtml = node.children.length > 0
      ? '<div class="bs-children">' + _renderSegments(node.children, periodIndex, Math.max(absValue, 1), depth + 1, nextPath, laneKind) + "</div>"
      : "";
    const labelHtml = depth <= 2
      ? '<span class="bs-segment-label">' + escapeHtml(node.label || node.concept_name) + "</span>"
      : "";
    return [
      '<div class="bs-segment depth-' + String(Math.min(depth, 4)) + (value !== null && value < 0 ? " is-negative" : "") + '"',
      ' style="--bs-grow:' + String(grow) + ";" + scopeStyle + '"',
      ' title="' + escapeHtml(nextPath.join(" / ") + conceptSuffix + " | XBRL階層 " + String(depth + 1) + " | " + _formatMoney(value)) + '">',
      labelHtml,
      childHtml,
      "</div>",
    ].join("");
  }).join("");
}

function _renderScopeLegend(): string {
  const swatches = SCOPE_DEPTH_LABELS.map(function (label, depth): string {
    const style = _scopeStyleForDepth("assets", depth, label);
    return [
      '<span class="bs-scope-legend-item">',
      '<i style="' + style + '"></i>',
      escapeHtml(label),
      "</span>",
    ].join("");
  }).join("");
  return '<div class="bs-scope-legend" aria-label="XBRL階層色">' + swatches + "</div>";
}

function _scopeStyle(
  node: BsNode,
  laneKind: BsLaneKind,
  depth: number,
  path: string[],
): string {
  const key = [node.concept_namespace, node.concept_name, path.join("/")].join("#");
  return _scopeStyleForDepth(laneKind, depth, key);
}

function _scopeStyleForDepth(laneKind: BsLaneKind, depth: number, key: string): string {
  const palette = SCOPE_DEPTH_HUES[laneKind];
  const baseHue = palette[depth % palette.length];
  const jitter = depth === 0 ? 0 : (_hashText(key) % 17) - 8;
  const hue = (baseHue + jitter + 360) % 360;
  const saturation = _clamp(76 - depth * 3, 48, 82);
  const lightness = _clamp(47 - depth * 2, 26, 52);
  return [
    "--bs-scope-hue:" + String(hue),
    "--bs-scope-saturation:" + String(saturation) + "%",
    "--bs-scope-lightness:" + String(lightness) + "%",
  ].join(";");
}

function _hashText(value: string): number {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash * 31 + value.charCodeAt(i)) % 9973;
  }
  return hash;
}

function _groupRoots(roots: BsNode[]): { assets: BsNode[]; funding: BsNode[]; other: BsNode[] } {
  const grouped = { assets: [] as BsNode[], funding: [] as BsNode[], other: [] as BsNode[] };
  for (const root of roots.flatMap(_unwrapStructuralRoot)) {
    const kind = _classifyRoot(root);
    grouped[kind].push(root);
  }
  return grouped;
}

function _unwrapStructuralRoot(root: BsNode): BsNode[] {
  if (!_isStructuralWrapper(root)) {
    return [root];
  }
  return root.children.flatMap(_unwrapStructuralRoot);
}

function _isStructuralWrapper(root: BsNode): boolean {
  if (root.children.length === 0) {
    return false;
  }
  const hasOwnValue = root.values.some(function (value): boolean {
    return value !== null && Math.abs(value) > 0;
  });
  if (hasOwnValue) {
    return false;
  }
  const text = (root.label + " " + root.concept_name).toLowerCase();
  return !root.concept_name || text.includes("heading") || text.includes("lineitems");
}

function _classifyRoot(root: BsNode): BsLaneKind {
  const text = (root.label + " " + root.concept_name).toLowerCase();
  if (
    text.includes("負債")
    || text.includes("純資産")
    || text.includes("資本")
    || text.includes("liabil")
    || text.includes("equity")
    || text.includes("netassets")
    || text.includes("net assets")
  ) {
    return "funding";
  }
  if (text.includes("資産") || text.includes("asset")) {
    return "assets";
  }
  return "other";
}

function _displayLabel(sourceLabel: string, conceptName: string): string {
  const label = sourceLabel || conceptName;
  if (!label) {
    return "";
  }
  if (JAPANESE_TEXT_RE.test(label)) {
    return label;
  }
  const override = LABEL_OVERRIDES[conceptName] ?? LABEL_OVERRIDES[label];
  if (override) {
    return override;
  }
  return _splitConceptLabel(label);
}

function _splitConceptLabel(label: string): string {
  return label
    .replace(/Abstract$/u, "")
    .replace(/LineItems$/u, "")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .trim();
}

function _nodeValue(node: BsNode, periodIndex: number): number | null {
  return _toFiniteNumber(node.values[periodIndex]);
}

function _sumChildValues(node: BsNode, periodIndex: number): number {
  return node.children.reduce(function (sum, child): number {
    const value = _nodeValue(child, periodIndex);
    return sum + Math.abs(value ?? _sumChildValues(child, periodIndex));
  }, 0);
}

function _getCodeFromCell(cell: HTMLTableCellElement): string | null {
  const text = cell.textContent?.trim() ?? "";
  return text || null;
}

function _getStockTable(): StockTableRef | null {
  const g = globalThis as typeof globalThis & { StockTable?: StockTableRef };
  return g.StockTable ?? null;
}

function _errorMessage(error: string | undefined): string {
  if (!error) {
    return "BS履歴がありません。";
  }
  return "BS履歴を表示できません: " + error;
}

function _formatPeriod(period: string): string {
  if (period.length >= 7 && period[4] === "-") {
    return period.substring(2, 4) + "/" + period.substring(5, 7);
  }
  return period;
}

function _formatMoney(value: number | null): string {
  if (value === null) {
    return "-";
  }
  return (value / MILLION).toLocaleString("ja-JP", { maximumFractionDigits: 0 }) + "百万円";
}

function _toFiniteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function _isString(value: unknown): value is string {
  return typeof value === "string";
}

function _isNode(value: BsNode | null): value is BsNode {
  return value !== null;
}

function _clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function _cancelShow(): void {
  if (_showTimer !== null) {
    clearTimeout(_showTimer);
    _showTimer = null;
  }
}

function _cancelHide(): void {
  if (_hideTimer !== null) {
    clearTimeout(_hideTimer);
    _hideTimer = null;
  }
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#x27;");
}

init();
