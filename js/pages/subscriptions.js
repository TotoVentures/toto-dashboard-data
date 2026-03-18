/**
 * subscriptions.js — Subscriptions page
 */

const SubscriptionsPage = (() => {

  function render(container, data, filterState) {
    const { subscriptions, apps } = data;
    container.innerHTML = '';

    const getApp = () => TotoApp.state.highlightedApp;
    const setApp = (val) => { TotoApp.state.highlightedApp = val; TotoApp.updateHashFromFilters(); };

    const title = document.createElement('h1');
    title.className = 'page-title';
    title.textContent = 'Subscriptions';
    container.appendChild(title);

    const subtitle = document.createElement('p');
    subtitle.className = 'page-subtitle';
    subtitle.textContent = 'Trials, conversions, churn, and MRR tracking';
    container.appendChild(subtitle);

    if (!subscriptions || Object.keys(subscriptions).length === 0) {
      TotoComponents.renderEmptyState(container, 'No subscription data', 'Run the sync script to generate data/subscriptions.json');
      return;
    }

    function computeMetrics(appId) {
      let source;
      if (appId && subscriptions[appId]) {
        source = { [appId]: subscriptions[appId] };
      } else {
        source = subscriptions;
      }
      const fields = ['active_subscriptions', 'new_subscriptions', 'new_trials', 'mrr', 'churn', 'renewals', 'activations'];
      const { totals: periodTotals, dayCount, latestValues } = aggregateSubscriptionTotals(source, fields, filterState);

      return [
        { label: 'Active Subscriptions', field: 'active_subscriptions', value: latestValues.active_subscriptions, isCurrency: false, description: 'Total currently active paid subscriptions' },
        { label: 'MRR', field: 'mrr', value: latestValues.mrr, isCurrency: true, description: 'Monthly Recurring Revenue — latest snapshot' },
        { label: 'New Trials', field: 'new_trials', value: periodTotals.new_trials, perDay: periodTotals.new_trials / dayCount, changePercent: computePeriodChange(source, 'new_trials', filterState), isCurrency: false, description: 'Free trial starts in the selected period' },
        { label: 'New Subscriptions', field: 'new_subscriptions', value: periodTotals.new_subscriptions, perDay: periodTotals.new_subscriptions / dayCount, changePercent: computePeriodChange(source, 'new_subscriptions', filterState), isCurrency: false, description: 'New paid subscription activations' },
        { label: 'Renewals', field: 'renewals', value: periodTotals.renewals, perDay: periodTotals.renewals / dayCount, changePercent: computePeriodChange(source, 'renewals', filterState), isCurrency: false, description: 'Subscription renewals processed in the selected period' },
        { label: 'Cancellations', field: 'cancellations', value: periodTotals.churn, perDay: periodTotals.churn / dayCount, changePercent: computePeriodChange(source, 'churn', filterState), isCurrency: false, description: 'Subscriptions cancelled or expired in the selected period' },
        { label: 'Activations', field: 'activations', value: periodTotals.activations, perDay: periodTotals.activations / dayCount, changePercent: computePeriodChange(source, 'activations', filterState), isCurrency: false, description: 'Trial-to-paid conversions in the selected period' }
      ];
    }

    let activeField = 'new_trials';
    const metrics = computeMetrics(getApp()?.id);

    // Chart section
    const chartSection = document.createElement('div');
    chartSection.className = 'chart-container';
    chartSection.id = 'subsChartSection';
    chartSection.innerHTML = `
      <div class="chart-header-row">
        <div class="chart-title" id="subsChartTitle">New Trials Over Time</div>
        <div class="chart-isolation-chip hidden" id="subsIsolationChip"></div>
      </div>
      <div class="chart-wrapper"><canvas id="subsMainChart"></canvas></div>
    `;

    function onIsolationChange() {
      updateIsolationChip();
      renderChart(activeField);
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
      const chip = document.getElementById('subsIsolationChip');
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

    function renderChart(field, metric) {
      const titleEl = document.getElementById('subsChartTitle');
      const metricInfo = metric || metrics.find(m => m.field === field);
      if (titleEl) titleEl.textContent = `${metricInfo ? metricInfo.label : field} Over Time`;

      TotoCharts.destroyChart('subsMainChart');
      const isCurrency = metricInfo ? metricInfo.isCurrency : false;
      const ha = getApp();

      if (ha && subscriptions[ha.id]) {
        const appData = subscriptions[ha.id];
        const dates = getFullDateRange(filterState);
        const bucketed = bucketDates(dates, filterState.granularity);
        const labels = bucketed.map(b => b.label);
        const values = bucketed.map(b => b.dates.reduce((sum, date) => sum + (parseFloat(appData[date]?.[field]) || 0), 0));
        if (labels.length > 0) {
          const rawDates = filterState.granularity === 'daily' ? bucketed.map(b => b.dates[0]) : null;
          TotoCharts.createAreaChart('subsMainChart', labels, [{ label: shortAppName(ha.name), data: values }], { isCurrency, stacked: false, rawDates });
        }
        return;
      }

      const chartData = buildTimeSeriesData(subscriptions, field, apps, filterState, { topN: 5 });
      if (chartData.labels.length > 0) {
        TotoCharts.createAreaChart('subsMainChart', chartData.labels, chartData.datasets, { isCurrency, rawDates: chartData.rawDates });
      }
    }

    const kpiRow = TotoComponents.renderKPICards(container, metrics, {
      activeField,
      onSelect: (field, metric) => {
        activeField = field;
        renderChart(field, metric);
      }
    });

    container.appendChild(chartSection);
    updateIsolationChip();
    renderChart(activeField);

    // MRR trend chart
    const mrrSection = document.createElement('div');
    mrrSection.className = 'chart-container';
    mrrSection.innerHTML = `
      <div class="chart-title">MRR Trend</div>
      <div class="chart-wrapper"><canvas id="subsMRRChart"></canvas></div>
    `;
    container.appendChild(mrrSection);
    renderMRRChart(subscriptions, filterState);

    // Subscription table by app
    const appRows = getAppSubscriptionTotals(subscriptions, apps, filterState);
    if (appRows.length > 0) {
      const maxMRR = Math.max(...appRows.map(r => r.mrr), 1);
      const columns = [
        { key: 'name', label: 'App', render: (val, row) => {
            const icon = row.icon ? `<img class="app-icon" src="${TotoComponents.escapeHtml(row.icon)}" alt="" onerror="this.style.display='none'">` : '<div class="app-icon"></div>';
            return `<div class="app-cell">${icon}<div class="app-name">${TotoComponents.escapeHtml(shortAppName(row.name))}</div></div>`;
          }
        },
        { key: 'active_subscriptions', label: 'Active', align: 'right', format: (val) => TotoComponents.formatNumber(val) },
        { key: 'mrr', label: 'MRR', align: 'right', barMax: maxMRR, format: (val) => TotoComponents.formatNumber(val, { currency: true }) },
        { key: 'new_trials', label: 'New Trials', align: 'right', format: (val) => TotoComponents.formatNumber(val) },
        { key: 'new_subscriptions', label: 'New Subs', align: 'right', format: (val) => TotoComponents.formatNumber(val) },
        { key: 'renewals', label: 'Renewals', align: 'right', format: (val) => TotoComponents.formatNumber(val) },
        { key: 'churn', label: 'Churn', align: 'right', format: (val) => TotoComponents.formatNumber(val) }
      ];

      TotoComponents.renderTable(container, columns, appRows, {
        title: 'Subscriptions by App',
        defaultSort: 'mrr',
        defaultSortDir: 'desc',
        selectedRowId: getApp() ? getApp().id : null,
        onRowClick: (row) => {
          if (getApp() && getApp().id === row.id) {
            setApp(null);
          } else {
            setApp({ id: row.id, name: row.name });
          }
          const chartEl = document.getElementById('subsChartSection');
          if (chartEl) chartEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
          onIsolationChange();
        }
      });
    }
  }

  function renderMRRChart(subscriptions, filterState) {
    const dateAgg = {};
    const selectedApps = getSelectedAppIds(subscriptions, filterState);
    selectedApps.forEach(productId => {
      const appData = subscriptions[productId];
      if (!appData) return;
      const dates = getFilteredDates(appData, filterState);
      dates.forEach(date => {
        const d = appData[date];
        if (!d) return;
        const val = parseFloat(d.mrr) || 0;
        if (!dateAgg[date]) dateAgg[date] = 0;
        dateAgg[date] += val;
      });
    });
    Object.keys(dateAgg).forEach(date => { if (dateAgg[date] === 0) delete dateAgg[date]; });

    const sortedDates = Object.keys(dateAgg).sort();
    const bucketedDates = bucketDates(sortedDates, filterState.granularity);
    const labels = bucketedDates.map(b => b.label);
    const values = bucketedDates.map(b => { const ld = b.dates[b.dates.length - 1]; return dateAgg[ld] || 0; });

    if (labels.length > 0) {
      const rawDates = filterState.granularity === 'daily' ? bucketedDates.map(b => b.dates[0]) : null;
      TotoCharts.createAreaChart('subsMRRChart', labels, [{ label: 'MRR', data: values, borderColor: '#4A90D9', backgroundColor: 'rgba(74, 144, 217, 0.15)' }], { isCurrency: true, stacked: false, rawDates });
    }
  }

  function aggregateSubscriptionTotals(subscriptions, fields, filterState) {
    const selectedApps = getSelectedAppIds(subscriptions, filterState);
    const totals = {};
    const latestValues = {};
    fields.forEach(f => { totals[f] = 0; latestValues[f] = 0; });
    let dayCount = 1;
    let allDates = new Set();
    const summableFields = ['new_subscriptions', 'new_trials', 'renewals', 'churn', 'activations'];
    const pointFields = ['active_subscriptions', 'mrr', 'trial_conversion_rate'];

    selectedApps.forEach(productId => {
      const appData = subscriptions[productId];
      if (!appData) return;
      const dates = getFilteredDates(appData, filterState);
      dates.forEach(d => allDates.add(d));
      dates.forEach(date => {
        const d = appData[date];
        if (!d) return;
        summableFields.forEach(f => { if (d[f] !== undefined) totals[f] += parseFloat(d[f]) || 0; });
      });
      const sortedDates = [...dates].sort();
      for (let i = sortedDates.length - 1; i >= 0; i--) {
        const latest = appData[sortedDates[i]];
        if (latest && (parseFloat(latest.active_subscriptions) > 0 || parseFloat(latest.mrr) > 0)) {
          pointFields.forEach(f => { if (latest[f] !== undefined) latestValues[f] += parseFloat(latest[f]) || 0; });
          break;
        }
      }
    });

    const sortedAll = [...allDates].sort();
    if (sortedAll.length >= 2) {
      dayCount = getDayCount(sortedAll[0], sortedAll[sortedAll.length - 1]) || 1;
    }
    return { totals, dayCount, latestValues };
  }

  function getAppSubscriptionTotals(subscriptions, apps, filterState) {
    const appMap = apps || {};
    const selectedApps = getSelectedAppIds(subscriptions, filterState);
    const rows = [];
    selectedApps.forEach(productId => {
      const appData = subscriptions[productId];
      if (!appData) return;
      const appInfo = appMap[productId] || {};
      const dates = getFilteredDates(appData, filterState);
      const summable = { new_subscriptions: 0, new_trials: 0, renewals: 0, churn: 0, activations: 0 };
      let active_subscriptions = 0, mrr = 0;
      dates.forEach(date => {
        const d = appData[date];
        if (!d) return;
        Object.keys(summable).forEach(f => { summable[f] += parseFloat(d[f]) || 0; });
      });
      const sortedDates = [...dates].sort();
      for (let i = sortedDates.length - 1; i >= 0; i--) {
        const latest = appData[sortedDates[i]];
        if (latest && (parseFloat(latest.active_subscriptions) > 0 || parseFloat(latest.mrr) > 0)) {
          active_subscriptions = parseFloat(latest.active_subscriptions) || 0;
          mrr = parseFloat(latest.mrr) || 0;
          break;
        }
      }
      rows.push({ id: productId, name: appInfo.name || `App ${productId}`, icon: appInfo.icon || '', active_subscriptions, mrr, ...summable });
    });
    return rows;
  }

  return { render };
})();
