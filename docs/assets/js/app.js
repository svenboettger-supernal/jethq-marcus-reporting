/* Marcus Accuracy & Performance Report — dashboard logic. */

const VIZ = {
  base: ['hsl(9 41% 55%)','hsl(32 73% 69%)','hsl(196 13% 50%)','hsl(19 46% 72%)','hsl(64 13% 45%)','hsl(356 32% 37%)','hsl(210 1% 32%)'],
  success: 'hsl(142 72% 29%)',
  warning: 'hsl(26 91% 37%)',
  error:   'hsl(6 63% 46%)',
  muted:   'hsl(33 10% 34%)',
  border:  'hsl(33 18% 80%)',
  borderStrong: 'hsl(33 14% 67%)',
  axis:    'hsl(33 10% 34%)',
  fg:      'hsl(33 4% 6%)',
  card:    'hsl(30 8% 99%)',
  action:  'hsl(167 16% 48%)',
  successBg: 'hsl(139 76% 97%)',
  warningBg: 'hsl(48 100% 96%)',
  errorBg:   'hsl(0 86% 97%)',
};

const ECHART_BASE = {
  textStyle: { fontFamily: 'Inter, system-ui, sans-serif', color: VIZ.fg },
  grid: { left: 56, right: 24, top: 36, bottom: 44, containLabel: true },
  tooltip: {
    backgroundColor: VIZ.card,
    borderColor: VIZ.border,
    borderWidth: 1,
    textStyle: { color: VIZ.fg, fontSize: 12.5, fontFamily: 'Inter, system-ui, sans-serif' },
    extraCssText: 'box-shadow: 0 1px 2px rgba(0,0,0,0.06); border-radius: 6px;',
  },
};

const VERDICT_BADGE = {
  'Correct':      ['badge-correct', 'Correct'],
  'Half Correct': ['badge-half',    'Half Correct'],
  'Incorrect':    ['badge-incorrect','Incorrect'],
};

const VERDICT_COLOR = {
  'Correct': VIZ.success,
  'Half Correct': VIZ.warning,
  'Incorrect': VIZ.error,
};

const DAYS = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];

/* ---------- State ---------- */
const state = {
  data: null,
  filters: { round: '', classification: '', verdict: '' },
  explorer: { search: '', sortKey: 'time', sortDir: 'desc' },
  classifier: { search: '', sortKey: 'confidence', sortDir: 'desc', page: 1, perPage: 25 },
  charts: {},
};

/* ---------- Utilities ---------- */
function fmtNumber(n) { return Number(n).toLocaleString('en-US'); }
function fmtPercent(n, dp = 2) { return Number(n).toFixed(dp) + '%'; }
function fmtDate(iso, opts = {}) {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleString('en-US', { month: 'short', day: '2-digit', year: opts.year ? 'numeric' : undefined, hour: opts.time ? '2-digit' : undefined, minute: opts.time ? '2-digit' : undefined });
}
function fmtDateRange(start, end) {
  if (!start || !end) return '—';
  return `${fmtDate(start, { year: true })} → ${fmtDate(end, { year: true })}`;
}
function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function titleize(s) {
  if (!s) return '';
  return s.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

/* ---------- URL state ---------- */
function readQS() {
  const params = new URLSearchParams(location.search);
  return {
    round: params.get('round') || '',
    classification: params.get('class') || '',
    verdict: params.get('verdict') || '',
    q: params.get('q') || '',
  };
}
function writeQS() {
  const params = new URLSearchParams();
  if (state.filters.round) params.set('round', state.filters.round);
  if (state.filters.classification) params.set('class', state.filters.classification);
  if (state.filters.verdict) params.set('verdict', state.filters.verdict);
  if (state.explorer.search) params.set('q', state.explorer.search);
  const qs = params.toString();
  const url = location.pathname + (qs ? '?' + qs : '') + location.hash;
  history.replaceState(null, '', url);
}

/* ---------- Boot ---------- */
async function boot() {
  try {
    const res = await fetch('data/marcus.json', { cache: 'no-store' });
    if (!res.ok) throw new Error('Failed to fetch marcus.json');
    state.data = await res.json();
  } catch (err) {
    document.getElementById('dashboard').innerHTML = `<div class="container loading">Could not load data: ${escapeHtml(err.message)}</div>`;
    return;
  }
  // Apply URL state on first load
  const qs = readQS();
  state.filters.round = qs.round;
  state.filters.classification = qs.classification;
  state.filters.verdict = qs.verdict;
  state.explorer.search = qs.q;

  renderMeta();
  renderKPIs();
  renderFilters();
  renderNarrative();
  renderAllCharts();
  renderExplorer();
  renderClassifier();
  bindGlobalFilters();
  bindSectionNav();
  bindExplorerControls();
  bindClassifierControls();
  window.addEventListener('resize', debounce(resizeCharts, 120));
}

if (document.getElementById('dashboard') && !document.getElementById('dashboard').hidden) {
  boot();
} else {
  document.addEventListener('dashboard:unlocked', boot, { once: true });
}

/* ---------- Render: Meta + KPIs ---------- */
function renderMeta() {
  const m = state.data.meta;
  const k = state.data.kpis;
  document.getElementById('meta-period').textContent = fmtDateRange(k.recent_window.start, k.recent_window.end);
  document.getElementById('meta-sample').textContent = `${fmtNumber(k.overall_denominator)} curated validations · ${fmtNumber(k.total_updates_recent_window)} recent updates`;
  const gen = new Date(m.generated_at);
  const genStr = gen.toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' });
  document.getElementById('meta-generated').textContent = genStr;
  document.getElementById('meta-generated-2').textContent = genStr;
}

function renderKPIs() {
  const k = state.data.kpis;
  const items = [
    {
      cls: 'headline',
      label: 'Overall accuracy',
      value: fmtPercent(k.overall_accuracy_pct),
      sub: `${fmtNumber(k.overall_numerator)} / ${fmtNumber(k.overall_denominator)} curated`,
      delta: `+${fmtPercent(k.improvement_pp_vs_round_1, 2)} pp vs. Round 1`,
    },
    { label: 'Updates processed', value: fmtNumber(k.total_updates_recent_window), sub: 'in the most recent window' },
    { label: 'Validated samples', value: fmtNumber(k.total_validated_all_rounds), sub: 'across all rounds' },
    { label: 'Distinct classifications', value: fmtNumber(k.distinct_classifications_uv), sub: `${fmtNumber(k.distinct_classifications_all)} in classifier ruleset` },
    { label: 'Unique aircraft touched', value: fmtNumber(k.distinct_aircraft_uv), sub: 'in the recent window' },
  ];
  const grid = document.getElementById('kpi-grid');
  grid.innerHTML = items.map((it) => `
    <div class="kpi ${it.cls || ''}">
      <div>
        <div class="label">${escapeHtml(it.label)}</div>
        <div class="value">${escapeHtml(it.value)}</div>
      </div>
      <div>
        ${it.delta ? `<div class="delta">${escapeHtml(it.delta)}</div>` : ''}
        <div class="denominator">${escapeHtml(it.sub || '')}</div>
      </div>
    </div>
  `).join('');
}

/* ---------- Render: filters ---------- */
function renderFilters() {
  const rounds = ['Round 1', 'Round 2', 'Update Validations', 'Final'];
  const classes = Array.from(new Set([
    ...state.data.classification_breakdown.map((x) => x.classification),
    ...state.data.classification_accuracy.map((x) => x.classification),
  ])).filter(Boolean).sort();

  const roundSel = document.getElementById('filter-round');
  rounds.forEach((r) => {
    const o = document.createElement('option');
    o.value = r; o.textContent = r;
    if (state.filters.round === r) o.selected = true;
    roundSel.appendChild(o);
  });

  const classSel = document.getElementById('filter-class');
  classes.forEach((c) => {
    const o = document.createElement('option');
    o.value = c; o.textContent = titleize(c);
    if (state.filters.classification === c) o.selected = true;
    classSel.appendChild(o);
  });

  const vSel = document.getElementById('filter-verdict');
  if (state.filters.verdict) vSel.value = state.filters.verdict;
}

function bindGlobalFilters() {
  const update = (k, v) => {
    state.filters[k] = v;
    writeQS();
    rerenderFiltered();
  };
  document.getElementById('filter-round').addEventListener('change', (e) => update('round', e.target.value));
  document.getElementById('filter-class').addEventListener('change', (e) => update('classification', e.target.value));
  document.getElementById('filter-verdict').addEventListener('change', (e) => update('verdict', e.target.value));
  const reset = document.getElementById('filter-reset');
  const doReset = () => {
    state.filters = { round: '', classification: '', verdict: '' };
    document.getElementById('filter-round').value = '';
    document.getElementById('filter-class').value = '';
    document.getElementById('filter-verdict').value = '';
    writeQS();
    rerenderFiltered();
  };
  reset.addEventListener('click', doReset);
  reset.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') doReset(); });
}

function rerenderFiltered() {
  renderAllCharts();
  renderExplorer();
}

/* ---------- Filter helpers ---------- */
function filteredValidatedRows() {
  return state.data.validated_rows.filter((r) => {
    if (state.filters.round && r.round !== state.filters.round) return false;
    if (state.filters.classification && r.classified_as !== state.filters.classification) return false;
    if (state.filters.verdict && r.verdict !== state.filters.verdict) return false;
    return true;
  });
}

/* ---------- Charts ---------- */
function ensureChart(id) {
  const el = document.getElementById(id);
  if (!el) return null;
  if (state.charts[id]) return state.charts[id];
  state.charts[id] = echarts.init(el, null, { renderer: 'svg' });
  return state.charts[id];
}

function renderAllCharts() {
  renderTrajectoryChart();
  renderVolumeChart();
  renderBreakdownChart();
  renderAccuracyByClassChart();
  renderHourChart();
  renderDowChart();
  renderDateChart();
  renderConfidenceChart();
}

function resizeCharts() {
  Object.values(state.charts).forEach((c) => c && c.resize());
}

function renderTrajectoryChart() {
  const chart = ensureChart('chart-trajectory'); if (!chart) return;
  const rs = state.data.round_summaries.filter((r) => r.validated > 0);
  const filt = state.filters.round;
  const labels = rs.map((r) => r.name);
  const strict = rs.map((r) => r.strict_accuracy_pct);
  const weighted = rs.map((r) => r.weighted_accuracy_pct);
  const sampleN = rs.map((r) => r.validated);

  chart.setOption({
    ...ECHART_BASE,
    tooltip: {
      ...ECHART_BASE.tooltip,
      trigger: 'axis',
      formatter: (params) => {
        if (!params || !params.length) return '';
        const i = params[0].dataIndex;
        const r = rs[i];
        return `<div style="font-weight:500;margin-bottom:6px;">${escapeHtml(r.name)}</div>
                <div>Strict: <strong>${fmtPercent(r.strict_accuracy_pct)}</strong></div>
                <div>Weighted: <strong>${fmtPercent(r.weighted_accuracy_pct)}</strong></div>
                <div style="margin-top:6px;color:${VIZ.muted};">Sample n=${fmtNumber(r.validated)} · Correct ${r.correct} · Half ${r.half_correct} · Incorrect ${r.incorrect}</div>`;
      },
    },
    legend: { top: 4, right: 8, textStyle: { color: VIZ.muted, fontSize: 12 }, icon: 'roundRect' },
    xAxis: {
      type: 'category', data: labels,
      axisLine: { lineStyle: { color: VIZ.border } },
      axisTick: { show: false },
      axisLabel: { color: VIZ.muted, fontSize: 12 },
    },
    yAxis: {
      type: 'value', min: 70, max: 100,
      axisLine: { show: false }, axisTick: { show: false },
      splitLine: { lineStyle: { color: VIZ.border, type: 'dashed' } },
      axisLabel: { color: VIZ.muted, formatter: (v) => v + '%' },
    },
    series: [
      {
        name: 'Strict accuracy', type: 'line', data: strict,
        smooth: false, symbol: 'circle', symbolSize: 9,
        lineStyle: { color: VIZ.base[2], width: 2 },
        itemStyle: { color: VIZ.base[2], borderColor: VIZ.card, borderWidth: 2 },
        areaStyle: { color: 'hsla(196,13%,50%,0.08)' },
        label: { show: true, position: 'top', formatter: (p) => fmtPercent(p.value), color: VIZ.fg, fontSize: 12, fontWeight: 500 },
        emphasis: { focus: 'series' },
        markPoint: filt ? {
          symbol: 'pin', symbolSize: 36,
          data: labels.map((l, i) => l === filt ? { value: '', coord: [i, strict[i]] } : null).filter(Boolean),
          itemStyle: { color: VIZ.action },
        } : undefined,
      },
      {
        name: 'Weighted accuracy', type: 'line', data: weighted,
        smooth: false, symbol: 'circle', symbolSize: 7,
        lineStyle: { color: VIZ.base[1], width: 1.5, type: 'dashed' },
        itemStyle: { color: VIZ.base[1] },
      },
      {
        name: 'Sample size', type: 'bar', yAxisIndex: 0, data: sampleN.map(() => 0),
        tooltip: { show: false }, silent: true,
      },
    ],
    graphic: rs.map((r, i) => ({
      type: 'text', left: 'center', top: 'bottom',
      style: {
        text: `n=${r.validated}`,
        fontFamily: 'JetBrains Mono, monospace', fontSize: 10, fill: VIZ.muted,
      },
      position: [getXPos(chart, i, labels.length), chart.getHeight() - 18],
    })),
  });
}
function getXPos(chart, i, total) {
  const w = chart.getWidth() - 56 - 24;
  const step = w / Math.max(1, total - 1);
  return 56 + i * step;
}

function renderVolumeChart() {
  const chart = ensureChart('chart-volume'); if (!chart) return;
  const days = state.data.daily_volume;
  // Pick top 6 classifications by total volume, rest -> "other"
  const totals = {};
  days.forEach((d) => Object.entries(d.by_class).forEach(([k, v]) => totals[k] = (totals[k] || 0) + v));
  const sortedClasses = Object.entries(totals).sort((a, b) => b[1] - a[1]);
  const topClasses = sortedClasses.slice(0, 6).map(([k]) => k);
  const topSet = new Set(topClasses);
  const series = [...topClasses, 'other'].map((cls, idx) => ({
    name: titleize(cls),
    type: 'bar', stack: 'vol',
    barMaxWidth: 18,
    itemStyle: { color: VIZ.base[idx % VIZ.base.length] },
    emphasis: { focus: 'series' },
    data: days.map((d) => {
      if (cls === 'other') {
        let sum = 0;
        for (const [k, v] of Object.entries(d.by_class)) if (!topSet.has(k)) sum += v;
        return sum;
      }
      return d.by_class[cls] || 0;
    }),
  }));

  chart.setOption({
    ...ECHART_BASE,
    grid: { left: 48, right: 24, top: 56, bottom: 60, containLabel: true },
    tooltip: {
      ...ECHART_BASE.tooltip,
      trigger: 'axis',
      axisPointer: { type: 'shadow' },
      formatter: (params) => {
        if (!params || !params.length) return '';
        const date = params[0].axisValue;
        const total = params.reduce((s, p) => s + (p.value || 0), 0);
        let rows = params
          .slice()
          .sort((a, b) => (b.value || 0) - (a.value || 0))
          .filter((p) => p.value > 0)
          .map((p) => `<div style="display:flex;justify-content:space-between;gap:16px;"><span><span style="display:inline-block;width:8px;height:8px;background:${p.color};margin-right:6px;border-radius:2px;"></span>${escapeHtml(p.seriesName)}</span><strong>${fmtNumber(p.value)}</strong></div>`)
          .join('');
        return `<div style="font-weight:500;margin-bottom:6px;">${escapeHtml(date)}</div>${rows}<div style="margin-top:6px;border-top:1px solid ${VIZ.border};padding-top:4px;display:flex;justify-content:space-between;"><span>Total</span><strong>${fmtNumber(total)}</strong></div>`;
      },
    },
    legend: { top: 8, left: 8, textStyle: { color: VIZ.muted, fontSize: 11 }, icon: 'roundRect', itemHeight: 8, itemWidth: 12, type: 'scroll' },
    dataZoom: [
      { type: 'inside', xAxisIndex: 0 },
      { type: 'slider', xAxisIndex: 0, height: 18, bottom: 14, borderColor: VIZ.border, fillerColor: 'hsla(167,16%,48%,0.10)', handleStyle: { color: VIZ.action } },
    ],
    xAxis: {
      type: 'category', data: days.map((d) => d.date),
      axisLine: { lineStyle: { color: VIZ.border } },
      axisTick: { show: false },
      axisLabel: { color: VIZ.muted, fontSize: 11, rotate: 0, formatter: (v) => v.slice(5) },
    },
    yAxis: {
      type: 'value', name: 'Updates', nameTextStyle: { color: VIZ.muted, fontSize: 11 },
      axisLine: { show: false }, axisTick: { show: false },
      splitLine: { lineStyle: { color: VIZ.border, type: 'dashed' } },
      axisLabel: { color: VIZ.muted },
    },
    series,
  });
}

function renderBreakdownChart() {
  const chart = ensureChart('chart-breakdown'); if (!chart) return;
  const items = state.data.classification_breakdown.slice().sort((a, b) => b.count - a.count);
  const selected = state.filters.classification;
  const labels = items.map((x) => titleize(x.classification));
  const raw = items.map((x) => x.classification);
  const values = items.map((x) => x.count);

  chart.setOption({
    ...ECHART_BASE,
    grid: { left: 12, right: 32, top: 16, bottom: 16, containLabel: true },
    tooltip: {
      ...ECHART_BASE.tooltip,
      trigger: 'item',
      formatter: (p) => `<div style="font-weight:500;">${escapeHtml(p.name)}</div>
        <div>${fmtNumber(p.value)} updates</div>`,
    },
    xAxis: {
      type: 'value', axisLine: { show: false }, axisTick: { show: false },
      splitLine: { lineStyle: { color: VIZ.border, type: 'dashed' } },
      axisLabel: { color: VIZ.muted, formatter: (v) => fmtNumber(v) },
    },
    yAxis: {
      type: 'category', data: labels.reverse(),
      axisLine: { show: false }, axisTick: { show: false },
      axisLabel: { color: VIZ.muted, fontSize: 12 },
    },
    series: [{
      type: 'bar',
      data: values.slice().reverse().map((v, idx) => {
        const cls = raw.slice().reverse()[idx];
        const isSelected = !selected || selected === cls;
        return {
          value: v,
          itemStyle: {
            color: isSelected ? VIZ.base[2] : 'hsla(196,13%,50%,0.25)',
            borderRadius: [0, 3, 3, 0],
          },
        };
      }),
      barMaxWidth: 14,
      label: { show: true, position: 'right', color: VIZ.muted, fontSize: 11, formatter: (p) => fmtNumber(p.value) },
    }],
  });

  chart.off('click');
  chart.on('click', (p) => {
    const idx = values.length - 1 - p.dataIndex;
    const cls = raw[idx];
    state.filters.classification = state.filters.classification === cls ? '' : cls;
    document.getElementById('filter-class').value = state.filters.classification;
    writeQS();
    rerenderFiltered();
  });
}

function renderAccuracyByClassChart() {
  const chart = ensureChart('chart-accuracy-class'); if (!chart) return;
  const data = state.data.classification_accuracy.slice();
  // Sort by accuracy desc, but push low-sample to bottom
  data.sort((a, b) => (a.low_sample - b.low_sample) || (b.strict_accuracy_pct - a.strict_accuracy_pct));
  const labels = data.map((x) => titleize(x.classification) + (x.low_sample ? ' *' : ''));
  const values = data.map((x) => x.strict_accuracy_pct);

  chart.setOption({
    ...ECHART_BASE,
    grid: { left: 12, right: 80, top: 16, bottom: 28, containLabel: true },
    tooltip: {
      ...ECHART_BASE.tooltip,
      trigger: 'item',
      formatter: (p) => {
        const d = data[data.length - 1 - p.dataIndex];
        return `<div style="font-weight:500;">${escapeHtml(titleize(d.classification))}</div>
          <div>Strict: <strong>${fmtPercent(d.strict_accuracy_pct)}</strong></div>
          <div>Weighted: <strong>${fmtPercent(d.weighted_accuracy_pct)}</strong></div>
          <div style="color:${VIZ.muted};margin-top:4px;">n=${d.validated} · Correct ${d.correct} · Half ${d.half} · Incorrect ${d.incorrect}${d.low_sample ? ' <em>(low sample)</em>' : ''}</div>`;
      },
    },
    xAxis: {
      type: 'value', max: 100,
      axisLine: { show: false }, axisTick: { show: false },
      splitLine: { lineStyle: { color: VIZ.border, type: 'dashed' } },
      axisLabel: { color: VIZ.muted, formatter: (v) => v + '%' },
    },
    yAxis: {
      type: 'category', data: labels.slice().reverse(),
      axisLine: { show: false }, axisTick: { show: false },
      axisLabel: { color: VIZ.muted, fontSize: 12 },
    },
    series: [{
      type: 'bar',
      data: values.slice().reverse().map((v, idx) => {
        const d = data[data.length - 1 - idx];
        return {
          value: v,
          itemStyle: {
            color: d.low_sample ? 'hsla(33,10%,34%,0.25)' : VIZ.base[2],
            borderRadius: [0, 3, 3, 0],
          },
        };
      }),
      barMaxWidth: 14,
      label: {
        show: true, position: 'right', color: VIZ.muted, fontSize: 11,
        formatter: (p) => {
          const d = data[data.length - 1 - p.dataIndex];
          return `${fmtPercent(p.value)} · n=${d.validated}`;
        },
      },
    }],
    graphic: [{
      type: 'text', right: 8, bottom: 4,
      style: { text: '* low sample (n<5)', fill: VIZ.muted, fontSize: 11, fontFamily: 'Inter, sans-serif' },
    }],
  });
}

function renderHourChart() {
  const chart = ensureChart('chart-by-hour'); if (!chart) return;
  const rows = filteredValidatedRows();
  const buckets = aggregateByKey(rows, (r) => r.time ? new Date(r.time).getHours() : null);
  const labels = Array.from({length: 24}, (_, h) => String(h).padStart(2,'0'));
  const values = labels.map((h) => buckets[Number(h)] || null);
  miniAccuracyChart(chart, labels, values, 'h', false);
}

function renderDowChart() {
  const chart = ensureChart('chart-by-dow'); if (!chart) return;
  const rows = filteredValidatedRows();
  const buckets = aggregateByKey(rows, (r) => r.time ? new Date(r.time).getDay() : null);
  // Convert Sunday (0) to be last
  const order = [1,2,3,4,5,6,0];
  const labels = order.map((d) => DAYS[d === 0 ? 6 : d - 1]);
  const values = order.map((d) => buckets[d] || null);
  miniAccuracyChart(chart, labels, values, '', false);
}

function renderDateChart() {
  const chart = ensureChart('chart-by-date'); if (!chart) return;
  const rows = filteredValidatedRows();
  const buckets = aggregateByKey(rows, (r) => r.time ? r.time.slice(0,10) : null);
  const dates = Object.keys(buckets).sort();
  const labels = dates;
  const values = dates.map((d) => buckets[d]);
  miniAccuracyChart(chart, labels, values, '', true);
}

function aggregateByKey(rows, keyFn) {
  const out = {};
  rows.forEach((r) => {
    const k = keyFn(r);
    if (k === null || k === undefined) return;
    const b = out[k] || (out[k] = { correct: 0, half: 0, incorrect: 0, n: 0 });
    b.n++;
    if (r.verdict === 'Correct') b.correct++;
    else if (r.verdict === 'Half Correct') b.half++;
    else b.incorrect++;
  });
  return out;
}

function miniAccuracyChart(chart, labels, buckets, suffix, dateAxis) {
  const accValues = buckets.map((b) => b ? Number(((b.correct / b.n) * 100).toFixed(2)) : null);
  const nValues   = buckets.map((b) => b ? b.n : 0);

  chart.setOption({
    ...ECHART_BASE,
    grid: { left: 40, right: 16, top: 24, bottom: dateAxis ? 28 : 24, containLabel: true },
    tooltip: {
      ...ECHART_BASE.tooltip,
      trigger: 'axis', axisPointer: { type: 'shadow' },
      formatter: (params) => {
        if (!params || !params.length) return '';
        const i = params[0].dataIndex;
        const b = buckets[i];
        if (!b) return `<div>${escapeHtml(labels[i])}${suffix}</div><div style="color:${VIZ.muted};">no validated samples</div>`;
        return `<div style="font-weight:500;">${escapeHtml(labels[i])}${suffix ? ' '+suffix : ''}</div>
                <div>Strict: <strong>${b.n ? fmtPercent((b.correct/b.n)*100) : '—'}</strong></div>
                <div style="color:${VIZ.muted};">n=${b.n} · Correct ${b.correct} · Half ${b.half} · Incorrect ${b.incorrect}</div>`;
      },
    },
    xAxis: {
      type: 'category', data: labels,
      axisLine: { lineStyle: { color: VIZ.border } },
      axisTick: { show: false },
      axisLabel: {
        color: VIZ.muted, fontSize: 10,
        interval: dateAxis ? 'auto' : 0,
        formatter: dateAxis ? (v) => v.slice(5) : (v) => v + (suffix ? '' : ''),
        rotate: dateAxis && labels.length > 14 ? 35 : 0,
      },
    },
    yAxis: [
      {
        type: 'value', min: 0, max: 100,
        axisLine: { show: false }, axisTick: { show: false },
        splitLine: { lineStyle: { color: VIZ.border, type: 'dashed' } },
        axisLabel: { color: VIZ.muted, formatter: (v) => v + '%', fontSize: 10 },
      },
    ],
    series: [
      {
        name: 'Accuracy', type: 'bar',
        data: accValues.map((v, i) => ({
          value: v,
          itemStyle: { color: v === null ? 'hsla(33,10%,34%,0.15)' : v >= 95 ? VIZ.base[4] : v >= 80 ? VIZ.base[1] : VIZ.error, borderRadius: [3, 3, 0, 0] },
        })),
        barMaxWidth: 18,
      },
    ],
  });
}

function renderConfidenceChart() {
  const chart = ensureChart('chart-confidence'); if (!chart) return;
  const cd = state.data.confidence_distribution;
  const labels = cd.buckets.map((b) => b.label);
  const values = cd.buckets.map((b) => b.count);
  chart.setOption({
    ...ECHART_BASE,
    grid: { left: 40, right: 16, top: 24, bottom: 36, containLabel: true },
    tooltip: { ...ECHART_BASE.tooltip, trigger: 'axis', axisPointer: { type: 'shadow' } },
    xAxis: {
      type: 'category', data: labels,
      axisLine: { lineStyle: { color: VIZ.border } }, axisTick: { show: false },
      axisLabel: { color: VIZ.muted, fontSize: 10, rotate: 30 },
    },
    yAxis: {
      type: 'value', name: 'Rules', nameTextStyle: { color: VIZ.muted, fontSize: 11 },
      axisLine: { show: false }, axisTick: { show: false },
      splitLine: { lineStyle: { color: VIZ.border, type: 'dashed' } },
      axisLabel: { color: VIZ.muted, fontSize: 10 },
    },
    series: [{
      name: 'Classifier rules', type: 'bar',
      data: values.map((v, i) => ({ value: v, itemStyle: { color: i < 5 ? VIZ.warning : VIZ.base[2], borderRadius: [3, 3, 0, 0] } })),
      barMaxWidth: 28,
    }],
    graphic: [{
      type: 'text', right: 0, top: 0,
      style: {
        text: `mean ${cd.mean.toFixed(3)} · median ${cd.median.toFixed(3)}`,
        fill: VIZ.muted, fontSize: 11, fontFamily: 'Inter, sans-serif',
      },
    }],
  });
}

/* ---------- Narrative ---------- */
function renderNarrative() {
  const items = state.data.narrative_examples || [];
  const intros = {
    'JetNet sync lag': {
      summary: 'JetNet data changed after Marcus processed the alert but before a researcher reviewed it. The hub reflected the value at the moment of processing; JETNET had moved on by review time. These flags resolve as Correct.',
    },
    'Edge conditions and notes clarity': {
      summary: 'Marcus deliberately did not pick the obvious status because of a downstream rule (preferred-value selection, missing maintenance program, lease event-date convention). Marcus noted the reason — but not clearly enough for a reviewer to land on the same answer without help. Action: more explicit notes.',
    },
  };
  const grid = document.getElementById('narrative-grid');
  grid.innerHTML = items.map((ex) => {
    const intro = intros[ex.theme] || { summary: '' };
    const r = ex.row;
    return `
      <article class="narrative-card">
        <div class="narrative-theme">${escapeHtml(ex.theme)}</div>
        <h3>${escapeHtml(ex.theme === 'JetNet sync lag' ? 'JetNet caught up between processing and review' : 'Marcus skipped the obvious answer — for a reason')}</h3>
        <p class="muted" style="font-size:14px;">${escapeHtml(intro.summary)}</p>
        <dl class="narrative-example">
          <div><dt>Alert</dt><dd class="alert">${escapeHtml(r.alert)}</dd></div>
          <div><dt>Marcus classified as</dt><dd>${escapeHtml(titleize(r.classified_as))}</dd></div>
          <div><dt>JetHQ researcher note</dt><dd>${escapeHtml(r.jethq_notes)}</dd></div>
          <div><dt>Supernal resolution</dt><dd>${escapeHtml(r.jens_notes)}</dd></div>
          <div><dt>Verdict</dt><dd><span class="badge ${VERDICT_BADGE[r.verdict][0]}">${VERDICT_BADGE[r.verdict][1]}</span></dd></div>
        </dl>
      </article>
    `;
  }).join('');
}

/* ---------- Explorer ---------- */
function renderExplorer() {
  const tbody = document.getElementById('explorer-tbody');
  const all = filteredValidatedRows();
  const q = state.explorer.search.toLowerCase().trim();
  const filtered = q ? all.filter((r) =>
    (r.alert || '').toLowerCase().includes(q) ||
    (r.make + ' ' + r.model + ' ' + r.serial).toLowerCase().includes(q) ||
    (r.jens_notes || '').toLowerCase().includes(q) ||
    (r.jethq_notes || '').toLowerCase().includes(q) ||
    (r.classified_as || '').toLowerCase().includes(q)
  ) : all;
  const sorted = sortRows(filtered, state.explorer.sortKey, state.explorer.sortDir, 'explorer');
  document.getElementById('explorer-count').textContent = `${fmtNumber(sorted.length)} of ${fmtNumber(state.data.validated_rows.length)} validations`;

  tbody.innerHTML = sorted.map((r) => {
    const verdictHtml = `<span class="badge ${VERDICT_BADGE[r.verdict][0]}">${VERDICT_BADGE[r.verdict][1]}</span>`;
    const newVal = [r.new_value_price, r.new_status, r.new_market_status].filter(Boolean).join(' · ');
    return `
      <tr data-row="${r.id}">
        <td style="white-space:nowrap;">${r.time ? escapeHtml(fmtDate(r.time, { time: true })) : '<span class="muted">—</span>'}</td>
        <td><span class="muted">${escapeHtml(r.round)}</span></td>
        <td>${escapeHtml([r.make, r.model, r.serial].filter(Boolean).join(' '))}</td>
        <td style="max-width:340px;">${escapeHtml(r.alert)}</td>
        <td>${escapeHtml(titleize(r.classified_as))}</td>
        <td style="max-width:200px;">${escapeHtml(newVal)}</td>
        <td>${verdictHtml}</td>
        <td><button class="expand-toggle" aria-label="Expand row" data-expand="${r.id}">▾</button></td>
      </tr>
    `;
  }).join('') || `<tr><td colspan="8" class="muted" style="text-align:center;padding:32px;">No matching validations.</td></tr>`;

  // Update sort arrows
  document.querySelectorAll('#explorer-table th[data-sort]').forEach((th) => {
    const arrow = th.querySelector('.sort-arrow');
    if (!arrow) return;
    if (th.dataset.sort === state.explorer.sortKey) {
      arrow.textContent = state.explorer.sortDir === 'asc' ? '▲' : '▼';
    } else {
      arrow.textContent = '';
    }
  });
}

function sortRows(rows, key, dir, mode) {
  const mul = dir === 'asc' ? 1 : -1;
  const get = (r) => {
    switch (key) {
      case 'time': return r.time || '';
      case 'round': return r.round;
      case 'aircraft': return [r.make, r.model, r.serial].filter(Boolean).join(' ').toLowerCase();
      case 'alert': return (r.alert || '').toLowerCase();
      case 'classified_as': return (r.classified_as || '').toLowerCase();
      case 'new': return (r.new_value_price + r.new_status + r.new_market_status).toLowerCase();
      case 'verdict': return r.verdict;
      case 'confidence': return r.confidence ?? -1;
      default: return r[key] ?? '';
    }
  };
  return rows.slice().sort((a, b) => {
    const av = get(a); const bv = get(b);
    if (av < bv) return -1 * mul;
    if (av > bv) return  1 * mul;
    return 0;
  });
}

function bindExplorerControls() {
  const input = document.getElementById('explorer-search');
  if (state.explorer.search) input.value = state.explorer.search;
  input.addEventListener('input', debounce((e) => {
    state.explorer.search = e.target.value;
    writeQS();
    renderExplorer();
  }, 120));

  document.querySelectorAll('#explorer-table th[data-sort]').forEach((th) => {
    th.addEventListener('click', () => {
      const key = th.dataset.sort;
      if (state.explorer.sortKey === key) {
        state.explorer.sortDir = state.explorer.sortDir === 'asc' ? 'desc' : 'asc';
      } else {
        state.explorer.sortKey = key;
        state.explorer.sortDir = key === 'time' ? 'desc' : 'asc';
      }
      renderExplorer();
    });
  });

  // Row expand toggle (event delegation)
  document.getElementById('explorer-tbody').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-expand]');
    if (!btn) return;
    const id = btn.dataset.expand;
    const row = btn.closest('tr');
    const next = row.nextElementSibling;
    if (next && next.classList.contains('expand-row')) {
      next.remove();
      btn.textContent = '▾';
      return;
    }
    const r = state.data.validated_rows.find((x) => x.id === id);
    if (!r) return;
    const tr = document.createElement('tr');
    tr.className = 'expand-row';
    tr.innerHTML = `<td colspan="8">
      <dl class="expanded-content">
        <dt>Alert</dt><dd>${escapeHtml(r.alert)}</dd>
        <dt>Reasoning</dt><dd>${escapeHtml(r.reasoning) || '<span class="muted">—</span>'}</dd>
        <dt>Confidence</dt><dd>${r.confidence !== null && r.confidence !== undefined ? r.confidence.toFixed(2) : '<span class="muted">—</span>'}</dd>
        <dt>JetHQ note</dt><dd>${escapeHtml(r.jethq_notes) || '<span class="muted">—</span>'}</dd>
        <dt>Supernal note</dt><dd>${escapeHtml(r.jens_notes) || '<span class="muted">—</span>'}</dd>
        <dt>Hub link</dt><dd>${r.hub_link ? `<a href="${escapeHtml(r.hub_link)}" target="_blank" rel="noopener">Open in Hub ↗</a>` : '<span class="muted">—</span>'}</dd>
      </dl>
    </td>`;
    row.parentNode.insertBefore(tr, row.nextSibling);
    btn.textContent = '▴';
  });

  document.getElementById('explorer-export').addEventListener('click', exportExplorerCSV);
}

function exportExplorerCSV() {
  const all = filteredValidatedRows();
  const q = state.explorer.search.toLowerCase().trim();
  const filtered = q ? all.filter((r) =>
    (r.alert || '').toLowerCase().includes(q) ||
    (r.make + ' ' + r.model + ' ' + r.serial).toLowerCase().includes(q) ||
    (r.jens_notes || '').toLowerCase().includes(q) ||
    (r.jethq_notes || '').toLowerCase().includes(q) ||
    (r.classified_as || '').toLowerCase().includes(q)
  ) : all;
  const cols = ['id','round','time','make','model','serial','alert','classified_as','confidence','new_value_price','new_status','new_market_status','verdict','jethq_notes','jens_notes','hub_link'];
  const escape = (v) => {
    const s = v === null || v === undefined ? '' : String(v);
    return `"${s.replace(/"/g, '""')}"`;
  };
  const rows = [cols.join(','), ...filtered.map((r) => cols.map((c) => escape(r[c])).join(','))];
  const blob = new Blob([rows.join('\n')], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `marcus-validations-${new Date().toISOString().slice(0,10)}.csv`;
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
}

/* ---------- Classifier rules table ---------- */
function renderClassifier() {
  const tbody = document.getElementById('classifier-tbody');
  const q = state.classifier.search.toLowerCase().trim();
  const all = state.data.classifications;
  const filtered = q ? all.filter((r) =>
    (r.alert || '').toLowerCase().includes(q) ||
    (r.reasoning || '').toLowerCase().includes(q) ||
    (r.classified_as || '').toLowerCase().includes(q)
  ) : all;
  const sorted = sortRows(filtered, state.classifier.sortKey, state.classifier.sortDir, 'classifier');

  const total = sorted.length;
  const perPage = state.classifier.perPage;
  const maxPage = Math.max(1, Math.ceil(total / perPage));
  if (state.classifier.page > maxPage) state.classifier.page = maxPage;
  const start = (state.classifier.page - 1) * perPage;
  const slice = sorted.slice(start, start + perPage);

  tbody.innerHTML = slice.map((r) => `
    <tr>
      <td style="max-width:340px;">${escapeHtml(r.alert)}</td>
      <td>${escapeHtml(titleize(r.classified_as))}</td>
      <td>${r.confidence !== null && r.confidence !== undefined ? r.confidence.toFixed(2) : '<span class="muted">—</span>'}</td>
      <td style="max-width:520px;color:var(--fg-muted);">${escapeHtml(r.reasoning)}</td>
    </tr>
  `).join('') || `<tr><td colspan="4" class="muted" style="text-align:center;padding:24px;">No matching rules.</td></tr>`;

  document.getElementById('classifier-count').textContent = `${fmtNumber(total)} rules`;
  document.getElementById('classifier-page').textContent = `page ${state.classifier.page} / ${maxPage}`;
  document.getElementById('classifier-prev').disabled = state.classifier.page <= 1;
  document.getElementById('classifier-next').disabled = state.classifier.page >= maxPage;

  document.querySelectorAll('#classifier-table th[data-sort]').forEach((th) => {
    const arrow = th.querySelector('.sort-arrow');
    if (!arrow) return;
    if (th.dataset.sort === state.classifier.sortKey) {
      arrow.textContent = state.classifier.sortDir === 'asc' ? '▲' : '▼';
    } else {
      arrow.textContent = '';
    }
  });
}

function bindClassifierControls() {
  document.getElementById('classifier-search').addEventListener('input', debounce((e) => {
    state.classifier.search = e.target.value;
    state.classifier.page = 1;
    renderClassifier();
  }, 120));
  document.getElementById('classifier-prev').addEventListener('click', () => { state.classifier.page = Math.max(1, state.classifier.page - 1); renderClassifier(); });
  document.getElementById('classifier-next').addEventListener('click', () => { state.classifier.page += 1; renderClassifier(); });
  document.querySelectorAll('#classifier-table th[data-sort]').forEach((th) => {
    th.addEventListener('click', () => {
      const key = th.dataset.sort;
      if (state.classifier.sortKey === key) {
        state.classifier.sortDir = state.classifier.sortDir === 'asc' ? 'desc' : 'asc';
      } else {
        state.classifier.sortKey = key;
        state.classifier.sortDir = key === 'confidence' ? 'desc' : 'asc';
      }
      renderClassifier();
    });
  });
}

/* ---------- Section nav active state ---------- */
function bindSectionNav() {
  const links = Array.from(document.querySelectorAll('.section-nav a[href^="#"]'));
  const sections = links
    .map((a) => document.querySelector(a.getAttribute('href')))
    .filter(Boolean);
  const map = new Map(sections.map((s, i) => [s.id, links[i]]));
  const io = new IntersectionObserver((entries) => {
    entries.forEach((e) => {
      if (e.isIntersecting) {
        links.forEach((l) => l.classList.remove('active'));
        const link = map.get(e.target.id);
        if (link) link.classList.add('active');
      }
    });
  }, { rootMargin: '-40% 0px -50% 0px', threshold: 0 });
  sections.forEach((s) => io.observe(s));
}

/* ---------- Utility ---------- */
function debounce(fn, wait) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn.apply(null, args), wait); };
}
