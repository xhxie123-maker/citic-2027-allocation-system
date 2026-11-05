/* 决策引擎：状态、评分、配置求解、情景与时间轴
 * 依赖 data.js（DATA / UNIVERSE）
 */
const STORE_KEY = "citic2027.state.v1";

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const fmtW = v => (Math.round(v * 10) / 10).toFixed(1) + "%";
const fmtM = v => (v < 0 ? "-¥" : "¥") + Math.round(Math.abs(v)).toLocaleString("zh-CN");
const fmtPct2 = v => (v >= 0 ? "+" : "") + (Math.round(v * 10) / 10).toFixed(1) + "%";

function defaultState() {
  return {
    tier: "micro",
    capital: 3000,
    horizon: 12,
    startDate: "2026-11-06",
    inputs: { earnings: 9.5, width: 50, ai: 20, risk: 0 },
    liq: { fed: 0, south: 0, dom: 0 },
    anchors: { hs300: 45, divYield: 4.2, hstech: 2.4 },
    signals: { fed: 0, south: 0, unlock: 1, fiscal: 0, capex: 0, geopol: 0 },
    holdings: {},
    log: [],
    checks: {}
  };
}

let S = load();

function load() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (!raw) return defaultState();
    const parsed = JSON.parse(raw);
    const base = defaultState();
    return {
      ...base, ...parsed,
      inputs: { ...base.inputs, ...(parsed.inputs || {}) },
      liq: { ...base.liq, ...(parsed.liq || {}) },
      anchors: { ...base.anchors, ...(parsed.anchors || {}) },
      signals: { ...base.signals, ...(parsed.signals || {}) },
      holdings: { ...(parsed.holdings || {}) },
      checks: { ...(parsed.checks || {}) },
      log: Array.isArray(parsed.log) ? parsed.log : []
    };
  } catch (e) {
    return defaultState();
  }
}

function save() {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(S)); } catch (e) { /* 存储不可用时静默 */ }
}

/* ---------- 维度评分 ---------- */
function dimScores() {
  const liqTxt = [
    S.liq.fed ? "降息已落地" : "降息未落地",
    ["南向流出", "南向中性", "南向加速"][S.liq.south + 1],
    ["国内收紧", "国内中性", "国内宽松"][S.liq.dom + 1]
  ].join(" · ");

  return DATA.dims.map(d => {
    let raw, score;
    if (d.k === "val") {
      raw = S.anchors.hs300;
      score = d.score(raw);
    } else if (d.k === "liq") {
      raw = liqTxt;
      score = d.score(null, S.liq);
    } else {
      raw = S.inputs[d.k];
      score = d.score(raw);
    }
    score = clamp(score, 0, 100);
    return {
      k: d.k, name: d.name, weight: d.weight, raw, score,
      contrib: d.weight * score, desc: d.desc, src: d.src,
      unit: d.input && d.input.unit ? d.input.unit : ""
    };
  });
}

function gradeOf(total) {
  if (total >= 75) return { t: "积极", cls: "ok", d: "研报条件整体有利，可执行目标配置" };
  if (total >= 60) return { t: "偏积极", cls: "acc", d: "可推进建仓，结构上仍以底仓为主" };
  if (total >= 45) return { t: "中性", cls: "gray", d: "维持目标配置，等待信号确认" };
  if (total >= 30) return { t: "偏谨慎", cls: "warn", d: "压缩卫星，提高缓冲" };
  return { t: "防御", cls: "bad", d: "以守为主，优先保住底仓" };
}

/* ---------- 权重归一 ---------- */
function normalize(parts) {
  const arr = parts.map(p => ({ ...p, wv: Math.max(0, p.w + (p.d || 0)) }));
  let sum = arr.reduce((a, p) => a + p.wv, 0);
  if (sum <= 0.001) {
    arr.forEach(p => p.wv = p.w);
    sum = arr.reduce((a, p) => a + p.wv, 0) || 1;
  }
  return arr.map(p => ({ ...p, w: p.wv / sum * 100 }));
}

/* ---------- 主计算 ---------- */
function compute() {
  const tierKey = S.tier;
  const tier = DATA.tiers[tierKey];
  const micro = tierKey === "micro";
  const dims = dimScores();
  const total = dims.reduce((a, d) => a + d.contrib, 0);
  const grade = gradeOf(total);

  const base = tier.layers;
  const eqBase = base.core + base.sat + base.hk;
  const mult = clamp(1 + (total - 50) / 50 * 0.35, 0.60, 1.35);
  /* 小额档锁死 10% 缓冲：金额小、期限短，缓冲层是唯一的再平衡弹药 */
  const eqCeil = micro ? 90 : 95;
  const eq = clamp(eqBase * mult, 25, eqCeil);
  const buf = 100 - eq;
  const core = eq * base.core / eqBase;
  const sat = eq * base.sat / eqBase;
  const hk = eq * base.hk / eqBase;

  const width = dims.find(d => d.k === "width").score;
  const aiScore = dims.find(d => d.k === "ai").score;
  const sig = S.signals;

  /* 底仓：行情宽度 → 宽基↑ / 红利↓；其余对冲 */
  const coreParts = micro
    ? normalize([
        { k: "broad", name: "宽基（沪深300 或 中证A500 二选一）", w: 55, d: (width - 50) * 0.15 },
        { k: "div", name: "红利低波（优先低波因子）", w: 45, d: -(width - 50) * 0.15 }
      ])
    : normalize([
        { k: "broad", name: "宽基（沪深300 / 中证A500）", w: 45, d: (width - 50) * 0.20 },
        { k: "div", name: "红利 / 红利低波 / 央企红利", w: 35, d: -(width - 50) * 0.12 },
        { k: "fcf", name: "自由现金流", w: 20, d: -(width - 50) * 0.08 }
      ]);

  /* 卫星：AI 硬件随算力动能与降速信号调整；内需随财政信号抬升 */
  const aiD = (aiScore - 50) * 0.20 + (sig.capex ? -12 : 0) + (sig.geopol ? -8 : 0);
  const consD = (sig.fiscal ? 10 : 0) + (width - 50) * 0.05;
  const satParts = micro
    ? normalize([
        { k: "ai", name: "科创芯片 / 通信（硬件端）", w: 60, d: aiD },
        { k: "mfg", name: "高端制造 / 电力设备", w: 40, d: 0 }
      ])
    : normalize([
        { k: "ai", name: "AI 硬件（半导体设备 / 存储 / 光通信）", w: 40, d: aiD },
        { k: "mfg", name: "优秀出海制造（机械 / 船舶 / 电力设备）", w: 35, d: 0 },
        { k: "cons", name: "内需修复（消费 / 医药 / 养殖）", w: 25, d: consD }
      ]);

  /* 港股：先红利后成长，由降息 / 南向 / 解禁 / 地缘共同决定 */
  const growD = (sig.fed ? 20 : 0) + (sig.south ? 10 : 0) - (sig.unlock ? 15 : 0) - (sig.geopol ? 15 : 0);
  const hkParts = normalize([
    { k: "hkdiv", name: "港股通红利 / 央企红利", w: 70, d: -growD },
    { k: "hkgrow", name: "恒生科技 / 港股通互联网", w: 30, d: growD }
  ]);

  /* 缓冲：地缘升级加黄金 */
  const goldD = sig.geopol ? 10 : 0;
  const bufParts = micro
    ? [{ k: "cash", name: "货币 ETF / 货基（弹药）", w: 100 }]
    : normalize([
        { k: "gold", name: "黄金", w: 60, d: goldD },
        { k: "cash", name: "货币 / 短债", w: 40, d: -goldD }
      ]);

  const leaves = [];
  const push = (arr, layerPct, layerKey, layerName) => {
    if (layerPct <= 0.01) return;
    arr.forEach(p => {
      const weightPct = layerPct * p.w / 100;
      leaves.push({
        k: p.k, name: p.name, layer: layerKey, layerName,
        weightPct, amount: S.capital * weightPct / 100,
        universe: UNIVERSE[p.k] || []
      });
    });
  };
  push(coreParts, core, "core", "核心底仓");
  push(satParts, sat, "sat", "卫星进攻");
  push(hkParts, hk, "hk", "港股");
  push(bufParts, buf, "buf", "缓冲层");

  /* 单赛道硬上限：研报「不押单一赛道、单一主题 ≤15%」，超限自动压回并转给同层其余子类 */
  const trackKeys = ["ai", "mfg", "cons", "hkgrow"];
  const capped = [];
  let excess = 0;
  leaves.forEach(l => {
    if (trackKeys.indexOf(l.k) >= 0 && l.weightPct > 15) {
      excess += l.weightPct - 15;
      l.weightPct = 15;
      l.capped = true;
      capped.push(l.name);
    }
  });
  if (excess > 0.01) {
    const receivers = leaves.filter(l => trackKeys.indexOf(l.k) < 0 && l.weightPct > 0);
    if (receivers.length) {
      const tot = receivers.reduce((a, l) => a + l.weightPct, 0);
      receivers.forEach(l => l.weightPct += excess * l.weightPct / tot);
    } else {
      const fb = leaves.find(l => l.k === "broad") || leaves.find(l => l.k === "cash");
      if (fb) fb.weightPct += excess;
    }
  }
  leaves.forEach(l => l.amount = S.capital * l.weightPct / 100);

  const sumLayer = lk => leaves.filter(l => l.layer === lk).reduce((a, l) => a + l.weightPct, 0);
  const coreA = sumLayer("core"), satA = sumLayer("sat"), hkA = sumLayer("hk"), bufA = sumLayer("buf");

  /* 防御 / 进攻配比（合计 100%） */
  const hkGrowLeaf = leaves.find(l => l.k === "hkgrow");
  const offRatio = satA + (hkGrowLeaf ? hkGrowLeaf.weightPct : 0);
  const defRatio = coreA + bufA + (hkA - (hkGrowLeaf ? hkGrowLeaf.weightPct : 0));

  /* 一致性检查 */
  const warns = [];
  if (capped.length) warns.push({ type: "info", msg: "已按研报单赛道上限，将「" + capped.join("、") + "」压回 15%，超出部分转给同层其余子类。" });
  if (satA > 40.001) warns.push({ type: "warn", msg: "卫星仓合计 " + fmtW(satA) + "，高于研报主张的适度分散区间（≤40%），请确认风险承受能力。" });
  if (S.horizon <= 12 && bufA < 5) warns.push({ type: "warn", msg: "1 年期资金仅保留 " + fmtW(bufA) + " 缓冲（研报口径建议 ≥5%，小额账户建议 10%）：到期与再平衡都需要弹药。" });
  if (S.capital < 10000 && !micro) warns.push({ type: "info", msg: "本金低于 1 万元，建议切换到「小额精简」档：3—4 只标的即可，避免碎片化交易成本。" });
  if (S.capital >= 10000 && micro) warns.push({ type: "info", msg: "当前为小额精简档，本金已超过 1 万元，可考虑切回「稳健型」，恢复港股与缓冲分层。" });

  const anchorNotes = DATA.anchors.map(a => {
    const v = S.anchors[a.k];
    return { k: a.k, name: a.name, value: v, unit: a.unit, text: a.rule(v) };
  });
  if (S.anchors.hs300 > 70) warns.push({ type: "info", msg: "沪深 300 PE 分位 " + S.anchors.hs300 + "%：宽基停止新增加仓，只做再平衡。" });
  if (S.anchors.divYield < 3.5) warns.push({ type: "warn", msg: "红利指数股息率 " + S.anchors.divYield + "% 已低于 3.5% 阈值：红利仓位不再新增，只保留存量。" });
  if (S.anchors.hstech < 10) warns.push({ type: "info", msg: "恒生科技 PE 分位 " + S.anchors.hstech + "%（研报口径 2.4%）：属历史低位，可分批越跌越买。" });

  const action = total >= 70
    ? "研报条件偏顺：可按目标配置推进，回调日加仓，不追涨。"
    : total >= 55
      ? "维持目标配置，按计划分批推进，结构优先于仓位。"
      : total >= 40
        ? "以结构代替仓位：红利 + 宽基为主，卫星只留硬件端，等信号再动。"
        : "转向防守：压缩卫星、提高缓冲，优先保住底仓不被动摇。";

  return {
    tier, tierKey, micro, dims, total, grade,
    core: coreA, sat: satA, hk: hkA, buf: bufA, eq: coreA + satA + hkA, mult,
    leaves, coreParts, satParts, hkParts, bufParts, offRatio, defRatio,
    warns, anchorNotes, action
  };
}

/* ---------- 情景压力测试 ---------- */
function scenarios(r) {
  return DATA.scenarios.map(sc => {
    const equityRet = sc.equity;
    const bufRet = sc.buffer;
    const port = (r.eq * equityRet + r.buf * bufRet) / 100;
    return {
      ...sc,
      port,
      amount: S.capital * (1 + port / 100)
    };
  });
}

/* ---------- 时间轴 ---------- */
function stageInfo() {
  const start = new Date(S.startDate + "T00:00:00");
  const now = new Date();
  const months = (now - start) / (1000 * 3600 * 24 * 30.44);
  const H = S.horizon;
  const pct = clamp(months / H * 100, 0, 100);
  let stage, hint;
  if (months < 0) { stage = "未启动"; hint = "起始日期晚于今天，请核对。"; }
  else if (months < 3) { stage = "建仓期"; hint = "按配置表分批建仓，单周大跌才动用缓冲弹药。"; }
  else if (months < H - 1) { stage = "持有期"; hint = "只做季度再平衡与信号确认，不因波动改变结构。"; }
  else if (months < H) { stage = "减仓期"; hint = "逐批减仓兑现，不管盈亏，按纪律执行。"; }
  else { stage = "已到期"; hint = "该期资金已到期，应清零回归现金或重开新一轮。"; }
  return { months: Math.max(months, 0), pct, stage, hint, H, start };
}
