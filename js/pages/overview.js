/**
 * overview.js — Overview/Home page
 */

const OverviewPage = (() => {

  function render(container, data, filterState) {
    const { summary, revenue, sales, apps, adspend } = data;
    container.innerHTML = '';

    // Shared isolation state
    const getApp = () => TotoApp.state.highlightedApp;
    const setApp = (val) => { TotoApp.state.highlightedApp = val; TotoApp.updateHashFromFilters(); };

    const title = document.createElement('h1');
    title.className = 'page-title';
    title.textContent = 'Portfolio Overview';
    container.appendChild(title);

    const subtitle = document.createElement('p');
    subtitle.className = 'page-subtitle';
    if (filterState.startDate && filterState.endDate) {
      subtitle.textContent = `${filterState.startDate} to ${filterState.endDate}`;
    } else {
      subtitle.textContent = 'All-time performance across your portfolio';
    }
    container.appendChild(subtitle);

    if (!summary) {
      TotoComponents.renderEmptyState(container, 'No summary data', 'Run the sync script to generate data/summary.json');
      return;
    }

    // Compute KPIs — scoped to isolated app or whole portfolio
    function computeMetrics(appId) {
      if (appId) {
        // Single app metrics
        let rev = 0, dl = 0, mrr = 0, dayCount = 1;
        if (revenue && revenue[appId]) {
          const dates = getFilteredDates(revenue[appId], filterState);
          dates.forEach(d => { rev += parseFloat(revenue[appId][d]?.total) || 0; });
          dayCount = Math.max(dates.length, 1);
        }
        if (sales && sales[appId]) {
          const dates = getFilteredDates(sales[appId], filterState);
          dates.forEach(d => { dl += parseFloat(sales[appId][d]?.downloads) || 0; });
          if (!dayCount || dayCount === 1) dayCount = Math.max(dates.length, 1);
        }
        if (data.subscriptions && data.subscriptions[appId]) {
          const dates = getFilteredDates(data.subscriptions[appId], filterState).sort();
          for (let i = dates.length - 1; i >= 0; i--) {
            const val = parseFloat(data.subscriptions[appId][dates[i]]?.mrr) || 0;
            if (val > 0) { mrr = val; break; }
          }
        }
        let adSpend = 0;
        if (adspend && adspend[appId]) {
          const dates = getFilteredDates(adspend[appId], filterState);
          dates.forEach(d => { adSpend += parseFloat(adspend[appId][d]?.spend) || 0; });
        }

        const netRevenue = rev - adSpend;
        const revSource = revenue[appId] ? { [appId]: revenue[appId] } : {};
        const salSource = sales && sales[appId] ? { [appId]: sales[appId] } : {};
        const adSource = adspend && adspend[appId] ? { [appId]: adspend[appId] } : {};
        const revChg = Object.keys(revSource).length ? computePeriodChange(revSource, 'total', filterState) : null;
        const dlChg = Object.keys(salSource).length ? computePeriodChange(salSource, 'downloads', filterState) : null;
        const adChg = Object.keys(adSource).length ? computePeriodChange(adSource, 'spend', filterState) : null;
        let netChg = revChg;
        if (revChg != null && adChg != null && rev > 0) {
          const prevRev = rev / (1 + revChg / 100);
          const prevAd = adSpend / (1 + adChg / 100);
          const prevNet = prevRev - prevAd;
          netChg = prevNet !== 0 ? ((netRevenue - prevNet) / Math.abs(prevNet)) * 100 : (netRevenue > 0 ? 100 : 0);
        }
        return [
          { label: 'Net Revenue', field: 'netrevenue', value: netRevenue, perDay: netRevenue / dayCount, changePercent: netChg, isCurrency: true, description: 'Revenue minus ad spend' },
          { label: 'Total Revenue', field: 'revenue', value: rev, perDay: rev / dayCount, changePercent: revChg, isCurrency: true, description: 'Revenue for the selected app' },
          { label: 'Total Downloads', field: 'downloads', value: dl, perDay: dl / dayCount, changePercent: dlChg, isCurrency: false, description: 'Downloads for the selected app' },
          { label: 'MRR', field: 'mrr', value: mrr, isCurrency: true, description: 'MRR for the selected app' }
        ];
      }

      // Portfolio-wide
      const { totals: revTotals, dayCount } = revenue
        ? aggregateTotals(revenue, ['total'], filterState)
        : { totals: { total: 0 }, dayCount: 1 };
      const { totals: salesTotals } = sales
        ? aggregateTotals(sales, ['downloads'], filterState)
        : { totals: { downloads: 0 } };
      const totalRevenue = revTotals.total;
      const totalDownloads = salesTotals.downloads;

      let totalMRR = 0;
      if (data.subscriptions) {
        const selectedApps = getSelectedAppIds(data.subscriptions, filterState);
        selectedApps.forEach(pid => {
          const appData = data.subscriptions[pid];
          if (!appData) return;
          const dates = getFilteredDates(appData, filterState).sort();
          for (let i = dates.length - 1; i >= 0; i--) {
            const val = parseFloat(appData[dates[i]]?.mrr) || 0;
            if (val > 0) { totalMRR += val; break; }
          }
        });
      }

      let totalAdSpend = 0;
      if (adspend) {
        const { totals: adTotals } = aggregateTotals(adspend, ['spend'], filterState);
        totalAdSpend = adTotals.spend;
      }

      const appCount = summary.total_apps || (summary.per_app || []).length;

      const netRevenue = totalRevenue - totalAdSpend;
      const revChange = computePeriodChange(revenue, 'total', filterState);
      const adChange = adspend ? computePeriodChange(adspend, 'spend', filterState) : null;
      // Net revenue change: compute from revenue change and ad spend change
      let netChange = revChange;
      if (revChange != null && adChange != null && totalRevenue > 0) {
        const prevRev = totalRevenue / (1 + revChange / 100);
        const prevAd = totalAdSpend / (1 + adChange / 100);
        const prevNet = prevRev - prevAd;
        netChange = prevNet !== 0 ? ((netRevenue - prevNet) / Math.abs(prevNet)) * 100 : (netRevenue > 0 ? 100 : 0);
      }

      return [
        { label: 'Net Revenue', field: 'netrevenue', value: netRevenue, perDay: netRevenue / dayCount, changePercent: netChange, isCurrency: true, description: 'Revenue minus ad spend' },
        { label: 'Total Revenue', field: 'revenue', value: totalRevenue, perDay: totalRevenue / dayCount, isCurrency: true, changePercent: computePeriodChange(revenue, 'total', filterState), description: 'Sum of all revenue sources in the selected period' },
        { label: 'Total Downloads', field: 'downloads', value: totalDownloads, perDay: totalDownloads / dayCount, isCurrency: false, changePercent: computePeriodChange(sales, 'downloads', filterState), description: 'First-time app downloads in the selected period' },
        { label: 'MRR', field: 'mrr', value: totalMRR, isCurrency: true, description: 'Monthly Recurring Revenue — latest snapshot of active subscription value' }
      ];
    }

    const chartDefs = {
      netrevenue: { dataSource: null, field: 'netrevenue', title: 'Net Revenue Trend', isCurrency: true },
      revenue: { dataSource: revenue, field: 'total', title: 'Revenue Trend', isCurrency: true },
      downloads: { dataSource: sales, field: 'downloads', title: 'Downloads Trend', isCurrency: false },
      mrr: { dataSource: null, field: 'mrr', title: 'MRR Trend', isCurrency: true }
    };

    let activeChart = 'netrevenue';
    const metrics = computeMetrics(getApp()?.id);

    // Chart section
    const chartSection = document.createElement('div');
    chartSection.className = 'chart-container';
    chartSection.id = 'overviewChartSection';
    chartSection.innerHTML = `
      <div class="chart-header-row">
        <div class="chart-title" id="overviewChartTitle">Revenue Trend</div>
        <div class="chart-isolation-chip hidden" id="chartIsolationChip"></div>
      </div>
      <div class="chart-wrapper"><canvas id="overviewMainChart"></canvas></div>
    `;

    function onIsolationChange() {
      updateIsolationChip();
      renderOverviewChart(activeChart);
      kpiRow.updateValues(computeMetrics(getApp()?.id));
      // Update row selected state
      container.querySelectorAll('.table-row-selected').forEach(el => el.classList.remove('table-row-selected'));
      if (getApp()) {
        container.querySelectorAll('.data-table tbody tr.table-row-clickable').forEach(tr => {
          const nameEl = tr.querySelector('.app-name');
          if (nameEl && nameEl.textContent === getApp().name) {
            tr.classList.add('table-row-selected');
          }
        });
      }
    }

    function updateIsolationChip() {
      const chip = document.getElementById('chartIsolationChip');
      if (!chip) return;
      if (getApp()) {
        chip.classList.remove('hidden');
        chip.innerHTML = `Showing: ${TotoComponents.escapeHtml(getApp().name)} <button class="chip-clear">\u2715</button>`;
        chip.querySelector('.chip-clear').addEventListener('click', () => {
          setApp(null);
          onIsolationChange();
        });
      } else {
        chip.classList.add('hidden');
        chip.innerHTML = '';
      }
    }

    function renderOverviewChart(chartKey) {
      const def = chartDefs[chartKey];
      if (!def) return;
      const ha = getApp();

      const titleEl = document.getElementById('overviewChartTitle');
      if (titleEl) titleEl.textContent = def.title;

      TotoCharts.destroyChart('overviewMainChart');

      // Net revenue: compute revenue - adspend per day, broken down by app
      if (chartKey === 'netrevenue') {
        if (ha) {
          const appRev = revenue[ha.id] || {};
          const appAd = adspend && adspend[ha.id] ? adspend[ha.id] : {};
          const dates = getFullDateRange(filterState);
          const bucketed = bucketDates(dates, filterState.granularity);
          const labels = bucketed.map(b => b.label);
          const values = bucketed.map(b => b.dates.reduce((sum, date) => {
            return sum + (parseFloat(appRev[date]?.total) || 0) - (parseFloat(appAd[date]?.spend) || 0);
          }, 0));
          if (labels.length > 0) {
            const rawDates = filterState.granularity === 'daily' ? bucketed.map(b => b.dates[0]) : null;
            TotoCharts.createAreaChart('overviewMainChart', labels, [{ label: shortAppName(ha.name), data: values }], { isCurrency: true, stacked: false, rawDates });
          }
        } else {
          const selectedApps = getSelectedAppIds(revenue, filterState);
          const dates = getFullDateRange(filterState);
          const appTotals = {};
          selectedApps.forEach(pid => {
            let total = 0;
            dates.forEach(d => {
              total += (parseFloat(revenue[pid]?.[d]?.total) || 0) - (adspend && adspend[pid] ? (parseFloat(adspend[pid]?.[d]?.spend) || 0) : 0);
            });
            appTotals[pid] = total;
          });
          const ranked = Object.entries(appTotals).sort((a, b) => b[1] - a[1]);
          const topApps = ranked.slice(0, 5).map(([id]) => id);
          const otherApps = ranked.slice(5).map(([id]) => id);
          const bucketed = bucketDates(dates, filterState.granularity);
          const labels = bucketed.map(b => b.label);
          const datasets = topApps.map(pid => ({
            label: shortAppName((apps[pid] || {}).name || `App ${pid}`),
            data: bucketed.map(b => b.dates.reduce((sum, date) => {
              return sum + (parseFloat(revenue[pid]?.[date]?.total) || 0) - (adspend && adspend[pid] ? (parseFloat(adspend[pid]?.[date]?.spend) || 0) : 0);
            }, 0))
          }));
          if (otherApps.length > 0) {
            const otherData = bucketed.map(b => b.dates.reduce((sum, date) => {
              let daySum = 0;
              otherApps.forEach(pid => {
                daySum += (parseFloat(revenue[pid]?.[date]?.total) || 0) - (adspend && adspend[pid] ? (parseFloat(adspend[pid]?.[date]?.spend) || 0) : 0);
              });
              return sum + daySum;
            }, 0));
            if (otherData.some(v => v !== 0)) datasets.push({ label: 'Other', data: otherData });
          }
          if (labels.length > 0) {
            const rawDates = filterState.granularity === 'daily' ? bucketed.map(b => b.dates[0]) : null;
            TotoCharts.createAreaChart('overviewMainChart', labels, datasets, { isCurrency: true, rawDates });
          }
        }
        return;
      }

      if (ha) {
        if (chartKey === 'mrr' && data.subscriptions && data.subscriptions[ha.id]) {
          const appData = data.subscriptions[ha.id];
          const dates = getFullDateRange(filterState);
          const dateAgg = {};
          dates.forEach(date => {
            const val = parseFloat(appData[date]?.mrr) || 0;
            if (val > 0) dateAgg[date] = val;
          });
          const sortedDates = Object.keys(dateAgg).sort();
          const bucketed = bucketDates(sortedDates, filterState.granularity);
          const labels = bucketed.map(b => b.label);
          const values = bucketed.map(b => { const ld = b.dates[b.dates.length - 1]; return dateAgg[ld] || 0; });
          if (labels.length > 0) {
            const rawDates = filterState.granularity === 'daily' ? bucketed.map(b => b.dates[0]) : null;
            TotoCharts.createAreaChart('overviewMainChart', labels, [{ label: shortAppName(ha.name), data: values }], { isCurrency: true, stacked: false, rawDates });
          }
        } else if (def.dataSource && def.dataSource[ha.id]) {
          const appData = def.dataSource[ha.id];
          const dates = getFullDateRange(filterState);
          const bucketed = bucketDates(dates, filterState.granularity);
          const labels = bucketed.map(b => b.label);
          const values = bucketed.map(b => b.dates.reduce((sum, date) => sum + (parseFloat(appData[date]?.[def.field]) || 0), 0));
          if (labels.length > 0) {
            const rawDates = filterState.granularity === 'daily' ? bucketed.map(b => b.dates[0]) : null;
            TotoCharts.createAreaChart('overviewMainChart', labels, [{ label: shortAppName(ha.name), data: values }], { isCurrency: def.isCurrency, stacked: false, rawDates });
          }
        }
        return;
      }

      if (chartKey === 'mrr' && data.subscriptions) {
        const dateAgg = {};
        const selectedApps = getSelectedAppIds(data.subscriptions, filterState);
        selectedApps.forEach(pid => {
          const appData = data.subscriptions[pid];
          if (!appData) return;
          getFilteredDates(appData, filterState).forEach(date => {
            const val = parseFloat(appData[date]?.mrr) || 0;
            if (val > 0) dateAgg[date] = (dateAgg[date] || 0) + val;
          });
        });
        const sortedDates = Object.keys(dateAgg).sort();
        const bucketed = bucketDates(sortedDates, filterState.granularity);
        const labels = bucketed.map(b => b.label);
        const values = bucketed.map(b => { const ld = b.dates[b.dates.length - 1]; return dateAgg[ld] || 0; });
        if (labels.length > 0) {
          const rawDates = filterState.granularity === 'daily' ? bucketed.map(b => b.dates[0]) : null;
          TotoCharts.createAreaChart('overviewMainChart', labels, [{ label: 'MRR', data: values }], { isCurrency: true, stacked: false, rawDates });
        }
      } else if (def.dataSource) {
        const chartData = buildTimeSeriesData(def.dataSource, def.field, apps, filterState, { topN: 5, showComparison: true });
        if (chartData.labels.length > 0) {
          TotoCharts.createAreaChart('overviewMainChart', chartData.labels, chartData.datasets, {
            isCurrency: def.isCurrency, rawDates: chartData.rawDates, previousPeriodData: chartData.previousPeriodData
          });
        }
      }
    }

    const kpiRow = TotoComponents.renderKPICards(container, metrics, {
      activeField: activeChart,
      onSelect: (field) => {
        activeChart = field;
        renderOverviewChart(field);
      }
    });

    container.appendChild(chartSection);
    updateIsolationChip();
    renderOverviewChart(activeChart);

    // Top apps table
    const appRows = buildAppOverviewRows(data, filterState);
    if (appRows.length > 0) {
      const maxRevenue = Math.max(...appRows.map(a => a.revenue), 1);
      const totalRevForTable = appRows.reduce((sum, a) => sum + a.revenue, 0);

      const columns = [
        {
          key: 'rank', label: '#', align: 'center',
          render: (val, row, i) => {
            const cls = i === 0 ? 'gold' : i === 1 ? 'silver' : i === 2 ? 'bronze' : '';
            return cls ? `<span class="rank-badge ${cls}">${i + 1}</span>` : `<span>${i + 1}</span>`;
          }
        },
        {
          key: 'name', label: 'App',
          render: (val, row) => {
            const icon = row.icon ? `<img class="app-icon" src="${TotoComponents.escapeHtml(row.icon)}" alt="" onerror="this.style.display='none'">` : '<div class="app-icon"></div>';
            return `<div class="app-cell">${icon}<div><div class="app-name">${TotoComponents.escapeHtml(shortAppName(row.name))}</div>${row.developer ? `<div class="app-developer">${TotoComponents.escapeHtml(row.developer)}</div>` : ''}</div></div>`;
          }
        },
        { key: 'revenue', label: 'Revenue', align: 'right', barMax: maxRevenue, format: (val) => TotoComponents.formatNumber(val, { currency: true }) },
        { key: 'share', label: 'Share', align: 'right', format: (val, row) => !totalRevForTable ? '--' : (row.revenue / totalRevForTable * 100).toFixed(1) + '%' },
        { key: 'downloads', label: 'Downloads', align: 'right', format: (val) => TotoComponents.formatNumber(val) },
        { key: 'rpd', label: 'RPD', align: 'right', format: (val, row) => !row.downloads ? '\u2014' : TotoComponents.formatNumber(row.revenue / row.downloads, { currency: true, compact: false, decimals: 2 }) },
        { key: 'mrr', label: 'MRR', align: 'right', format: (val) => TotoComponents.formatNumber(val, { currency: true }) }
      ];

      TotoComponents.renderTable(container, columns, appRows, {
        title: 'Top Apps',
        defaultSort: 'revenue',
        defaultSortDir: 'desc',
        hideZerosField: 'revenue',
        selectedRowId: getApp() ? getApp().id : null,
        onRowClick: (row) => {
          if (getApp() && getApp().id === row.id) {
            setApp(null);
          } else {
            setApp({ id: row.id, name: row.name });
          }
          const chartEl = document.getElementById('overviewChartSection');
          if (chartEl) chartEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
          onIsolationChange();
        }
      });
    }
  }

  function buildAppOverviewRows(data, filterState) {
    const { apps, revenue, sales, subscriptions } = data;
    const appMap = apps || {};
    const allIds = Object.keys(appMap);
    const rows = [];

    allIds.forEach(pid => {
      const appInfo = appMap[pid] || {};
      if (appInfo.type && appInfo.type !== 'app') return;

      let rev = 0, dl = 0, mrr = 0;
      if (revenue && revenue[pid]) {
        const dates = getFilteredDates(revenue[pid], filterState);
        dates.forEach(d => { rev += parseFloat(revenue[pid][d]?.total) || 0; });
      }
      if (sales && sales[pid]) {
        const dates = getFilteredDates(sales[pid], filterState);
        dates.forEach(d => { dl += parseFloat(sales[pid][d]?.downloads) || 0; });
      }
      if (subscriptions && subscriptions[pid]) {
        const dates = getFilteredDates(subscriptions[pid], filterState).sort();
        for (let i = dates.length - 1; i >= 0; i--) {
          const val = parseFloat(subscriptions[pid][dates[i]]?.mrr) || 0;
          if (val > 0) { mrr = val; break; }
        }
      }
      if (rev > 0 || dl > 0 || mrr > 0) {
        rows.push({ id: pid, name: appInfo.name || `App ${pid}`, icon: appInfo.icon || '', developer: appInfo.developer || '', revenue: rev, downloads: dl, mrr, rpd: dl > 0 ? rev / dl : 0 });
      }
    });

    const totalRev = rows.reduce((sum, r) => sum + r.revenue, 0);
    rows.forEach(r => { r.share = totalRev > 0 ? (r.revenue / totalRev) * 100 : 0; });
    return rows;
  }

  return { render };
})();
