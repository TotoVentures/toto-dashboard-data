/**
 * rankings.js — ASO Keyword Rankings page
 */

const RankingsPage = (() => {

  let selectedAppId = null;
  let rankingsData = null;
  let dataLoaded = false;
  let currentChart = null;

  async function loadData() {
    if (rankingsData) return rankingsData;
    try {
      const resp = await fetch('data/rankings.json');
      if (!resp.ok) return null;
      rankingsData = await resp.json();
      dataLoaded = true;
      return rankingsData;
    } catch (e) {
      console.warn('Failed to load rankings data:', e.message);
      return null;
    }
  }

  function render(container) {
    container.innerHTML = '';

    const title = document.createElement('h1');
    title.className = 'page-title';
    title.textContent = 'Rankings';
    container.appendChild(title);

    const subtitle = document.createElement('p');
    subtitle.className = 'page-subtitle';
    subtitle.textContent = 'App Store keyword rankings tracked via Astro';
    container.appendChild(subtitle);

    const wrapper = document.createElement('div');
    wrapper.id = 'rankingsWrapper';
    wrapper.innerHTML = '<div class="loading-state"><div class="spinner"></div><p>Loading rankings data...</p></div>';
    container.appendChild(wrapper);

    loadData().then(data => {
      if (!data || !data.apps || Object.keys(data.apps).length === 0) {
        wrapper.innerHTML = '';
        TotoComponents.renderEmptyState(wrapper, 'No rankings data', 'Run the rankings sync to pull Astro keyword data');
        return;
      }
      renderContent(wrapper, data);
    });
  }

  function renderContent(wrapper, data) {
    wrapper.innerHTML = '';

    // Sync info
    const syncNote = document.createElement('div');
    syncNote.className = 'rankings-sync-note';
    const syncDate = data.sync_date ? new Date(data.sync_date) : null;
    syncNote.textContent = syncDate ? `Data from ${syncDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}` : '';
    wrapper.appendChild(syncNote);

    // App cards grid
    const grid = document.createElement('div');
    grid.className = 'rankings-app-grid';

    const sortedApps = Object.entries(data.apps).sort((a, b) => {
      const aTop = a[1].keywords.filter(k => k.currentRanking <= 10).length;
      const bTop = b[1].keywords.filter(k => k.currentRanking <= 10).length;
      return bTop - aTop;
    });

    sortedApps.forEach(([appId, app]) => {
      const keywords = app.keywords || [];
      const ranked = keywords.filter(k => k.currentRanking < 200);
      const top10 = ranked.filter(k => k.currentRanking <= 10);
      const top3 = ranked.filter(k => k.currentRanking <= 3);
      const num1 = ranked.filter(k => k.currentRanking === 1);

      const card = document.createElement('div');
      card.className = 'rankings-app-card' + (selectedAppId === appId ? ' selected' : '');
      card.innerHTML = `
        <div class="rankings-app-name">${TotoComponents.escapeHtml(app.name)}</div>
        <div class="rankings-app-stats">
          <div class="rankings-stat">
            <span class="rankings-stat-value">${ranked.length}</span>
            <span class="rankings-stat-label">Ranked</span>
          </div>
          <div class="rankings-stat">
            <span class="rankings-stat-value rankings-stat-gold">${top10.length}</span>
            <span class="rankings-stat-label">Top 10</span>
          </div>
          <div class="rankings-stat">
            <span class="rankings-stat-value rankings-stat-green">${num1.length}</span>
            <span class="rankings-stat-label">#1</span>
          </div>
        </div>
      `;
      card.addEventListener('click', () => {
        selectedAppId = appId;
        grid.querySelectorAll('.rankings-app-card').forEach(c => c.classList.remove('selected'));
        card.classList.add('selected');
        renderAppDetail(detailContainer, data, appId);
      });
      grid.appendChild(card);
    });

    wrapper.appendChild(grid);

    // Detail container
    const detailContainer = document.createElement('div');
    detailContainer.id = 'rankingsDetail';
    wrapper.appendChild(detailContainer);

    // Auto-select first app
    if (!selectedAppId && sortedApps.length > 0) {
      selectedAppId = sortedApps[0][0];
      grid.querySelector('.rankings-app-card')?.classList.add('selected');
      renderAppDetail(detailContainer, data, selectedAppId);
    } else if (selectedAppId) {
      renderAppDetail(detailContainer, data, selectedAppId);
    }
  }

  function renderAppDetail(container, data, appId) {
    if (currentChart) { currentChart.destroy(); currentChart = null; }
    TotoCharts.destroyAll();
    container.innerHTML = '';
    const app = data.apps[appId];
    if (!app) return;

    const keywords = app.keywords || [];
    const ranked = keywords.filter(k => k.currentRanking < 200);

    // KPI row
    const top10 = ranked.filter(k => k.currentRanking <= 10);
    const top3 = ranked.filter(k => k.currentRanking <= 3);
    const num1 = ranked.filter(k => k.currentRanking === 1);
    const avgRank = ranked.length > 0 ? Math.round(ranked.reduce((s, k) => s + k.currentRanking, 0) / ranked.length) : 0;
    const improving = ranked.filter(k => k.change > 0).length;
    const declining = ranked.filter(k => k.change < 0).length;

    const kpiRow = document.createElement('div');
    kpiRow.className = 'kpi-row';
    const kpis = [
      { label: 'Ranked Keywords', value: ranked.length, desc: 'Keywords with a ranking under 200' },
      { label: 'Top 10', value: top10.length, desc: 'Keywords ranked in the top 10' },
      { label: '#1 Rankings', value: num1.length, desc: 'Keywords where this app ranks #1' },
      { label: 'Avg Rank', value: avgRank, desc: 'Average ranking across all ranked keywords' },
      { label: 'Improving', value: improving, cls: 'text-green', desc: 'Keywords that improved since last check' },
      { label: 'Declining', value: declining, cls: 'text-red', desc: 'Keywords that dropped since last check' },
    ];
    kpis.forEach(k => {
      const card = document.createElement('div');
      card.className = 'kpi-card';
      card.title = k.desc || '';
      card.innerHTML = `
        <div class="kpi-header"><span class="kpi-label">${k.label}</span></div>
        <div class="kpi-value ${k.cls || ''}">${k.value}</div>
      `;
      kpiRow.appendChild(card);
    });
    container.appendChild(kpiRow);

    // Chart — ranking over time for keywords with history
    const kwWithHistory = keywords.filter(k => k.history && k.history.length > 1 && k.currentRanking < 200);
    if (kwWithHistory.length > 0) {
      renderRankingsChart(container, kwWithHistory, app.name);
    }

    // Rank distribution bar
    renderRankDistribution(container, ranked);

    // Keywords table
    renderKeywordsTable(container, keywords);
  }

  function renderRankingsChart(container, kwWithHistory, appName) {
    // Sort by popularity desc, take top 8
    const topKw = kwWithHistory
      .sort((a, b) => (b.popularity - a.popularity) || (a.currentRanking - b.currentRanking))
      .slice(0, 8);

    // Collect all dates across all keywords
    const allDates = new Set();
    topKw.forEach(k => k.history.forEach(h => {
      allDates.add(h.date.slice(0, 10));
    }));
    const sortedDates = [...allDates].sort();

    if (sortedDates.length < 2) return;

    const chartSection = document.createElement('div');
    chartSection.className = 'chart-container';
    chartSection.innerHTML = `
      <div class="chart-title">Keyword Rankings Over Time</div>
      <div class="chart-wrapper" style="height:350px"><canvas id="rankingsChart"></canvas></div>
    `;
    container.appendChild(chartSection);

    const labels = sortedDates.map(d => {
      const dt = new Date(d + 'T00:00:00');
      const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
      return `${months[dt.getMonth()]} ${dt.getDate()}`;
    });

    const COLORS = [
      '#4A90D9', '#E67E22', '#27AE60', '#E74C3C',
      '#9B59B6', '#1ABC9C', '#F39C12', '#E91E63'
    ];

    const datasets = topKw.map((kw, i) => {
      const histMap = {};
      kw.history.forEach(h => { histMap[h.date.slice(0, 10)] = h.ranking; });
      const data = sortedDates.map(d => {
        const r = histMap[d];
        return (r && r < 200) ? r : null;
      });
      const color = COLORS[i % COLORS.length];
      const popLabel = kw.popularity > 5 ? ` (${kw.popularity})` : '';
      return {
        label: kw.keyword + popLabel,
        data: data,
        borderColor: color,
        backgroundColor: 'transparent',
        fill: false,
        tension: 0.3,
        borderWidth: 2.5,
        pointRadius: 3,
        pointHoverRadius: 5,
        pointBackgroundColor: color,
        pointHoverBackgroundColor: color,
        pointBorderColor: '#fff',
        pointHoverBorderColor: '#fff',
        pointBorderWidth: 1.5,
        spanGaps: true,
      };
    });

    TotoCharts.destroyChart('rankingsChart');
    const canvas = document.getElementById('rankingsChart');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    const chart = new Chart(ctx, {
      type: 'line',
      data: { labels, datasets },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: {
            display: true,
            position: 'top',
            align: 'start',
            labels: {
              boxWidth: 12, boxHeight: 12, borderRadius: 3,
              useBorderRadius: true, padding: 14,
              font: { size: 12, weight: '500' }, color: '#6B7280'
            }
          },
          tooltip: {
            mode: 'index',
            intersect: false,
            backgroundColor: 'rgba(26,26,46,0.92)',
            titleColor: '#fff',
            bodyColor: '#ddd',
            cornerRadius: 8,
            padding: 12,
            callbacks: {
              label: function(ctx) {
                const v = ctx.parsed.y;
                if (v == null) return null;
                return `  ${ctx.dataset.label}: #${v}`;
              }
            }
          }
        },
        scales: {
          x: {
            grid: { display: false },
            border: { display: false },
            ticks: { font: { size: 11 }, color: '#9CA3AF', maxRotation: 0, maxTicksLimit: 10 }
          },
          y: {
            reverse: true,
            min: 1,
            grid: { color: '#F0F0F0', drawBorder: false },
            border: { display: false },
            ticks: {
              font: { size: 11 }, color: '#9CA3AF',
              callback: function(v) { return '#' + v; },
              stepSize: 5
            },
            title: {
              display: true,
              text: 'Rank (lower is better)',
              color: '#9CA3AF',
              font: { size: 11 }
            }
          }
        }
      }
    });

    currentChart = chart;
  }

  function renderRankDistribution(container, ranked) {
    const buckets = [
      { label: '#1', min: 1, max: 1, color: '#27AE60' },
      { label: '#2-3', min: 2, max: 3, color: '#2ECC71' },
      { label: '#4-10', min: 4, max: 10, color: '#4A90D9' },
      { label: '#11-25', min: 11, max: 25, color: '#F39C12' },
      { label: '#26-50', min: 26, max: 50, color: '#E67E22' },
      { label: '#51+', min: 51, max: 999, color: '#E74C3C' },
    ];

    const total = ranked.length || 1;
    const el = document.createElement('div');
    el.className = 'rankings-distribution';
    el.innerHTML = `<div class="rankings-dist-title">Rank Distribution</div>`;

    const bar = document.createElement('div');
    bar.className = 'rankings-dist-bar';

    const legend = document.createElement('div');
    legend.className = 'rankings-dist-legend';

    buckets.forEach(b => {
      const count = ranked.filter(k => k.currentRanking >= b.min && k.currentRanking <= b.max).length;
      if (count === 0) return;
      const pct = (count / total) * 100;
      const seg = document.createElement('div');
      seg.className = 'rankings-dist-seg';
      seg.style.width = `${Math.max(pct, 2)}%`;
      seg.style.backgroundColor = b.color;
      seg.title = `${b.label}: ${count} keywords`;
      bar.appendChild(seg);

      const item = document.createElement('div');
      item.className = 'rankings-dist-item';
      item.innerHTML = `<span class="rankings-dist-dot" style="background:${b.color}"></span>${b.label}: ${count}`;
      legend.appendChild(item);
    });

    el.appendChild(bar);
    el.appendChild(legend);
    container.appendChild(el);
  }

  function renderKeywordsTable(container, keywords) {
    // Sort: ranked first (by rank asc), then unranked
    const sorted = [...keywords].sort((a, b) => {
      const aR = a.currentRanking >= 200 ? 9999 : a.currentRanking;
      const bR = b.currentRanking >= 200 ? 9999 : b.currentRanking;
      return aR - bR;
    });

    const columns = [
      {
        key: 'currentRanking', label: 'Rank', align: 'center',
        render: (val) => {
          if (val >= 200) return '<span class="text-muted">\u2014</span>';
          if (val === 1) return '<span class="rank-badge gold">1</span>';
          if (val <= 3) return '<span class="rank-badge silver">' + val + '</span>';
          if (val <= 10) return '<span class="rank-badge bronze">' + val + '</span>';
          return '<span class="rankings-rank">' + val + '</span>';
        }
      },
      {
        key: 'keyword', label: 'Keyword',
        render: (val) => '<span class="rankings-keyword">' + TotoComponents.escapeHtml(val) + '</span>'
      },
      {
        key: 'change', label: 'Change', align: 'center',
        render: (val, row) => {
          if (row.currentRanking >= 200 && row.previousRanking >= 200) return '<span class="text-muted">\u2014</span>';
          if (val > 0) return '<span class="rankings-change-up">\u25B2 ' + val + '</span>';
          if (val < 0) return '<span class="rankings-change-down">\u25BC ' + Math.abs(val) + '</span>';
          return '<span class="rankings-change-flat">\u2022</span>';
        }
      },
      {
        key: 'popularity', label: 'Pop', align: 'right',
        render: (val) => {
          if (val <= 5) return '<span class="text-muted">' + val + '</span>';
          const cls = val >= 40 ? 'rankings-pop-high' : val >= 20 ? 'rankings-pop-med' : 'rankings-pop-low';
          return '<span class="' + cls + '">' + val + '</span>';
        }
      },
      {
        key: 'difficulty', label: 'Diff', align: 'right',
        render: (val) => {
          const cls = val >= 70 ? 'text-red' : val >= 50 ? 'text-muted' : 'text-green';
          return '<span class="' + cls + '">' + val + '</span>';
        }
      },
    ];

    TotoComponents.renderTable(container, columns, sorted, {
      title: `Keywords (${keywords.length} tracked)`,
      defaultSort: 'currentRanking',
      defaultSortDir: 'asc'
    });
  }

  return { render };
})();
