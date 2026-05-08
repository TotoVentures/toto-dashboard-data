/**
 * revenue.js — Revenue & Downloads page
 */

const RevenuePage = (() => {

  const SALES_FIELDS = new Set(['downloads', 're_downloads', 'updates', 'uninstalls']);

  function render(container, data, filterState) {
    const { revenue, sales, apps, adspend } = data;
    container.innerHTML = '';

    const getApp = () => TotoApp.state.highlightedApp;
    const setApp = (val) => { TotoApp.state.highlightedApp = val; TotoApp.updateHashFromFilters(); };

    const title = document.createElement('h1');
    title.className = 'page-title';
    title.textContent = 'Revenue & Downloads';
    container.appendChild(title);

    const subtitle = document.createElement('p');
    subtitle.className = 'page-subtitle';
    subtitle.textContent = 'Subscription revenue, IAP, app sales, and download activity';
    container.appendChild(subtitle);

    if (!revenue || Object.keys(revenue).length === 0) {
      TotoComponents.renderEmptyState(container, 'No revenue data', 'Run the sync script to generate data/revenue.json');
      return;
    }

    // Compute KPIs — scoped to isolated app or whole portfolio
    function computeMetrics(appId) {
      let revSource;
      if (appId && revenue[appId]) {
        revSource = { [appId]: revenue[appId] };
      } else {
        revSource = revenue;
      }
      const { totals: periodTotals, dayCount } = aggregateTotals(revSource, ['total', 'subscriptions', 'iap', 'returns', 'sales'], filterState);

      let salesSource = null;
      let salesTotals = { downloads: 0, re_downloads: 0, updates: 0, uninstalls: 0 };
      let salesDayCount = dayCount;
      if (sales) {
        if (appId && sales[appId]) {
          salesSource = { [appId]: sales[appId] };
        } else if (!appId) {
          salesSource = sales;
        }
        if (salesSource) {
          const agg = aggregateTotals(salesSource, ['downloads', 're_downloads', 'updates', 'uninstalls'], filterState);
          salesTotals = agg.totals;
          salesDayCount = agg.dayCount || dayCount;
        }
      }

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
      const revChange = computePeriodChange(revSource, 'total', filterState);
      const adSource = adspend ? (appId ? (adspend[appId] ? { [appId]: adspend[appId] } : {}) : adspend) : null;
      const adChange = adSource ? computePeriodChange(adSource, 'spend', filterState) : null;
      let netChange = revChange;
      if (revChange != null && adChange != null && periodTotals.total > 0) {
        const prevRev = periodTotals.total / (1 + revChange / 100);
        const prevAd = adSpendTotal / (1 + adChange / 100);
        const prevNet = prevRev - prevAd;
        netChange = prevNet !== 0 ? ((netRevenue - prevNet) / Math.abs(prevNet)) * 100 : (netRevenue > 0 ? 100 : 0);
      }

      const list = [
        { label: 'Total Revenue', field: 'total', value: periodTotals.total, perDay: periodTotals.total / dayCount, changePercent: revChange, isCurrency: true, description: 'Sum of subscriptions, IAP, and app sales minus returns' },
        { label: 'Net Revenue', field: 'netrevenue', value: netRevenue, perDay: netRevenue / dayCount, changePercent: netChange, isCurrency: true, description: 'Revenue minus ad spend' },
        { label: 'Ad Spend', field: 'adspend', value: adSpendTotal, perDay: adSpendTotal / dayCount, changePercent: adChange, isCurrency: true, description: 'Apple Search Ads spend in the selected period' },
        { label: 'Subscription Revenue', field: 'subscriptions', value: periodTotals.subscriptions, perDay: periodTotals.subscriptions / dayCount, changePercent: computePeriodChange(revSource, 'subscriptions', filterState), isCurrency: true, description: 'Revenue from auto-renewable subscriptions in the selected period' },
        { label: 'Returns', field: 'returns', value: periodTotals.returns, perDay: periodTotals.returns / dayCount, isCurrency: true, description: 'Refunds processed in the selected period' }
      ];

      if (sales) {
        list.push(
          { label: 'Downloads', field: 'downloads', value: salesTotals.downloads, perDay: salesTotals.downloads / salesDayCount, changePercent: salesSource ? computePeriodChange(salesSource, 'downloads', filterState) : null, isCurrency: false, description: 'First-time app downloads in the selected period' },
          { label: 'Re-downloads', field: 're_downloads', value: salesTotals.re_downloads, perDay: salesTotals.re_downloads / salesDayCount, changePercent: salesSource ? computePeriodChange(salesSource, 're_downloads', filterState) : null, isCurrency: false, description: 'Users who previously downloaded the app and downloaded it again' },
          { label: 'Updates', field: 'updates', value: salesTotals.updates, perDay: salesTotals.updates / salesDayCount, changePercent: salesSource ? computePeriodChange(salesSource, 'updates', filterState) : null, isCurrency: false, description: 'App version updates installed by existing users' },
          { label: 'Uninstalls', field: 'uninstalls', value: salesTotals.uninstalls, perDay: salesTotals.uninstalls / salesDayCount, changePercent: salesSource ? computePeriodChange(salesSource, 'uninstalls', filterState) : null, isCurrency: false, description: 'Number of app deletions in the selected period' }
        );
      }
      return list;
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
        chip.innerHTML = `Showing: ${TotoComponents.escapeHtml(getApp().name)} <button class="chip-clear">✕</button>`;
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

      // Sales-data fields (downloads, re_downloads, updates, uninstalls)
      if (SALES_FIELDS.has(field)) {
        if (!sales) return;
        if (ha && sales[ha.id]) {
          const appData = sales[ha.id];
          const dates = getFullDateRange(filterState);
          const bucketed = bucketDates(dates, filterState.granularity);
          const labels = bucketed.map(b => b.label);
          const values = bucketed.map(b => b.dates.reduce((sum, date) => sum + (parseFloat(appData[date]?.[field]) || 0), 0));
          if (labels.length > 0) {
            const rawDates = filterState.granularity === 'daily' ? bucketed.map(b => b.dates[0]) : null;
            TotoCharts.createAreaChart('revenueMainChart', labels, [{ label: shortAppName(ha.name), data: values }], { isCurrency: false, stacked: false, rawDates });
          }
        } else {
          const chartData = buildTimeSeriesData(sales, field, apps, filterState, { topN: 5 });
          if (chartData.labels.length > 0) {
            TotoCharts.createAreaChart('revenueMainChart', chartData.labels, chartData.datasets, { isCurrency: false, rawDates: chartData.rawDates });
          }
        }
        return;
      }

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

      // Total / subscriptions / iap / returns / sales: per-app stacked
      // Clamp daily app values at 0 for `total` so refund-heavy days don't dip below zero
      const clampNegative = field === 'total';
      if (ha && revenue[ha.id]) {
        const appData = revenue[ha.id];
        const dates = getFullDateRange(filterState);
        const bucketed = bucketDates(dates, filterState.granularity);
        const labels = bucketed.map(b => b.label);
        const rawValues = bucketed.map(b => b.dates.reduce((sum, date) => sum + (parseFloat(appData[date]?.[field]) || 0), 0));
        const values = clampNegative ? rawValues.map(v => v < 0 ? 0 : v) : rawValues;
        if (labels.length > 0) {
          const rawDates = filterState.granularity === 'daily' ? bucketed.map(b => b.dates[0]) : null;
          TotoCharts.createAreaChart('revenueMainChart', labels, [{ label: shortAppName(ha.name), data: values, rawData: rawValues }], { isCurrency: true, stacked: false, rawDates });
        }
        return;
      }

      const chartData = buildTimeSeriesData(revenue, field, apps, filterState, { topN: 5, showComparison: true, clampNegative });
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

    // Combined table by app — revenue + downloads
    const appRows = getAppCombinedTotals(revenue, sales, apps, filterState);
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
        },
        { key: 'downloads', label: 'Downloads', align: 'right', format: (val) => TotoComponents.formatNumber(val) },
        { key: 're_downloads', label: 'Re-DLs', align: 'right', format: (val) => TotoComponents.formatNumber(val) }
      ];

      TotoComponents.renderTable(container, columns, appRows, {
        title: 'Revenue & Downloads by App',
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

  function getAppCombinedTotals(revenue, sales, apps, filterState) {
    const appMap = apps || {};
    const ids = new Set();
    Object.keys(revenue || {}).forEach(id => ids.add(id));
    if (sales) Object.keys(sales).forEach(id => ids.add(id));
    const allIds = [...ids];
    const selected = filterState.selectedApps && filterState.selectedApps.length > 0
      ? allIds.filter(id => filterState.selectedApps.includes(id))
      : allIds;

    const rows = [];
    selected.forEach(productId => {
      const appData = revenue ? revenue[productId] : null;
      const salesData = sales ? sales[productId] : null;
      if (!appData && !salesData) return;
      const appInfo = appMap[productId] || {};
      const totals = { total: 0, subscriptions: 0, iap: 0, sales: 0, returns: 0, downloads: 0, re_downloads: 0 };
      if (appData) {
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
      }
      if (salesData) {
        const dates = getFilteredDates(salesData, filterState);
        dates.forEach(date => {
          const d = salesData[date];
          if (!d) return;
          totals.downloads += parseFloat(d.downloads) || 0;
          totals.re_downloads += parseFloat(d.re_downloads) || 0;
        });
      }
      rows.push({ id: productId, name: appInfo.name || `App ${productId}`, icon: appInfo.icon || '', ...totals });
    });
    return rows;
  }

  return { render };
})();
