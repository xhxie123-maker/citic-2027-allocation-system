/* 引擎不变量测试：权重合计、金额合计、单赛道上限、极端输入不产生 NaN
 * 运行：node tests/engine.test.js
 */
const fs = require("fs");
const vm = require("vm");
const path = require("path");

const assets = path.join(__dirname, "..", "assets") + path.sep;
vm.runInThisContext(fs.readFileSync(assets + "data.js", "utf8"));
vm.runInThisContext(fs.readFileSync(assets + "engine.js", "utf8"));

let failed = 0;

function check(label, st, expect) {
  S = Object.assign({}, S, st);
  const r = compute();
  const sumW = r.leaves.reduce((a, l) => a + l.weightPct, 0);
  const sumA = r.leaves.reduce((a, l) => a + l.amount, 0);
  const layerSum = r.core + r.sat + r.hk + r.buf;
  const nan = r.leaves.some(l => !isFinite(l.weightPct) || !isFinite(l.amount));

  const bad = [];
  if (Math.abs(sumW - 100) > 0.01) bad.push("权重合计 " + sumW.toFixed(2));
  if (Math.abs(layerSum - 100) > 0.01) bad.push("层合计 " + layerSum.toFixed(2));
  if (Math.abs(sumA - S.capital) > 1) bad.push("金额合计 " + Math.round(sumA));
  if (nan) bad.push("存在 NaN");
  if (expect.eq && Math.abs(r.eq - expect.eq) > 0.5) bad.push("权益中枢 " + r.eq.toFixed(1) + " ≠ " + expect.eq);
  if (expect.maxTrack) {
    const over = r.leaves.filter(l => ["ai", "mfg", "cons", "hkgrow"].indexOf(l.k) >= 0 && l.weightPct > 15.01);
    if (over.length) bad.push("单赛道超限：" + over.map(o => o.k).join(","));
  }
  if (bad.length) failed++;
  console.log((bad.length ? "FAIL " : "PASS ") + label + " | score=" + r.total.toFixed(1) + " eq=" + r.eq.toFixed(1) +
    " | core/sat/hk/buf=" + [r.core, r.sat, r.hk, r.buf].map(x => x.toFixed(1)).join("/") +
    (bad.length ? " | " + bad.join("; ") : ""));
  return r;
}

check("默认：小额 1000 元", {}, { eq: 90, maxTrack: true });
check("稳健 100 万", { tier: "balanced", capital: 1000000, signals: {} }, { eq: 95, maxTrack: true });
check("防守 + 高估值", { tier: "defensive", capital: 500000, anchors: { hs300: 82, divYield: 3.2, hstech: 20 } }, { maxTrack: true });
check("进取 + 全部信号", { tier: "aggressive", capital: 2000000, signals: { fed: 1, south: 1, unlock: 1, fiscal: 1, capex: 1, geopol: 1 } }, { maxTrack: true });
check("极端输入", { tier: "aggressive", capital: 1000, inputs: { earnings: -50, width: 0, ai: -50, risk: 3 }, liq: { fed: 0, south: -1, dom: -1 }, anchors: { hs300: 99, divYield: 2, hstech: 90 } }, { maxTrack: true });

/* ---- v1.1 新增结构断言 ---- */
function assert(label, ok, extra) {
  if (!ok) failed++;
  console.log((ok ? "PASS " : "FAIL ") + label + (extra ? " | " + extra : ""));
}

S = Object.assign({}, defaultState(), { tier: "balanced", capital: 1000000, signals: {} });
let r2 = compute();
const bufLeaves = r2.leaves.filter(l => l.layer === "buf");
assert("缓冲层三分（黄金 / 债券 / 货币）",
  bufLeaves.length === 3 && bufLeaves.some(l => l.k === "bond") &&
  Math.abs(bufLeaves.reduce((a, l) => a + l.weightPct, 0) - r2.buf) < 0.01,
  bufLeaves.map(l => l.k + " " + l.weightPct.toFixed(1)).join(" / "));

S = Object.assign({}, defaultState(), { tier: "aggressive", capital: 2000000, signals: { techwin: 1, hkconnect: 1 } });
r2 = compute();
const aiLeaf = r2.leaves.find(l => l.k === "ai") || { weightPct: 0 };
const growLeaf = r2.leaves.find(l => l.k === "hkgrow") || { weightPct: 0 };
assert("新信号（techwin / hkconnect）仍在 15% 单赛道上限内",
  aiLeaf.weightPct <= 15.01 && growLeaf.weightPct <= 15.01,
  "ai=" + aiLeaf.weightPct.toFixed(1) + " hkgrow=" + growLeaf.weightPct.toFixed(1) +
  " sum=" + r2.leaves.reduce((a, l) => a + l.weightPct, 0).toFixed(2));

assert("解禁窗口判定可用", typeof inUnlockWindow === "function",
  "now=" + (typeof inUnlockWindow === "function" ? inUnlockWindow() : "-"));

/* ---- v1.2 新增结构断言：物理 AI 信号只抬制造分支、不越 15% ---- */
S = Object.assign({}, defaultState(), { tier: "balanced", capital: 1000000, signals: { phys: 1 } });
const rPhys = compute();
const mfgOn = (rPhys.leaves.find(l => l.k === "mfg") || { weightPct: 0 }).weightPct;
const aiOff = (rPhys.leaves.find(l => l.k === "ai") || { weightPct: 0 }).weightPct;
S = Object.assign({}, defaultState(), { tier: "balanced", capital: 1000000, signals: {} });
const rBase = compute();
const mfgBase = (rBase.leaves.find(l => l.k === "mfg") || { weightPct: 0 }).weightPct;
assert("物理 AI 信号：制造分支上调、AI 硬件略让、均在 15% 上限内",
  mfgOn > mfgBase + 0.5 && aiOff < (rBase.leaves.find(l => l.k === "ai") || { weightPct: 0 }).weightPct + 0.01 &&
  mfgOn <= 15.01 && aiOff <= 15.01,
  "mfg " + mfgBase.toFixed(1) + " → " + mfgOn.toFixed(1) + " / ai " + aiOff.toFixed(1) +
  " sum=" + rPhys.leaves.reduce((a, l) => a + l.weightPct, 0).toFixed(2));

assert("v1.2 基线自洽（研报 14 / 参数 51 / 信号 9 / 规则 14）",
  DATA.research.length === 14 && DATA.params.length === 51 && DATA.signals.length === 9 && DATA.rules.length === 14,
  "research=" + DATA.research.length + " params=" + DATA.params.length +
  " signals=" + DATA.signals.length + " rules=" + DATA.rules.length);

/* ---- v1.3：默认本金 1000 元 + 每日可监测的信号雷达 ---- */
assert("默认本金改为 1000 元", defaultState().capital === 1000,
  "capital=" + defaultState().capital);

assert("每个信号均可每日监测（指标 / 来源 / 阈值 / 周期）",
  DATA.signals.every(s => s.watch && s.where && s.thr && s.stale > 0),
  "缺项：" + (DATA.signals.filter(s => !(s.watch && s.where && s.thr && s.stale)).map(s => s.k).join(",") || "-"));

assert("每日巡检清单存在", Array.isArray(DATA.routine) && DATA.routine.length >= 4,
  "routine=" + (DATA.routine || []).length);

S = Object.assign({}, defaultState(), { sigAt: {} });
let rRadar = radarStatus();
assert("雷达初始：9 项全部未核过",
  rRadar.list.length === 9 && rRadar.list.every(x => x.level === "none" && x.days === null),
  "checkedAll=" + rRadar.checkedAll);

markChecked("fed"); markChecked("south");
rRadar = radarStatus();
assert("打卡后当天即为有效（ok）",
  rRadar.checkedAll === 2 && rRadar.list.filter(x => x.k === "fed")[0].level === "ok",
  "checkedAll=" + rRadar.checkedAll + " fed=" + rRadar.list.filter(x => x.k === "fed")[0].level);

S.sigAt = { fed: "2026-11-01", south: "2026-10-01" };
rRadar = radarStatus();
assert("超期判定分级（warn / expired）",
  rRadar.list.filter(x => x.k === "fed")[0].level !== "ok" &&
  rRadar.list.filter(x => x.k === "south")[0].level === "expired" &&
  rRadar.expiredCount >= 1,
  "fed=" + rRadar.list.filter(x => x.k === "fed")[0].level +
  " south=" + rRadar.list.filter(x => x.k === "south")[0].level +
  " expired=" + rRadar.expiredCount);

S = Object.assign({}, defaultState(), { tier: "balanced", capital: 1000000, signals: {} });
r2 = compute();

const r = compute();
console.log("\n情景：", scenarios(r).map(x => x.name + " " + x.port.toFixed(1) + "% → " + Math.round(x.amount)).join(" | "));
console.log("时间轴：", stageInfo().stage, stageInfo().pct.toFixed(1) + "%");
console.log(failed ? "\n结果：" + failed + " 项失败" : "\n结果：全部通过");
process.exit(failed ? 1 : 0);
