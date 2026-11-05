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

check("默认：小额 3000 元", {}, { eq: 90, maxTrack: true });
check("稳健 100 万", { tier: "balanced", capital: 1000000, signals: {} }, { eq: 95, maxTrack: true });
check("防守 + 高估值", { tier: "defensive", capital: 500000, anchors: { hs300: 82, divYield: 3.2, hstech: 20 } }, { maxTrack: true });
check("进取 + 全部信号", { tier: "aggressive", capital: 2000000, signals: { fed: 1, south: 1, unlock: 1, fiscal: 1, capex: 1, geopol: 1 } }, { maxTrack: true });
check("极端输入", { tier: "aggressive", capital: 1000, inputs: { earnings: -50, width: 0, ai: -50, risk: 3 }, liq: { fed: 0, south: -1, dom: -1 }, anchors: { hs300: 99, divYield: 2, hstech: 90 } }, { maxTrack: true });

const r = compute();
console.log("\n情景：", scenarios(r).map(x => x.name + " " + x.port.toFixed(1) + "% → " + Math.round(x.amount)).join(" | "));
console.log("时间轴：", stageInfo().stage, stageInfo().pct.toFixed(1) + "%");
console.log(failed ? "\n结果：" + failed + " 项失败" : "\n结果：全部通过");
process.exit(failed ? 1 : 0);
