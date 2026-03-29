/**
 * sub-insights.js — Subscription Insights page
 * Plan comparison, trial-to-paid trends, voluntary churn analysis.
 */

const SubInsightsPage = (() => {

  function render(container, data, filterState) {
    const { subStates, apps } = data;
    container.innerHTML = '';

    const getApp = () => TotoApp.state.highlightedApp;
    const setApp = (val) => { TotoApp.state.highlightedApp = val; TotoApp.updateHashFromFilters(); };

    const title = document.createElement('h1');
    title.className = 'page-title';
    title.textContent = 'Subscription Insights';
    container.appendChild(title);

    const subtitle = document.createElement('p');
    subtitle.className = 'page-subtitle';
    subtitle.textContent = 'Plan performance, trial-to-paid rates, and churn analysis';
    container.appendChild(subtitle);

    if (!subStates || Object.keys(subStates).length === 0) {
      TotoComponents.renderEmptyState(container, 'No subscription state data', 'Run sync to pull analytics API data into sub_states.json');
      return;
    }

    function computeMetrics(appId) {
      let source;
      if (appId && subStates[appId]) {
        source = { [appId]: subStates[appId] };
      } else {
        source = subStates;
      }

      // Get latest snapshot values (not summed)
      let activePaid = 0, activeTrials = 0, voluntaryChurn = 0;
      let latestT2P = 0;

      const selectedApps = getSelectedAppIds(source, filterState);
      selectedApps.forEach(aid => {
        const appData = source[aid];
        if (!appData) return;
        const dates = getFilteredDates(appData, filterState);
        if (dates.length === 0) return;
        const latest = dates[dates.length - 1];
        const d = appData[latest];
        if (!d) return;
        activePaid += d.active_paid || 0;
        activeTrials += d.active_trial || 0;
        voluntaryChurn += d.voluntary_churn || 0;
      });

      // Sum trial_starts and paid_conversions over period
      const fields = ['trial_starts', 'paid_conversions'];
      const { totals: t, dayCount } = aggregateTotals(source, fields, filterState);

      latestT2P = t.trial_starts > 0 ? (t.paid_conversions / t.trial_starts * 100) : 0;

      return [
        { label: 'Active Paid', field: 'active_paid', value: activePaid, perDay: null, changePercent: null, isCurrency: false, description: 'Currently paying subscribers (latest snapshot)' },
        { label: 'Active Trials', field: 'active_trial', value: activeTrials, perDay: null, changePercent: null, isCurrency: false, description: 'Users currently on free trial' },
        { label: 'Trial-to-Paid', field: 'trial_to_paid_rate', value: latestT2P, perDay: null, changePercent: null, isCurrency: false, description: `${t.paid_conversions} conversions from ${t.trial_starts} trials`, format: (v) => `${v.toFixed(1)}%` },
        { label: 'Voluntary Churn', field: 'voluntary_churn', value: voluntaryChurn, perDay: null, changePercent: null, isCurrency: false, description: 'Users who actively turned off auto-renew (cumulative)' },
      ];
    }

    let activeField = 'active_paid';
    const metrics = computeMetrics(getApp()?.id);

    // Chart section
    const chartSection = document.createElement('div');
    chartSection.className = 'chart-container';
    chartSection.id = 'subInsightsChartSection';
    chartSection.innerHTML = `
      <div class="chart-header-row">
        <div class="chart-title" id="subInsightsChartTitle">Active Paid Over Time</div>
        <div class="chart-isolation-chip hidden" id="subInsightsIsolationChip"></div>
      </div>
      <div class="chart-wrapper"><canvas id="subInsightsMainChart"></canvas></div>
    `;

    function onIsolationChange() {
      updateIsolationChip();
      renderChart(activeField);
      kpiRow.updateValues(computeMetrics(getApp()?.id));
    }

    function updateIsolationChip() {
      const chip = document.getElementById('subInsightsIsolationChip');
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

    function renderChart(field) {
      const titleEl = document.getElementById('subInsightsChartTitle');
      const metricInfo = metrics.find(m => m.field === field);
      if (titleEl) titleEl.textContent = `${metricInfo ? metricInfo.label : field} Over Time`;

      TotoCharts.destroyChart('subInsightsMainChart');
      const ha = getApp();

      if (ha && subStates[ha.id]) {
        const appData = subStates[ha.id];
        const dates = getFullDateRange(filterState);
        const bucketed = bucketDates(dates, filterState.granularity);
        const labels = bucketed.map(b => b.label);
        const rawDates = filterState.granularity === 'daily' ? bucketed.map(b => b.dates[0]) : null;

        let values;
        if (field === 'trial_to_paid_rate') {
          values = bucketed.map(b => {
            let trials = 0, paid = 0;
            b.dates.forEach(d => {
              trials += parseFloat(appData[d]?.trial_starts) || 0;
              paid += parseFloat(appData[d]?.paid_conversions) || 0;
            });
            return trials > 0 ? (paid / trials * 100) : 0;
          });
        } else {
          values = bucketed.map(b => {
            // For snapshot fields, take the last day's value in the bucket
            for (let i = b.dates.length - 1; i >= 0; i--) {
              const v = parseFloat(appData[b.dates[i]]?.[field]);
              if (v > 0) return v;
            }
            return 0;
          });
        }

        if (labels.length > 0) {
          TotoCharts.createAreaChart('subInsightsMainChart', labels, [{ label: shortAppName(ha.name), data: values }], { isCurrency: false, stacked: false, rawDates });
        }
        return;
      }

      // Portfolio view: show top 5 apps
      const chartData = buildTimeSeriesData(subStates, field, apps, filterState, { topN: 5 });
      if (chartData.labels.length > 0) {
        TotoCharts.createAreaChart('subInsightsMainChart', chartData.labels, chartData.datasets, { isCurrency: false, rawDates: chartData.rawDates });
      }
    }

    const kpiRow = TotoComponents.renderKPICards(container, metrics, {
      activeField,
      onSelect: (field) => {
        activeField = field;
        if (activeTab !== 'trends') {
          activeTab = 'trends';
          container.querySelectorAll('.tab').forEach(el => el.classList.toggle('active', el.textContent === 'Trends'));
          renderTabContent();
        } else {
          renderChart(field);
        }
      }
    });

    // Tabs
    let activeTab = 'trends';
    const tabContent = document.createElement('div');

    TotoComponents.renderTabs(container, [
      { key: 'trends', label: 'Trends' },
      { key: 'plans', label: 'Plan Comparison' },
      { key: 'by-app', label: 'By App' }
    ], activeTab, (key) => {
      activeTab = key;
      renderTabContent();
    });

    container.appendChild(tabContent);

    function renderTabContent() {
      TotoCharts.destroyChart('subInsightsMainChart');
      tabContent.innerHTML = '';
      if (activeTab === 'trends') {
        renderTrends();
      } else if (activeTab === 'plans') {
        renderPlanComparison();
      } else {
        renderByApp();
      }
    }

    function renderTrends() {
      tabContent.appendChild(chartSection);
      updateIsolationChip();
      renderChart(activeField);
    }

    function renderPlanComparison() {
      // Aggregate plan data across selected apps
      const selectedApps = getSelectedAppIds(subStates, filterState);
      const planTotals = {};

      selectedApps.forEach(appId => {
        const ha = getApp();
        if (ha && ha.id !== appId) return;

        const appData = subStates[appId];
        if (!appData) return;
        const dates = getFilteredDates(appData, filterState);
        if (dates.length === 0) return;

        // Use the latest date's by_plan snapshot
        const latest = dates[dates.length - 1];
        const byPlan = appData[latest]?.by_plan;
        if (!byPlan) return;

        Object.entries(byPlan).forEach(([planName, planData]) => {
          if (!planTotals[planName]) planTotals[planName] = { active_paid: 0, active_trial: 0, churn: 0 };
          planTotals[planName].active_paid += planData.active_paid || 0;
          planTotals[planName].active_trial += planData.active_trial || 0;
          planTotals[planName].churn += planData.churn || 0;
        });
      });

      const planRows = Object.entries(planTotals).map(([name, data]) => {
        const total = data.active_paid + data.active_trial + data.churn;
        const paidShare = total > 0 ? (data.active_paid / total * 100) : 0;
        return {
          id: name,
          name,
          active_paid: data.active_paid,
          active_trial: data.active_trial,
          churn: data.churn,
          total,
          paid_share: paidShare,
        };
      });

      if (planRows.length === 0) {
        TotoComponents.renderEmptyState(tabContent, 'No plan data', 'Plan breakdown requires subscription state data');
        return;
      }

      TotoComponents.renderTable(tabContent, [
        { key: 'name', label: 'Plan', render: (val) => `<div class="app-name">${TotoComponents.escapeHtml(val)}</div>` },
        { key: 'active_paid', label: 'Paid', align: 'right', format: (val) => TotoComponents.formatNumber(val) },
        { key: 'active_trial', label: 'Trial', align: 'right', format: (val) => TotoComponents.formatNumber(val) },
        { key: 'churn', label: 'Churned', align: 'right', format: (val) => TotoComponents.formatNumber(val) },
        { key: 'paid_share', label: 'Paid %', align: 'right', format: (val) => `${val.toFixed(1)}%` },
      ], planRows, { title: 'Plan Performance (Latest Snapshot)', defaultSort: 'active_paid', defaultSortDir: 'desc' });
    }

    function renderByApp() {
      const appMap = apps || {};
      const selectedApps = getSelectedAppIds(subStates, filterState);
      const rows = [];

      selectedApps.forEach(appId => {
        const appData = subStates[appId];
        if (!appData) return;
        const appInfo = appMap[appId] || {};
        const dates = getFilteredDates(appData, filterState);
        if (dates.length === 0) return;

        // Latest snapshot
        const latest = dates[dates.length - 1];
        const d = appData[latest];
        if (!d) return;

        // Period totals for trial/paid
        let trialSum = 0, paidSum = 0;
        dates.forEach(date => {
          trialSum += parseFloat(appData[date]?.trial_starts) || 0;
          paidSum += parseFloat(appData[date]?.paid_conversions) || 0;
        });

        const t2p = trialSum > 0 ? (paidSum / trialSum * 100) : 0;

        rows.push({
          id: appId,
          name: appInfo.name || `App ${appId}`,
          icon: appInfo.icon || '',
          active_paid: d.active_paid || 0,
          active_trial: d.active_trial || 0,
          voluntary_churn: d.voluntary_churn || 0,
          trial_starts: trialSum,
          paid_conversions: paidSum,
          t2p,
        });
      });

      TotoComponents.renderTable(tabContent, [
        { key: 'name', label: 'App', render: (val, row) => {
            const icon = row.icon ? `<img class="app-icon" src="${TotoComponents.escapeHtml(row.icon)}" alt="" onerror="this.style.display='none'">` : '<div class="app-icon"></div>';
            return `<div class="app-cell">${icon}<div class="app-name">${TotoComponents.escapeHtml(shortAppName(row.name))}</div></div>`;
          }
        },
        { key: 'active_paid', label: 'Paid', align: 'right', format: (val) => TotoComponents.formatNumber(val) },
        { key: 'active_trial', label: 'Trial', align: 'right', format: (val) => TotoComponents.formatNumber(val) },
        { key: 'trial_starts', label: 'Trials (period)', align: 'right', format: (val) => TotoComponents.formatNumber(val) },
        { key: 'paid_conversions', label: 'Converted', align: 'right', format: (val) => TotoComponents.formatNumber(val) },
        { key: 't2p', label: 'T2P%', align: 'right', format: (val) => `${val.toFixed(1)}%` },
        { key: 'voluntary_churn', label: 'Churned', align: 'right', format: (val) => TotoComponents.formatNumber(val) },
      ], rows, {
        title: 'Subscription Health by App',
        defaultSort: 'active_paid',
        defaultSortDir: 'desc',
        selectedRowId: getApp() ? getApp().id : null,
        onRowClick: (row) => {
          if (getApp() && getApp().id === row.id) {
            setApp(null);
          } else {
            setApp({ id: row.id, name: row.name });
          }
          activeTab = 'trends';
          container.querySelectorAll('.tab').forEach(el => el.classList.toggle('active', el.textContent === 'Trends'));
          renderTabContent();
        }
      });
    }

    renderTabContent();
  }

  return { render };
})();
