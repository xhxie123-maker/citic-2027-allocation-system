/* UI 渲染与交互 */
const CORE_VIEWS = [
  {
    t: "K 型收敛，行情宽度拓展",
    d: "2027 年不是单边牛熊：AI 内部洗牌，非 AI 板块广泛修复。研报预计全 A 归母净利 2026E +15.5%、2027E +9.5%。"
  },
  {
    t: "PB-ROE 稳健回报 > 纯景气",
    d: "资金出清需要时间，从「追高景气」转向「赚合理回报」；配置以稳健回报为底仓，成长为卫星。"
  },
  {
    t: "港股先红利、后成长",
    d: "上半年解禁与资金面偏紧，红利压舱；下半年降息与南向回流后，切向生物科技、AI 应用、智能驾驶、具身智能。"
  }
];

const LINES = [
  { t: "稳健回报", d: "能化、油运、公路、物流、白电、药房、火电/核电 + 银行打底" },
  { t: "优秀出海制造", d: "船舶、柴油发动机、两轮车、CXO、电动工具、电力设备" },
  { t: "内需修复", d: "餐饮供应链、机场免税、保健品、医疗器械；消费左侧布局" },
  { t: "AI 新技术", d: "无源光器件、PCB、存储、半导体设备材料、端侧 AI、机器人" }
];

const LAYER_COLORS = { core: "#1f5fa8", sat: "#a9781f", hk: "#3a7554", buf: "#9aa3ad" };
const GRADE_COLORS = { ok: "#2c7a5d", acc: "#1f5fa8", gray: "#6b7684", warn: "#a9781f", bad: "#a94234" };

let currentTab = "overview";

const $id = x => document.getElementById(x);
const n = v => { const p = Number(v); return Number.isFinite(p) ? p : 0; };

/* ============ 渲染入口 ============ */
function renderAll() {
  renderSummary();
  renderTab();
  save();
}

function renderTab() {
  ["overview", "engine", "signals", "alloc", "discipline", "source"].forEach(t => {
    const sec = $id("tab-" + t);
    if (sec) sec.classList.toggle("on", t === currentTab);
  });
  document.querySelectorAll("#tabs button").forEach(b => b.classList.toggle("on", b.dataset.tab === currentTab));
  const map = { overview: renderOverview, engine: renderEngine, signals: renderSignals, alloc: renderAlloc, discipline: renderDiscipline, source: renderSource };
  (map[currentTab] || renderOverview)();
}

/* ============ 顶部结论条 ============ */
function renderSummary() {
  const r = compute();
  const g = r.grade;
  const st = stageInfo();
  $id("summary").innerHTML = [
    '<div class="left"><div class="gauge-wrap"><canvas id="gauge" width="206" height="112"></canvas>',
    '<div class="gauge-score"><b>' + Math.round(r.total) + '</b><span>综合评分 · ' + g.t + '</span></div></div></div>',
    '<div class="right">',
    '<div class="kvline">',
    kv("权益中枢", fmtW(r.eq), "评分加权后"),
    kv("核心底仓", fmtW(r.core), r.tier.name),
    kv("卫星进攻", fmtW(r.sat), "上限 40%"),
    kv("港股", fmtW(r.hk), r.micro ? "小额档不单列" : "先红利后成长"),
    kv("缓冲层", fmtW(r.buf), r.micro ? "小额档：货币弹药" : "黄金 + 债券 + 货币"),
    '</div>',
    '<div class="concl">' + g.d + '。' + r.action + '</div>',
    '<div class="pill-row"><span class="chip ' + g.cls + '">当前阶段：' + st.stage + '</span>',
    '<span class="chip">期限 ' + S.horizon + ' 个月</span>',
    '<span class="chip">本金 ' + fmtM(S.capital) + '</span>',
    '<span class="chip ' + (r.warns.some(w => w.type === "warn") ? "warn" : "ok") + '">一致性检查：' + (r.warns.filter(w => w.type === "warn").length ? r.warns.filter(w => w.type === "warn").length + " 项需注意" : "通过") + '</span></div>',
    '</div>'
  ].join("");
  drawGauge($id("gauge"), r.total, GRADE_COLORS[g.cls]);
}

function kv(k, v, note) {
  return '<div class="kv"><div class="k">' + k + '</div><div class="v">' + v + '</div><div class="k">' + note + '</div></div>';
}

/* ============ 总览 ============ */
function renderOverview() {
  const r = compute();
  const st = stageInfo();
  const triggered = DATA.signals.filter(s => S.signals[s.k]);
  const rs = radarStatus();

  const allocRows = r.leaves.map(l =>
    '<tr><td>' + l.name + '</td><td class="r">' + fmtW(l.weightPct) + '</td><td class="r mono">' + fmtM(l.amount) + '</td></tr>'
  ).join("");

  $id("tab-overview").innerHTML = [
    '<div class="grid g2">',
    '<div class="card"><h3>研报的三条核心判断 <span class="tagn">中信 2027 策略</span></h3>',
    CORE_VIEWS.map(v => '<div style="margin:10px 0"><div class="param-b">' + v.t + '</div><p class="note" style="margin:2px 0 0">' + v.d + '</p></div>').join(""),
    '<hr class="sep"><div class="tiny muted">四条配置主线</div><div class="pill-row">' +
    LINES.map(l => '<span class="chip" title="' + l.d + '">' + l.t + '</span>').join("") + '</div></div>',

    '<div class="card"><h3>当前结构 <span class="tagn">' + r.tier.name + '</span></h3>',
    '<div style="display:flex;gap:18px;align-items:center;flex-wrap:wrap">',
    '<canvas id="donut" width="216" height="216" style="flex:0 0 216px"></canvas>',
    '<div style="flex:1;min-width:180px">',
    layerLegend(r),
    '</div></div>',
    '<p class="note">右侧按评分加权后的目标权重给出，金额以本金 ' + fmtM(S.capital) + ' 计。切换档位与参数会实时重算。</p></div>',
    '</div>',

    '<div class="grid g2" style="margin-top:14px">',
    '<div class="card"><h3>下一步动作 <span class="tagn">' + st.stage + '</span></h3>',
    '<div class="alert info">' + st.hint + '</div>',
    '<table><thead><tr><th>子类</th><th class="r">目标权重</th><th class="r">金额</th></tr></thead><tbody>' + allocRows + '</tbody></table></div>',

    '<div class="card"><h3>信号状态 <span class="tagn">已触发 ' + triggered.length + ' / ' + DATA.signals.length + '</span></h3>',
    '<div class="alert ' + (rs.expiredCount ? "warn" : "info") + '">每日复核：今天已核 <b>' + rs.checkedAll + ' / ' + DATA.signals.length + '</b> 项' +
    (rs.expiredCount ? '；<b>' + rs.expiredCount + ' 项已超期未复核</b>，超期期间不加仓'
      : (rs.staleCount ? '；' + rs.staleCount + ' 项待复核'
        : (rs.noneCount ? '；' + rs.noneCount + ' 项尚未复核过' : '；全部今日已核'))) + '。</div>',
    triggered.length
      ? triggered.map(s => '<div class="alert ' + (s.k === "unlock" || s.k === "capex" ? "warn" : "info") + '"><b>' + s.name + '</b>：' + s.action + '</div>').join("")
      : '<div class="alert ok">研报列示的切换信号均未触发，维持当前结构。</div>',
    '<p class="note">信号是结构开关，不是情绪开关：只有在此处确认，才调整权重；未确认前不主动预判。每天到「信号雷达」打卡，超期项先复核再加仓。</p></div>',
    '</div>',

    '<div class="card" style="margin-top:14px"><h3>研报关键参数 <span class="tagn">可审计基线</span></h3>',
    '<div class="scroll"><table><thead><tr><th>参数</th><th>取值</th><th>出处</th></tr></thead><tbody>',
    DATA.params.map(p => '<tr><td>' + p.k + '</td><td class="mono">' + p.v + '</td><td class="tiny muted">' + p.src + '</td></tr>').join(""),
    '</tbody></table></div></div>'
  ].join("");

  drawDonut($id("donut"), r);
}

function layerLegend(r) {
  const items = [
    { k: "core", name: "核心底仓", w: r.core, d: "宽基 + 红利 + 自由现金流" },
    { k: "sat", name: "卫星进攻", w: r.sat, d: "AI 硬件 / 出海制造 / 内需修复" },
    { k: "hk", name: "港股", w: r.hk, d: "港股通红利 → 恒生科技" },
    { k: "buf", name: "缓冲层", w: r.buf, d: r.micro ? "货币（弹药）" : "黄金 / 债券 / 货币" }
  ];
  return items.map(i =>
    '<div style="display:flex;gap:8px;align-items:baseline;margin:6px 0">' +
    '<span style="width:9px;height:9px;border-radius:2px;background:' + LAYER_COLORS[i.k] + '"></span>' +
    '<span style="flex:0 0 62px;font-size:12.5px">' + i.name + '</span>' +
    '<span class="param-b" style="width:54px;text-align:right">' + fmtW(i.w) + '</span>' +
    '<span class="tiny muted">' + i.d + '</span></div>'
  ).join("");
}

/* ============ 决策引擎 ============ */
function renderEngine() {
  const r = compute();
  const dimRows = r.dims.map(d => {
    const inputDef = DATA.dims.find(x => x.k === d.k).input;
    return '<div class="row"><label>' + d.name + '<div class="tiny muted">权重 ' + Math.round(d.weight * 100) + '%</div></label>' +
      dimControl(d, inputDef) + '</div>';
  }).join("");

  const bars = r.dims.map(d =>
    '<div class="dim"><div class="nm">' + d.name + '</div>' +
    '<div class="bar"><i style="width:' + d.score.toFixed(0) + '%"></i></div>' +
    '<div class="sc">' + Math.round(d.score) + '<span class="wt">×' + Math.round(d.weight * 100) + '%</span></div></div>'
  ).join("");

  $id("tab-engine").innerHTML = [
    '<div class="grid g2">',
    '<div class="card"><h3>输入参数 <span class="tagn">本地计算，不上传</span></h3>',
    '<div class="row"><label>风险档位</label><select id="sel-tier">' +
    Object.keys(DATA.tiers).map(k => '<option value="' + k + '"' + (S.tier === k ? " selected" : "") + '>' + DATA.tiers[k].name + '</option>').join("") +
    '</select></div>',
    '<div class="row"><label>本金（元）</label><input type="number" id="in-capital" value="' + S.capital + '" min="0" step="100"><span class="hint">金额按此换算</span></div>',
    '<div class="row"><label>期限（月）</label><input type="number" id="in-horizon" value="' + S.horizon + '" min="1" max="60" step="1"><span class="hint">≤12 个月会启用时间止盈提醒</span></div>',
    '<div class="row"><label>起始日期</label><input type="date" id="in-start" value="' + S.startDate + '"></div>',
    '<hr class="sep"><div class="tiny muted" style="margin-bottom:6px">六维评分输入（研报口径）</div>',
    dimRows,
    '<hr class="sep"><div class="tiny muted" style="margin-bottom:6px">估值锚</div>',
    DATA.anchors.map(a =>
      '<div class="row"><label>' + a.name + '</label><input type="number" id="anc-' + a.k + '" value="' + S.anchors[a.k] + '" step="0.1"><span class="hint">' + (a.unit || "") + '</span></div>'
    ).join(""),
    '<p class="note">估值锚同时参与评分与提示：沪深 300 分位直接决定「估值分位」维度得分。</p>',
    '</div>',

    '<div class="card"><h3>评分与仓位 <span class="tagn">满分 100 / 中性 50</span></h3>',
    '<div class="stat"><div class="s"><div class="k">综合评分</div><div class="v">' + Math.round(r.total) + '</div></div>',
    '<div class="s"><div class="k">档位</div><div class="v"><span class="chip ' + r.grade.cls + '">' + r.grade.t + '</span></div></div>',
    '<div class="s"><div class="k">仓位系数</div><div class="v">' + r.mult.toFixed(2) + '×</div></div>',
    '<div class="s"><div class="k">权益中枢</div><div class="v">' + fmtW(r.eq) + '</div></div></div>',
    '<hr class="sep">',
    bars,
    '<hr class="sep">',
    '<div class="tiny muted">进攻类（卫星 + 港股成长）占比</div>',
    '<div class="stat" style="margin-top:4px"><div class="s"><div class="v">' + fmtW(r.offRatio) + '</div><div class="k">防御类 ' + fmtW(100 - r.offRatio) + '</div></div></div>',
    '<div class="alert info" style="margin-top:10px">' + r.action + '</div>',
    r.warns.map(w => '<div class="alert ' + w.type + '">' + w.msg + '</div>').join(""),
    '<p class="note">评分只决定「仓位中枢」，不决定买哪只：结构由研报主线与信号共同决定。</p>',
    '</div></div>'
  ].join("");

  bindEngine();
}

function dimControl(d, def) {
  if (d.k === "val") {
    return '<div class="tiny muted" style="flex:1">由下方「估值锚 · 沪深 300 PE 分位」控制：当前 <span class="param-b">' + n(d.raw) + '%</span></div>';
  }
  if (def.type === "range") {
    return '<div class="rangebox"><input type="range" id="in-' + d.k + '" min="' + def.min + '" max="' + def.max + '" step="' + def.step + '" value="' + n(d.raw) + '"><span class="val" id="val-' + d.k + '">' + n(d.raw) + '</span><span class="hint">' + (def.unit || "") + '</span></div>';
  }
  if (def.type === "number") {
    return '<input type="number" id="in-' + d.k + '" value="' + n(d.raw) + '" min="' + def.min + '" max="' + def.max + '" step="' + def.step + '"><span class="hint">' + (def.unit || "") + '</span>';
  }
  if (def.type === "select") {
    return '<select id="in-' + d.k + '">' + def.options.map((o, i) => '<option value="' + i + '"' + (n(S.inputs[d.k]) === i ? " selected" : "") + '>' + o + '</option>').join("") + '</select>';
  }
  /* composite：流动性与资金 */
  return '<div style="display:flex;gap:6px;flex-wrap:wrap">' +
    '<select id="liq-fed"><option value="0"' + (S.liq.fed ? "" : " selected") + '>降息未落地</option><option value="1"' + (S.liq.fed ? " selected" : "") + '>降息已落地</option></select>' +
    '<select id="liq-south">' + [[-1, "南向流出"], [0, "南向中性"], [1, "南向加速"]].map(o => '<option value="' + o[0] + '"' + (S.liq.south === o[0] ? " selected" : "") + '>' + o[1] + '</option>').join("") + '</select>' +
    '<select id="liq-dom">' + [[-1, "国内收紧"], [0, "国内中性"], [1, "国内宽松"]].map(o => '<option value="' + o[0] + '"' + (S.liq.dom === o[0] ? " selected" : "") + '>' + o[1] + '</option>').join("") + '</select>' +
    '</div>';
}

function bindEngine() {
  const sel = $id("sel-tier"); if (sel) sel.addEventListener("change", e => { S.tier = e.target.value; renderAll(); });
  const cap = $id("in-capital"); if (cap) cap.addEventListener("change", e => { S.capital = n(e.target.value); renderAll(); });
  const hor = $id("in-horizon"); if (hor) hor.addEventListener("change", e => { S.horizon = Math.max(1, n(e.target.value)); renderAll(); });
  const st = $id("in-start"); if (st) st.addEventListener("change", e => { S.startDate = e.target.value || "2026-11-06"; renderAll(); });

  ["earnings", "width", "ai", "risk"].forEach(k => {
    const inp = $id("in-" + k);
    if (!inp) return;
    if (inp.type === "range") {
      inp.addEventListener("input", e => { const v = $id("val-" + k); if (v) v.textContent = e.target.value; });
    }
    inp.addEventListener("change", e => {
      S.inputs[k] = k === "risk" ? n(e.target.value) : Number(e.target.value);
      renderAll();
    });
  });

  ["fed", "south", "dom"].forEach(k => {
    const el = $id("liq-" + k);
    if (el) el.addEventListener("change", e => { S.liq[k] = Number(e.target.value); renderAll(); });
  });

  DATA.anchors.forEach(a => {
    const el = $id("anc-" + a.k);
    if (el) el.addEventListener("change", e => { S.anchors[a.k] = Number(e.target.value); renderAll(); });
  });
}

/* ============ 信号雷达 ============ */
function renderSignals() {
  const r = compute();
  const rs = radarStatus();
  const on = DATA.signals.filter(s => S.signals[s.k]);

  const lvlTag = lv => lv === "ok" ? '<span class="tagn" style="background:#e8f5ee;color:#1a7f4b">今日已核</span>'
    : lv === "warn" ? '<span class="tagn" style="background:#fff4e5;color:#a86500">待复核</span>'
    : lv === "expired" ? '<span class="tagn" style="background:#fdecec;color:#b42318">已超期</span>'
    : '<span class="tagn" style="background:#f2f3f5;color:#666">未核过</span>';

  const cards = DATA.signals.map(s => {
    const active = !!S.signals[s.k];
    const st = rs.list.find(x => x.k === s.k) || {};
    const lastTxt = st.days == null ? "尚未复核" : (st.days === 0 ? "今天已核" : st.days + " 天前复核");
    return '<div class="sig' + (active ? " trig" : "") + '">' +
      '<h4>' + s.name + ' <span class="tiny muted">' + s.src + '</span> ' + lvlTag(st.level) + '</h4>' +
      '<p>' + s.desc + '</p>' +
      '<div class="tiny" style="line-height:1.7;margin:6px 0 8px;padding:8px 10px;background:#fafbfc;border-left:3px solid #dfe3e8">' +
        '<div><b>每日看什么</b>：' + s.watch + '</div>' +
        '<div><b>在哪儿看</b>：' + s.where + '</div>' +
        '<div><b>触发线</b>：' + s.thr + '</div>' +
        '<div><b>复核周期</b>：≤ ' + s.stale + ' 天（' + lastTxt + '）</div>' +
      '</div>' +
      '<div class="seg"><button class="' + (active ? "on" : "") + '" data-sig="' + s.k + '" data-v="1">已触发</button>' +
      '<button class="' + (!active ? "on" : "") + '" data-sig="' + s.k + '" data-v="0">未触发</button></div>' +
      '<div class="eff">触发后：' + s.action + '</div>' +
      '<button class="btn2" data-check="' + s.k + '" style="margin-top:8px;padding:4px 10px;font-size:12px;border:1px solid #dfe3e8;background:#fff;border-radius:6px;cursor:pointer">今天核对过</button>' +
      '</div>';
  }).join("");

  const routine = (DATA.routine || []).map(x =>
    '<div style="padding:6px 0;border-bottom:1px dashed #eef0f3"><b>' + x.t + '</b><div class="tiny muted">' + x.d + '</div></div>'
  ).join("");

  $id("tab-signals").innerHTML = [
    '<div class="card"><h3>每日巡检 <span class="tagn">' + rs.today + ' · 已核 ' + rs.checkedAll + ' / ' + DATA.signals.length + '</span></h3>',
    '<div class="alert ' + (rs.expiredCount ? "warn" : "info") + '">' +
      (rs.expiredCount
        ? '<b>' + rs.expiredCount + ' 项已超期</b>' + (rs.maxDays != null ? '（最久 ' + rs.maxDays + ' 天未复核）' : '') + '：超期信号视为「未确认」，期间不加仓，先补核。'
        : (rs.staleCount
          ? rs.staleCount + ' 项待复核（在建议周期 2 倍内，可继续持有但今日需过一遍）。'
          : (rs.noneCount ? rs.noneCount + ' 项尚未复核过：先按「每日看什么」逐项过一遍，点「今天核对过」。' : '全部信号今日已核，时效正常。'))) +
      '</div>',
    '<div class="grid g2" style="margin-top:10px"><div>' + routine + '</div>',
    '<div class="tiny muted" style="line-height:1.8">规则：<br>1）只有阈值被跨越才切换状态，新闻标题、研报观点、聊天截图都不算触发；<br>2）触发状态一旦确认，当次调仓按「配置与调仓」页执行，不追第二次；<br>3）「今天核对过」只更新时间戳，不改变状态——状态和时效是两件事；<br>4）超期（>2 倍周期）未复核的信号按未触发处理，避免拿旧信息做新仓位。</div></div>',
    '</div>',
    '<div class="grid g3" style="margin-top:14px">' + cards + '</div>',
    '<div class="disc">说明：信号方向是研报给定的条件关系（例如「降息落地 → 港股成长修复」），不是无条件看多。若同一时间多个信号冲突（如降息落地但地缘升级），系统按权重对冲后的结果给出结构，并在「配置与调仓」页标注提示。</div>'
  ].join("");

  document.querySelectorAll("#tab-signals [data-sig]").forEach(b => {
    b.addEventListener("click", () => {
      S.signals[b.dataset.sig] = b.dataset.v === "1" ? 1 : 0;
      renderAll();
    });
  });
  document.querySelectorAll("#tab-signals [data-check]").forEach(b => {
    b.addEventListener("click", () => {
      markChecked(b.dataset.check);
      renderAll();
    });
  });
}

/* ============ 配置与调仓 ============ */
function renderAlloc() {
  const r = compute();
  const total = S.holdTotal && S.holdTotal > 0 ? S.holdTotal : S.capital;
  const thr = Math.max(total * 0.01, 30);

  const rows = r.leaves.map(l => {
    const cur = n(S.holdings[l.k]);
    const tgt = total * l.weightPct / 100;
    const diff = tgt - cur;
    const act = diff > thr ? '<span class="buy">买入</span>' : (diff < -thr ? '<span class="sell">卖出</span>' : '<span class="muted">维持</span>');
    const dev = total > 0 ? (cur / total * 100 - l.weightPct) : 0;
    return '<tr><td><span class="lvl ' + l.layer + '">' + l.layerName + '</span></td>' +
      '<td>' + l.name + '<div class="tiny muted">' + l.universe.slice(0, 2).join(" · ") + '</div></td>' +
      '<td class="r">' + fmtW(l.weightPct) + '</td>' +
      '<td class="r mono">' + fmtM(tgt) + '</td>' +
      '<td class="r"><input type="number" class="hold" data-k="' + l.k + '" value="' + (cur || "") + '" placeholder="0" step="10" style="width:92px;text-align:right"></td>' +
      '<td class="r">' + fmtPct2(dev) + '</td>' +
      '<td class="r">' + act + (Math.abs(diff) > thr ? '<div class="tiny muted">' + (diff > 0 ? "+" : "") + fmtM(diff).replace("¥", "¥") + '</div>' : "") + '</td></tr>';
  }).join("");

  $id("tab-alloc").innerHTML = [
    '<div class="grid g2">',
    '<div class="card"><h3>目标配置表 <span class="tagn">' + r.tier.name + '</span></h3>',
    '<div style="display:flex;gap:18px;align-items:flex-start;flex-wrap:wrap">',
    '<canvas id="donut2" width="216" height="216" style="flex:0 0 216px"></canvas>',
    '<div style="flex:1;min-width:170px">' + layerLegend(r) + '</div></div>',
    '<p class="note">每个子类只留 1 只标的：先按指数检索，优先规模最大、流动性最好、费率 ≤0.25% 的产品。</p></div>',

    '<div class="card"><h3>调仓与偏离 <span class="tagn">阈值 ' + fmtM(thr) + '</span></h3>',
    '<div class="row"><label>当前总市值</label><input type="number" id="in-holdtotal" value="' + (S.holdTotal || total) + '" step="10"><span class="hint">默认等于本金</span></div>',
    '<div class="alert info">在「当前市值」列填今日实际市值（未填视为 0），系统按目标权重给出买卖建议；偏离超过 1% 才提示动作。</div>',
    '<div class="btnrow"><button class="act mini" id="btn-log">把本次配置记入决策日志</button>' +
    '<button class="ghost mini" id="btn-csv">导出调仓单 CSV</button>' +
    '<button class="ghost mini" id="btn-reset-hold">清空持仓输入</button></div>',
    '</div></div>',

    '<div class="card" style="margin-top:14px"><div class="scroll"><table>',
    '<thead><tr><th>层级</th><th>子类 / 标的池</th><th class="r">目标权重</th><th class="r">目标金额</th><th class="r">当前市值</th><th class="r">偏离</th><th class="r">建议</th></tr></thead>',
    '<tbody>' + rows + '</tbody></table></div>',
    '<p class="note">「偏离」= 当前实际权重 − 目标权重。季度再平衡的规则是：任一子类偏离 ±5pp 即调回，其余不动。</p></div>'
  ].join("");

  drawDonut($id("donut2"), r);

  const ht = $id("in-holdtotal");
  if (ht) ht.addEventListener("change", e => { S.holdTotal = n(e.target.value); renderAll(); });
  document.querySelectorAll(".hold").forEach(inp => {
    inp.addEventListener("change", e => {
      S.holdings[inp.dataset.k] = n(e.target.value);
      renderAll();
    });
  });
  const lg = $id("btn-log"); if (lg) lg.addEventListener("click", () => addLog(r));
  const cs = $id("btn-csv"); if (cs) cs.addEventListener("click", () => exportOrders(r));
  const rs = $id("btn-reset-hold"); if (rs) rs.addEventListener("click", () => { S.holdings = {}; S.holdTotal = null; renderAll(); });
}

/* ============ 纪律与风控 ============ */
function renderDiscipline() {
  const r = compute();
  const st = stageInfo();
  const sc = scenarios(r);
  const p1 = Math.min(3 / S.horizon * 100, 100);
  const p2 = Math.max(Math.min((S.horizon - 1) / S.horizon * 100, 100), p1);

  const tl = '<div class="tl">' +
    '<div class="track"><div class="seg1" style="width:' + p1 + '%"></div><div class="seg2" style="width:' + (p2 - p1) + '%"></div><div class="seg3" style="width:' + (100 - p2) + '%"></div></div>' +
    '<div class="mark" style="left:calc(' + st.pct + '% - 1.5px)"></div>' +
    '<div class="stage" style="left:' + st.pct + '%">今天 · ' + st.stage + '</div>' +
    '<div class="lbl" style="left:2%">建仓</div>' +
    '<div class="lbl" style="left:' + p1 + '%">持有期</div>' +
    '<div class="lbl" style="left:' + p2 + '%">减仓期</div>' +
    '<div class="lbl" style="left:99%">到期</div>' +
    '</div>';

  const cks = DATA.checklist.map(c =>
    '<label class="ck' + (S.checks[c.k] ? " done" : "") + '"><input type="checkbox" data-ck="' + c.k + '"' + (S.checks[c.k] ? " checked" : "") + '><span>' + c.t + '</span></label>'
  ).join("");

  const logs = S.log.length
    ? S.log.map((l, i) =>
      '<tr><td class="mono tiny">' + l.time + '</td><td>' + l.tier + '</td><td class="r">' + l.score + '</td><td class="r">' + l.eq + '</td>' +
      '<td class="tiny">' + l.alloc + '</td><td class="r"><button class="ghost mini" data-del="' + i + '">删</button></td></tr>'
    ).join("")
    : '<tr><td colspan="6" class="muted tiny">暂无记录。在「配置与调仓」页点击「记入决策日志」，或在下方手动记录。</td></tr>';

  $id("tab-discipline").innerHTML = [
    '<div class="grid g2">',
    '<div class="card"><h3>资金时间轴 <span class="tagn">' + S.horizon + ' 个月 · 已过 ' + st.months.toFixed(1) + ' 个月</span></h3>',
    tl,
    '<div class="alert ' + (st.stage === "减仓期" ? "warn" : "info") + '" style="margin-top:16px">' + st.hint + '</div>',
    '<p class="note">研报对应的是产业与风格周期，不是个人资金周期。期限资金必须用时间止盈覆盖策略判断：满 11 个月开始减，满 12 个月清零。</p></div>',

    '<div class="card"><h3>纪律条款 <span class="tagn">研报执行口径</span></h3>',
    DATA.rules.map(x => '<div style="margin:8px 0"><div class="param-b" style="font-size:13px">' + x.t + '</div><div class="tiny muted">' + x.d + '</div></div>').join(""),
    '</div></div>',

    '<div class="grid g2" style="margin-top:14px">',
    '<div class="card"><h3>情景压力测试 <span class="tagn">假设值，非预测</span></h3>',
    '<table><thead><tr><th>情景</th><th class="r">权益收益</th><th class="r">组合收益</th><th class="r">期末金额</th></tr></thead><tbody>',
    sc.map(x => '<tr><td>' + x.name + '<div class="tiny muted">' + x.note + '</div></td><td class="r">' + fmtPct2(x.equity) + '</td><td class="r">' + fmtPct2(x.port) + '</td><td class="r mono">' + fmtM(x.amount) + '</td></tr>').join(""),
    '</tbody></table>',
    '<p class="note">组合收益 = 权益中枢 × 情景收益 + 缓冲层 × 缓冲收益。按当前权益 ' + fmtW(r.eq) + ' / 缓冲 ' + fmtW(r.buf) + ' 计算；缓冲收益取 黄金 + 债券 + 货币 的保守叠加假设（研报：债券只做风险控制，不指望它增厚收益）。</p></div>',

    '<div class="card"><h3>红线 <span class="tagn">违反即停手</span></h3>',
    '<ol style="margin:0;padding-left:18px;font-size:12.8px;color:var(--ink2)">' +
    DATA.guardrails.map(g => '<li style="margin:5px 0">' + g + '</li>').join("") + '</ol></div>',
    '</div>',

    '<div class="grid g2" style="margin-top:14px">',
    '<div class="card"><h3>首月执行清单</h3>' + cks + '</div>',
    '<div class="card"><h3>决策日志 <span class="tagn">' + S.log.length + ' 条</span></h3>',
    '<div class="row"><label>备注</label><input type="text" id="log-note" placeholder="例如：按评分下调卫星" style="flex:1;min-width:120px;padding:6px 9px;border:1px solid var(--line);border-radius:8px;font-family:inherit;font-size:13px">' +
    '<button class="act mini" id="btn-log2">记录</button></div>',
    '<div class="scroll"><table><thead><tr><th>时间</th><th>档位</th><th class="r">评分</th><th class="r">权益%</th><th>配置</th><th></th></tr></thead><tbody>' + logs + '</tbody></table></div>',
    '<div class="btnrow"><button class="ghost mini" id="btn-logcsv">导出日志 CSV</button></div></div>',
    '</div>'
  ].join("");

  document.querySelectorAll("[data-ck]").forEach(cb => {
    cb.addEventListener("change", () => { S.checks[cb.dataset.ck] = cb.checked; renderAll(); });
  });
  document.querySelectorAll("[data-del]").forEach(b => {
    b.addEventListener("click", () => { S.log.splice(Number(b.dataset.del), 1); renderAll(); });
  });
  const b2 = $id("btn-log2"); if (b2) b2.addEventListener("click", () => addLog(r));
  const bc = $id("btn-logcsv"); if (bc) bc.addEventListener("click", exportLog);
}

/* ============ 研报溯源 ============ */
function renderSource() {
  $id("tab-source").innerHTML = [
    '<div class="grid g3">',
    DATA.research.map(x =>
      '<div class="card"><h3>' + x.id + ' · ' + x.org + '</h3><div class="param-b" style="font-size:13px">' + x.title + '</div>' +
      '<p class="note">' + x.date + '</p><hr class="sep"><div class="tiny">本系统使用：' + x.used + '</div></div>'
    ).join(""),
    '</div>',

    '<div class="card" style="margin-top:14px"><h3>参数映射 <span class="tagn">研报 → 系统变量</span></h3>',
    '<div class="scroll"><table><thead><tr><th>研报参数</th><th>取值</th><th>进入系统的位置</th></tr></thead><tbody>',
    '<tr><td>全 A 归母净利 2027E</td><td class="mono">+9.5%</td><td>盈利动能维度的中性基准（输入偏离此值即加减分）</td></tr>',
    '<tr><td>K 型收敛 / 行情宽度</td><td class="mono">主线判断</td><td>「行情宽度」维度 + 宽基 / 红利层内比例倾斜</td></tr>',
    '<tr><td>PB-ROE 稳健回报占优</td><td class="mono">风格判断</td><td>底仓 55% 主模板 + 卫星 ≤40% + 单赛道 ≤15%</td></tr>',
    '<tr><td>恒指 / 恒生科技盈利与估值</td><td class="mono">+7.4% / +24.8%，PE 2.4% 分位</td><td>港股层「先红利后成长」权重与估值锚提示</td></tr>',
    '<tr><td>解禁压力 3200 亿港元</td><td class="mono">2027年1月</td><td>「港股解禁」信号 → 港股成长 −15pp</td></tr>',
    '<tr><td>风险清单（6 项）</td><td class="mono">定性</td><td>风险事件维度 + 情景压力测试的悲观假设</td></tr>',
    '</tbody></table></div>',
    '<p class="note">权重（20/20/18/17/15/10）与各维度打分函数是本系统的<strong>工程设定</strong>，不是研报给定数值；调整权重请在 assets/data.js 中修改，页面会即时重算。</p></div>',

    '<div class="card" style="margin-top:14px"><h3>未能从研报获得的信息（本系统不做假设）</h3>',
    '<div class="alert warn">研报未给出精确的组合权重、个券/个基名单、择时点位。本系统的仓位比例属派生模板，标的只给指数与类型，不给具体代码——代码、规模、费率、溢价率请在券商 APP 下单前逐项核对。</div>',
    '<div class="alert warn">研报观点有有效期。若中信后续发布 2027 年中期策略或调整盈利预测，应更新 assets/data.js 中的 params 与默认输入，并在决策日志里记录版本变更。</div>',
    '</div>',

    '<div class="disc"><strong>免责声明</strong><br>本系统是基于公开研报观点的策略框架工具，用于把定性判断转成可执行、可复盘的配置纪律，<strong>不构成投资建议、不构成收益承诺</strong>。所有情景收益为假设推演；ETF 分散个股风险但集中行业风险，行业 ETF 一年内出现 30% 回撤是可能的。使用前请确认资金为 1 年内不动用的闲钱，并结合自身风险承受能力；据此操作，风险自担。</div>'
  ].join("");
}

/* ============ 决策日志 ============ */
function addLog(r) {
  const noteEl = $id("log-note");
  const alloc = r.leaves.filter(l => l.weightPct >= 3).map(l => l.name.split("（")[0] + fmtW(l.weightPct)).join(" / ");
  const d = new Date();
  const pad = x => String(x).padStart(2, "0");
  S.log.unshift({
    time: d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()) + " " + pad(d.getHours()) + ":" + pad(d.getMinutes()),
    tier: r.tier.name,
    score: Math.round(r.total),
    eq: fmtW(r.eq),
    alloc: alloc + (noteEl && noteEl.value ? " ｜ " + noteEl.value : "")
  });
  if (S.log.length > 60) S.log.length = 60;
  renderAll();
}

function download(filename, text, mime) {
  const blob = new Blob([text], { type: mime || "text/plain;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 300);
}

function exportOrders(r) {
  const total = S.holdTotal && S.holdTotal > 0 ? S.holdTotal : S.capital;
  const lines = ["层级,子类,目标权重(%),目标金额,当前市值,差额,建议"];
  r.leaves.forEach(l => {
    const cur = n(S.holdings[l.k]);
    const tgt = total * l.weightPct / 100;
    const diff = tgt - cur;
    const thr = Math.max(total * 0.01, 30);
    const act = diff > thr ? "买入" : (diff < -thr ? "卖出" : "维持");
    lines.push([l.layerName, '"' + l.name.replace(/"/g, "") + '"', l.weightPct.toFixed(1), Math.round(tgt), Math.round(cur), Math.round(diff), act].join(","));
  });
  download("调仓单_" + S.startDate + ".csv", "\ufeff" + lines.join("\r\n"), "text/csv;charset=utf-8");
}

function exportLog() {
  const lines = ["时间,档位,评分,权益中枢,配置与备注"];
  S.log.forEach(l => lines.push([l.time, l.tier, l.score, l.eq, '"' + (l.alloc || "").replace(/"/g, "") + '"'].join(",")));
  download("决策日志_" + S.startDate + ".csv", "\ufeff" + lines.join("\r\n"), "text/csv;charset=utf-8");
}

/* ============ 图形 ============ */
function drawGauge(cv, score, color) {
  if (!cv) return;
  const dpr = window.devicePixelRatio || 1;
  const w = 206, h = 112;
  cv.width = w * dpr; cv.height = h * dpr;
  const ctx = cv.getContext("2d");
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const cx = w / 2, cy = h - 8, r = 82;
  ctx.clearRect(0, 0, w, h);

  ctx.beginPath();
  ctx.arc(cx, cy, r, Math.PI, 2 * Math.PI);
  ctx.strokeStyle = "#e6e9ee";
  ctx.lineWidth = 9;
  ctx.stroke();

  const end = Math.PI + Math.PI * clamp(score, 0, 100) / 100;
  ctx.beginPath();
  ctx.arc(cx, cy, r, Math.PI, end);
  ctx.strokeStyle = color;
  ctx.lineWidth = 9;
  ctx.stroke();

  [0, 25, 50, 75, 100].forEach(t => {
    const a = Math.PI + Math.PI * t / 100;
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(a) * (r - 7), cy + Math.sin(a) * (r - 7));
    ctx.lineTo(cx + Math.cos(a) * (r - 14), cy + Math.sin(a) * (r - 14));
    ctx.strokeStyle = "#c9cfd8";
    ctx.lineWidth = 1.4;
    ctx.stroke();
  });

  ctx.beginPath();
  ctx.arc(cx + Math.cos(end) * (r - 4.5), cy + Math.sin(end) * (r - 4.5), 4.2, 0, 2 * Math.PI);
  ctx.fillStyle = "#1b2430";
  ctx.fill();
}

function drawDonut(cv, r) {
  if (!cv) return;
  const dpr = window.devicePixelRatio || 1;
  const size = 216;
  cv.width = size * dpr; cv.height = size * dpr;
  const ctx = cv.getContext("2d");
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, size, size);

  const cx = size / 2, cy = size / 2, R = 84, r0 = 48;
  const items = [
    { k: "core", v: r.core }, { k: "sat", v: r.sat }, { k: "hk", v: r.hk }, { k: "buf", v: r.buf }
  ].filter(i => i.v > 0.2);

  let a0 = -Math.PI / 2;
  items.forEach(it => {
    const a1 = a0 + Math.PI * 2 * it.v / 100;
    ctx.beginPath();
    ctx.arc(cx, cy, R, a0, a1);
    ctx.arc(cx, cy, r0, a1, a0, true);
    ctx.closePath();
    ctx.fillStyle = LAYER_COLORS[it.k];
    ctx.fill();
    a0 = a1;
  });

  ctx.beginPath();
  ctx.arc(cx, cy, r0 - 1, 0, 2 * Math.PI);
  ctx.fillStyle = "#fff";
  ctx.fill();

  ctx.fillStyle = "#1b2430";
  ctx.textAlign = "center";
  ctx.font = "600 19px 'Segoe UI','PingFang SC','Microsoft YaHei',sans-serif";
  ctx.fillText(fmtW(r.eq), cx, cy + 2);
  ctx.font = "11px 'Segoe UI','PingFang SC','Microsoft YaHei',sans-serif";
  ctx.fillStyle = "#77808f";
  ctx.fillText("权益中枢", cx, cy + 20);
}

/* ============ 启动 ============ */
document.querySelectorAll("#tabs button").forEach(b => {
  b.addEventListener("click", () => { currentTab = b.dataset.tab; renderTab(); });
});
window.addEventListener("resize", () => { drawGauge($id("gauge"), compute().total, GRADE_COLORS[compute().grade.cls]); });
renderAll();
