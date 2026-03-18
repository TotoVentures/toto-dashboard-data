/**
 * revenue.js — Revenue page
 */

const RevenuePage = (() => {

  function render(container, data, filterState) {
    const { revenue, apps, adspend } = data;
    container.innerHTML = '';

    const getApp = () => TotoApp.state.highlightedApp;
    const setApp = (val) => { TotoApp.state.highlightedApp = val; TotoApp.updateHashFromFilters(); };

    const title = document.createElement('h1');
    title.className = 'page-title';
    title.textContent = 'Revenue';
    container.appendChild(title);

    const subtitle = document.createElement('p');
    subtitle.className = 'page-subtitle';
    subtitle.textContent = 'Subscription revenue, IAP, and app sales breakdown';
    container.appendChild(subtitle);

    if (!revenue || Object.keys(revenue).length === 0) {
      TotoComponents.renderEmptyState(container, 'No revenue data', 'Run the sync script to generate data/revenue.json');
      return;
    }

    // Compute KPIs — scoped to isolated app or whole portfolio
    function computeMetrics(appId) {
      let source;
      if (appId && revenue[appId]) {
        source = { [appId]: revenue[appId] };
      } else {
        source = revenue;
      }
      const { totals: periodTotals, dayCount } = aggregateTotals(source, ['total', 'subscriptions', 'iap', 'returns', 'sales'], filterState);
      const iapOnly = Math.max(0, periodTotals.iap - periodTotals.subscriptions);

      // Ad spend for this scope
      let adSpendTotal = 0;
      if (adspend) {
        let adSource;
        if (appId) {
          adSource = adspend[appId] ? { [appId]: adspend[appId] } : {};
        } else {
          adSource = adspend;
        }
        const { totals: adTotals } = aggregateTotals(adSource, ['spend'], filterState);
        adSpendTotal = adTotals.spend;
      }
      const netRevenue = periodTotals.total - adSpendTotal;
      const revChange = computePeriodChange(source, 'total', filterState);
      const adSource = adspend ? (appId ? (adspend[appId] ? { [appId]: adspend[appId] } : {}) : adspend) : null;
      const adChange = adSource ? computePeriodChange(adSource, 'spend', filterState) : null;
      let netChange = revChange;
      if (revChange != null && adChange != null && periodTotals.total > 0) {
        const prevRev = periodTotals.total / (1 + revChange / 100);
        const prevAd = adSpendTotal / (1 + adChange / 100);
        const prevNet = prevRev - prevAd;
        netChange = prevNet !== 0 ? ((netRevenue - prevNet) / Math.abs(prevNet)) * 100 : (netRevenue > 0 ? 100 : 0);
      }

      return [
        { label: 'Total Revenue', field: 'total', value: periodTotals.total, perDay: periodTotals.total / dayCount, changePercent: revChange, isCurrency: true, description: 'Sum of subscriptions, IAP, and app sales minus returns' },
        { label: 'Net Revenue', field: 'netrevenue', value: netRevenue, perDay: netRevenue / dayCount, changePercent: netChange, isCurrency: true, description: 'Revenue minus ad spend' },
        { label: 'Ad Spend', field: 'adspend', value: adSpendTotal, perDay: adSpendTotal / dayCount, changePercent: adChange, isCurrency: true, description: 'Apple Search Ads spend in the selected period' },
        { label: 'Subscription Revenue', field: 'subscriptions', value: periodTotals.subscriptions, perDay: periodTotals.subscriptions / dayCount, changePercent: computePeriodChange(source, 'subscriptions', filterState), isCurrency: true, description: 'Revenue from auto-renewable subscriptions in the selected period' },
        { label: 'Returns', field: 'returns', value: periodTotals.returns, perDay: periodTotals.returns / dayCount, isCurrency: true, description: 'Refunds processed in the selected period' }
      ];
    }

    let activeField = 'total';
    const metrics = computeMetrics(getApp()?.id);

    // Main chart
    const chartSection = document.createElement('div');
    chartSection.className = 'chart-container';
    chartSection.id = 'revenueChartSection';
    chartSection.innerHTML = `
      <div class="chart-header-row">
        <div class="chart-title" id="revenueChartTitle">Total Revenue Over Time</div>
        <div class="chart-isolation-chip hidden" id="revenueIsolationChip"></div>
      </div>
      <div class="chart-wrapper"><canvas id="revenueMainChart"></canvas></div>
    `;

    function onIsolationChange() {
      updateIsolationChip();
      renderMainChart(activeField);
      kpiRow.updateValues(computeMetrics(getApp()?.id));
      container.querySelectorAll('.table-row-selected').forEach(el => el.classList.remove('table-row-selected'));
      if (getApp()) {
        container.querySelectorAll('.data-table tbody tr.table-row-clickable').forEach(tr => {
          const nameEl = tr.querySelector('.app-name');
          if (nameEl && nameEl.textContent === getApp().name) tr.classList.add('table-row-selected');
        });
      }
    }

    function updateIsolationChip() {
      const chip = document.getElementById('revenueIsolationChip');
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

    function renderMainChart(field, metric) {
      const titleEl = document.getElementById('revenueChartTitle');
      const metricInfo = metric || metrics.find(m => m.field === field);
      if (titleEl) titleEl.textContent = `${metricInfo ? metricInfo.label : field} Over Time`;

      TotoCharts.destroyChart('revenueMainChart');
      const ha = getApp();

      // Net revenue: revenue - adspend per day
      if (field === 'netrevenue') {
        if (ha) {
          // Single app: one line showing revenue - adspend
          const appRev = revenue[ha.id] || {};
          const appAd = adspend && adspend[ha.id] ? adspend[ha.id] : {};
          const dates = getFullDateRange(filterState);
          const bucketed = bucketDates(dates, filterState.granularity);
          const labels = bucketed.map(b => b.label);
          const values = bucketed.map(b => b.dates.reduce((sum, date) => {
            const rev = parseFloat(appRev[date]?.total) || 0;
            const ad = parseFloat(appAd[date]?.spend) || 0;
            return sum + rev - ad;
          }, 0));
          if (labels.length > 0) {
            const rawDates = filterState.granularity === 'daily' ? bucketed.map(b => b.dates[0]) : null;
            TotoCharts.createAreaChart('revenueMainChart', labels, [{ label: shortAppName(ha.name), data: values }], { isCurrency: true, stacked: false, rawDates });
          }
        } else {
          // All apps: per-app breakdown like total revenue does
          const selectedApps = getSelectedAppIds(revenue, filterState);
          const appTotals = {};
          const dates = getFullDateRange(filterState);
          selectedApps.forEach(pid => {
            let total = 0;
            dates.forEach(d => {
              const rev = parseFloat(revenue[pid]?.[d]?.total) || 0;
              const ad = adspend && adspend[pid] ? (parseFloat(adspend[pid]?.[d]?.spend) || 0) : 0;
              total += rev - ad;
            });
            appTotals[pid] = total;
          });
          const ranked = Object.entries(appTotals).sort((a, b) => b[1] - a[1]);
          const topApps = ranked.slice(0, 5).map(([id]) => id);
          const otherApps = ranked.slice(5).map(([id]) => id);
          const bucketed = bucketDates(dates, filterState.granularity);
          const labels = bucketed.map(b => b.label);
          const datasets = topApps.map(pid => {
            const appRev = revenue[pid] || {};
            const appAd = adspend && adspend[pid] ? adspend[pid] : {};
            const appInfo = apps[pid] || {};
            return {
              label: shortAppName(appInfo.name || `App ${pid}`),
              data: bucketed.map(b => b.dates.reduce((sum, date) => {
                return sum + (parseFloat(appRev[date]?.total) || 0) - (parseFloat(appAd[date]?.spend) || 0);
              }, 0))
            };
          });
          if (otherApps.length > 0) {
            const otherData = bucketed.map(b => b.dates.reduce((sum, date) => {
              let daySum = 0;
              otherApps.forEach(pid => {
                const rev = parseFloat(revenue[pid]?.[date]?.total) || 0;
                const ad = adspend && adspend[pid] ? (parseFloat(adspend[pid]?.[date]?.spend) || 0) : 0;
                daySum += rev - ad;
              });
              return sum + daySum;
            }, 0));
            if (otherData.some(v => v !== 0)) datasets.push({ label: 'Other', data: otherData });
          }
          if (labels.length > 0) {
            const rawDates = filterState.granularity === 'daily' ? bucketed.map(b => b.dates[0]) : null;
            TotoCharts.createAreaChart('revenueMainChart', labels, datasets, { isCurrency: true, rawDates });
          }
        }
        return;
      }

      // Ad spend chart
      if (field === 'adspend') {
        const adSource = ha ? (adspend && adspend[ha.id] ? { [ha.id]: adspend[ha.id] } : {}) : (adspend || {});
        if (ha) {
          const dates = getFullDateRange(filterState);
          const bucketed = bucketDates(dates, filterState.granularity);
          const labels = bucketed.map(b => b.label);
          const appData = adspend && adspend[ha.id] ? adspend[ha.id] : {};
          const values = bucketed.map(b => b.dates.reduce((sum, date) => sum + (parseFloat(appData[date]?.spend) || 0), 0));
          if (labels.length > 0) {
            const rawDates = filterState.granularity === 'daily' ? bucketed.map(b => b.dates[0]) : null;
            TotoCharts.createAreaChart('revenueMainChart', labels, [{ label: shortAppName(ha.name), data: values }], { isCurrency: true, stacked: false, rawDates });
          }
        } else if (adspend) {
          const chartData = buildTimeSeriesData(adspend, 'spend', apps, filterState, { topN: 5 });
          if (chartData.labels.length > 0) {
            TotoCharts.createAreaChart('revenueMainChart', chartData.labels, chartData.datasets, { isCurrency: true, rawDates: chartData.rawDates });
          }
        }
        return;
      }

      if (ha && revenue[ha.id]) {
        const appData = revenue[ha.id];
        const dates = getFullDateRange(filterState);
        const bucketed = bucketDates(dates, filterState.granularity);
        const labels = bucketed.map(b => b.label);
        const values = bucketed.map(b => b.dates.reduce((sum, date) => sum + (parseFloat(appData[date]?.[field]) || 0), 0));
        if (labels.length > 0) {
          const rawDates = filterState.granularity === 'daily' ? bucketed.map(b => b.dates[0]) : null;
          TotoCharts.createAreaChart('revenueMainChart', labels, [{ label: shortAppName(ha.name), data: values }], { isCurrency: true, stacked: false, rawDates });
        }
        return;
      }

      const chartData = buildTimeSeriesData(revenue, field, apps, filterState, { topN: 5, showComparison: true });
      if (chartData.labels.length > 0) {
        TotoCharts.createAreaChart('revenueMainChart', chartData.labels, chartData.datasets, {
          isCurrency: true, rawDates: chartData.rawDates, previousPeriodData: chartData.previousPeriodData
        });
      }
    }

    const kpiRow = TotoComponents.renderKPICards(container, metrics, {
      activeField,
      onSelect: (field, metric) => {
        activeField = field;
        renderMainChart(field, metric);
      }
    });

    container.appendChild(chartSection);
    updateIsolationChip();
    renderMainChart(activeField);

    // Revenue breakdown chart
    const breakdownSection = document.createElement('div');
    breakdownSection.className = 'chart-container';
    breakdownSection.innerHTML = `
      <div class="chart-title">Revenue by Source</div>
      <div class="chart-wrapper"><canvas id="revenueBreakdownChart"></canvas></div>
    `;
    container.appendChild(breakdownSection);
    renderBreakdownChart(revenue, filterState);

    // Revenue table by app
    const appRows = getAppRevenueTotals(revenue, apps, filterState);
    if (appRows.length > 0) {
      const maxRevenue = Math.max(...appRows.map(r => r.total), 1);
      const columns = [
        { key: 'name', label: 'App', render: (val, row) => {
            const icon = row.icon ? `<img class="app-icon" src="${TotoComponents.escapeHtml(row.icon)}" alt="" onerror="this.style.display='none'">` : '<div class="app-icon"></div>';
            return `<div class="app-cell">${icon}<div class="app-name">${TotoComponents.escapeHtml(shortAppName(row.name))}</div></div>`;
          }
        },
        { key: 'total', label: 'Total Revenue', align: 'right', barMax: maxRevenue, format: (val) => TotoComponents.formatNumber(val, { currency: true }) },
        { key: 'subscriptions', label: 'Subscriptions', align: 'right', format: (val) => TotoComponents.formatNumber(val, { currency: true }) },
        { key: 'iap', label: 'IAP', align: 'right', format: (val) => TotoComponents.formatNumber(val, { currency: true }) },
        { key: 'returns', label: 'Returns', align: 'right', format: (val) => {
            const num = parseFloat(val) || 0;
            const str = TotoComponents.formatNumber(Math.abs(num), { currency: true });
            return num < 0 ? `<span class="text-red">-${str}</span>` : str;
          }
        }
      ];

      TotoComponents.renderTable(container, columns, appRows, {
        title: 'Revenue by App',
        defaultSort: 'total',
        defaultSortDir: 'desc',
        selectedRowId: getApp() ? getApp().id : null,
        onRowClick: (row) => {
          if (getApp() && getApp().id === row.id) {
            setApp(null);
          } else {
            setApp({ id: row.id, name: row.name });
          }
          const chartEl = document.getElementById('revenueChartSection');
          if (chartEl) chartEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
          onIsolationChange();
        }
      });
    }
  }

  function renderBreakdownChart(revenue, filterState) {
    const dateAgg = {};
    const selectedApps = getSelectedAppIds(revenue, filterState);
    selectedApps.forEach(productId => {
      const appData = revenue[productId];
      if (!appData) return;
      const dates = getFilteredDates(appData, filterState);
      dates.forEach(date => {
        const d = appData[date];
        if (!d) return;
        if (!dateAgg[date]) dateAgg[date] = { subscriptions: 0, iap_only: 0, sales: 0, returns: 0 };
        const subs = parseFloat(d.subscriptions) || 0;
        const iap = parseFloat(d.iap) || 0;
        dateAgg[date].subscriptions += subs;
        dateAgg[date].iap_only += Math.max(0, iap - subs);
        dateAgg[date].sales += parseFloat(d.sales) || 0;
        dateAgg[date].returns += parseFloat(d.returns) || 0;
      });
    });

    const sortedDates = getFullDateRange(filterState);
    const bucketedDates = bucketDates(sortedDates, filterState.granularity);
    const labels = bucketedDates.map(b => b.label);

    function sumBucket(bucket, field) {
      return bucket.dates.reduce((sum, d) => sum + (dateAgg[d] ? dateAgg[d][field] : 0), 0);
    }

    const datasets = [
      { label: 'Subscriptions', data: bucketedDates.map(b => sumBucket(b, 'subscriptions')), borderColor: '#4A90D9', backgroundColor: 'rgba(74, 144, 217, 0.15)' },
      { label: 'In-App Purchases', data: bucketedDates.map(b => sumBucket(b, 'iap_only')), borderColor: '#E67E22', backgroundColor: 'rgba(230, 126, 34, 0.15)' },
      { label: 'App Sales', data: bucketedDates.map(b => sumBucket(b, 'sales')), borderColor: '#27AE60', backgroundColor: 'rgba(39, 174, 96, 0.15)' },
      { label: 'Returns', data: bucketedDates.map(b => -sumBucket(b, 'returns')), borderColor: '#E74C3C', backgroundColor: 'rgba(231, 76, 60, 0.15)' }
    ];

    if (labels.length > 0) {
      const rawDates = filterState.granularity === 'daily' ? bucketedDates.map(b => b.dates[0]) : null;
      TotoCharts.createAreaChart('revenueBreakdownChart', labels, datasets, { isCurrency: true, stacked: true, rawDates });
    }
  }

  function getAppRevenueTotals(revenue, apps, filterState) {
    const appMap = apps || {};
    const selectedApps = getSelectedAppIds(revenue, filterState);
    const rows = [];
    selectedApps.forEach(productId => {
      const appData = revenue[productId];
      if (!appData) return;
      const appInfo = appMap[productId] || {};
      const totals = { total: 0, subscriptions: 0, iap: 0, sales: 0, returns: 0 };
      const dates = getFilteredDates(appData, filterState);
      dates.forEach(date => {
        const d = appData[date];
        if (!d) return;
        totals.total += parseFloat(d.total) || 0;
        const subs = parseFloat(d.subscriptions) || 0;
        const iap = parseFloat(d.iap) || 0;
        totals.subscriptions += subs;
        totals.iap += Math.max(0, iap - subs);
        totals.sales += parseFloat(d.sales) || 0;
        totals.returns += parseFloat(d.returns) || 0;
      });
      rows.push({ id: productId, name: appInfo.name || `App ${productId}`, icon: appInfo.icon || '', ...totals });
    });
    return rows;
  }

  return { render };
})();
