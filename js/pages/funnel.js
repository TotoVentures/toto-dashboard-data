/**
 * funnel.js — Conversion Funnel page
 * Shows: Impressions → Page Views → Downloads → Trials → Paid
 * with source attribution and per-app breakdown.
 */

const FunnelPage = (() => {

  function render(container, data, filterState) {
    const { funnel, apps } = data;
    container.innerHTML = '';

    const getApp = () => TotoApp.state.highlightedApp;
    const setApp = (val) => { TotoApp.state.highlightedApp = val; TotoApp.updateHashFromFilters(); };

    const title = document.createElement('h1');
    title.className = 'page-title';
    title.textContent = 'Conversion Funnel';
    container.appendChild(title);

    const subtitle = document.createElement('p');
    subtitle.className = 'page-subtitle';
    subtitle.textContent = 'Impressions → Page Views → Downloads → Trials → Paid';
    container.appendChild(subtitle);

    if (!funnel || Object.keys(funnel).length === 0) {
      TotoComponents.renderEmptyState(container, 'No funnel data', 'Run sync to pull analytics API data into funnel.json');
      return;
    }

    function computeMetrics(appId) {
      let source;
      if (appId && funnel[appId]) {
        source = { [appId]: funnel[appId] };
      } else {
        source = funnel;
      }

      const fields = ['impressions', 'product_page_views', 'first_time_downloads', 'trial_starts', 'paid_conversions'];
      const { totals: t, dayCount } = aggregateTotals(source, fields, filterState);

      const ttr = t.impressions > 0 ? (t.product_page_views / t.impressions * 100) : 0;
      const cvr = t.product_page_views > 0 ? (t.first_time_downloads / t.product_page_views * 100) : 0;
      const t2p = t.trial_starts > 0 ? (t.paid_conversions / t.trial_starts * 100) : 0;

      return [
        { label: 'Impressions', field: 'impressions', value: t.impressions, perDay: t.impressions / dayCount, changePercent: computePeriodChange(source, 'impressions', filterState), isCurrency: false, description: 'Times your app appeared in App Store search results or browse' },
        { label: 'Page Views', field: 'product_page_views', value: t.product_page_views, perDay: t.product_page_views / dayCount, changePercent: computePeriodChange(source, 'product_page_views', filterState), isCurrency: false, description: `Tap-through rate: ${ttr.toFixed(1)}%` },
        { label: 'Downloads', field: 'first_time_downloads', value: t.first_time_downloads, perDay: t.first_time_downloads / dayCount, changePercent: computePeriodChange(source, 'first_time_downloads', filterState), isCurrency: false, description: `Conversion rate: ${cvr.toFixed(1)}%` },
        { label: 'Trial Starts', field: 'trial_starts', value: t.trial_starts, perDay: t.trial_starts / dayCount, changePercent: computePeriodChange(source, 'trial_starts', filterState), isCurrency: false, description: 'Free trial subscriptions started' },
        { label: 'Paid Conversions', field: 'paid_conversions', value: t.paid_conversions, perDay: t.paid_conversions / dayCount, changePercent: computePeriodChange(source, 'paid_conversions', filterState), isCurrency: false, description: `Trial-to-paid: ${t2p.toFixed(1)}%` },
      ];
    }

    let activeField = 'first_time_downloads';
    const metrics = computeMetrics(getApp()?.id);

    // Chart section
    const chartSection = document.createElement('div');
    chartSection.className = 'chart-container';
    chartSection.id = 'funnelChartSection';
    chartSection.innerHTML = `
      <div class="chart-header-row">
        <div class="chart-title" id="funnelChartTitle">Downloads Over Time</div>
        <div class="chart-isolation-chip hidden" id="funnelIsolationChip"></div>
      </div>
      <div class="chart-wrapper"><canvas id="funnelMainChart"></canvas></div>
    `;

    function onIsolationChange() {
      updateIsolationChip();
      renderChart(activeField);
      kpiRow.updateValues(computeMetrics(getApp()?.id));
      tabContent.querySelectorAll('.table-row-selected').forEach(el => el.classList.remove('table-row-selected'));
      if (getApp()) {
        tabContent.querySelectorAll('.data-table tbody tr.table-row-clickable').forEach(tr => {
          const nameEl = tr.querySelector('.app-name');
          if (nameEl && nameEl.textContent === getApp().name) tr.classList.add('table-row-selected');
        });
      }
    }

    function updateIsolationChip() {
      const chip = document.getElementById('funnelIsolationChip');
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
      const titleEl = document.getElementById('funnelChartTitle');
      const metricInfo = metric || metrics.find(m => m.field === field);
      if (titleEl) titleEl.textContent = `${metricInfo ? metricInfo.label : field} Over Time`;

      TotoCharts.destroyChart('funnelMainChart');
      const ha = getApp();

      if (ha && funnel[ha.id]) {
        const appData = funnel[ha.id];
        const dates = getFullDateRange(filterState);
        const bucketed = bucketDates(dates, filterState.granularity);
        const labels = bucketed.map(b => b.label);
        const values = bucketed.map(b => b.dates.reduce((sum, date) => sum + (parseFloat(appData[date]?.[field]) || 0), 0));
        const rawDates = filterState.granularity === 'daily' ? bucketed.map(b => b.dates[0]) : null;
        if (labels.length > 0) {
          TotoCharts.createAreaChart('funnelMainChart', labels, [{ label: shortAppName(ha.name), data: values }], { isCurrency: false, stacked: false, rawDates });
        }
        return;
      }

      const chartData = buildTimeSeriesData(funnel, field, apps, filterState, { topN: 5 });
      if (chartData.labels.length > 0) {
        TotoCharts.createAreaChart('funnelMainChart', chartData.labels, chartData.datasets, { isCurrency: false, rawDates: chartData.rawDates });
      }
    }

    const kpiRow = TotoComponents.renderKPICards(container, metrics, {
      activeField,
      onSelect: (field, metric) => {
        activeField = field;
        if (activeTab !== 'trends') {
          activeTab = 'trends';
          container.querySelectorAll('.tab').forEach(el => el.classList.toggle('active', el.textContent === 'Trends'));
          renderTabContent();
        } else {
          renderChart(field, metric);
        }
      }
    });

    // Tabs
    let activeTab = 'trends';
    const tabContent = document.createElement('div');

    TotoComponents.renderTabs(container, [
      { key: 'trends', label: 'Trends' },
      { key: 'attribution', label: 'Source Attribution' },
      { key: 'by-app', label: 'By App' }
    ], activeTab, (key) => {
      activeTab = key;
      renderTabContent();
    });

    container.appendChild(tabContent);

    function renderTabContent() {
      TotoCharts.destroyChart('funnelMainChart');
      TotoCharts.destroyChart('attributionChart');
      tabContent.innerHTML = '';
      if (activeTab === 'trends') {
        renderTrends();
      } else if (activeTab === 'attribution') {
        renderAttribution();
      } else {
        renderByApp();
      }
    }

    function renderTrends() {
      tabContent.appendChild(chartSection);
      updateIsolationChip();
      renderChart(activeField);
    }

    function renderAttribution() {
      const attrSection = document.createElement('div');
      attrSection.className = 'chart-container';
      attrSection.innerHTML = `
        <div class="chart-header-row">
          <div class="chart-title">Downloads by Source</div>
        </div>
        <div class="chart-wrapper"><canvas id="attributionChart"></canvas></div>
      `;
      tabContent.appendChild(attrSection);

      // Aggregate source data across all apps in filter
      const selectedApps = getSelectedAppIds(funnel, filterState);
      const sourceTotals = {};

      selectedApps.forEach(appId => {
        const ha = getApp();
        if (ha && ha.id !== appId) return;

        const appData = funnel[appId];
        if (!appData) return;
        const dates = getFilteredDates(appData, filterState);
        dates.forEach(date => {
          const bySource = appData[date]?.by_source;
          if (!bySource) return;
          Object.entries(bySource).forEach(([source, metrics]) => {
            if (!sourceTotals[source]) sourceTotals[source] = { impressions: 0, page_views: 0, downloads: 0 };
            sourceTotals[source].impressions += metrics.impressions || 0;
            sourceTotals[source].page_views += metrics.page_views || 0;
            sourceTotals[source].downloads += metrics.downloads || 0;
          });
        });
      });

      // Build stacked area chart by source over time
      const dates = getFullDateRange(filterState);
      const bucketed = bucketDates(dates, filterState.granularity);
      const labels = bucketed.map(b => b.label);
      const rawDates = filterState.granularity === 'daily' ? bucketed.map(b => b.dates[0]) : null;

      const sources = Object.keys(sourceTotals).sort((a, b) => sourceTotals[b].downloads - sourceTotals[a].downloads);
      const datasets = sources.map(source => ({
        label: source,
        data: bucketed.map(b => {
          let total = 0;
          b.dates.forEach(date => {
            selectedApps.forEach(appId => {
              const ha = getApp();
              if (ha && ha.id !== appId) return;
              total += funnel[appId]?.[date]?.by_source?.[source]?.downloads || 0;
            });
          });
          return total;
        })
      }));

      if (labels.length > 0 && datasets.length > 0) {
        TotoCharts.createAreaChart('attributionChart', labels, datasets, { isCurrency: false, stacked: true, rawDates });
      }

      // Source summary table
      const sourceRows = sources.map(source => {
        const s = sourceTotals[source];
        const totalDl = Object.values(sourceTotals).reduce((sum, v) => sum + v.downloads, 0);
        return {
          id: source,
          name: source,
          impressions: s.impressions,
          page_views: s.page_views,
          downloads: s.downloads,
          share: totalDl > 0 ? (s.downloads / totalDl * 100) : 0,
          ttr: s.impressions > 0 ? (s.page_views / s.impressions * 100) : 0,
          cvr: s.page_views > 0 ? (s.downloads / s.page_views * 100) : 0,
        };
      });

      TotoComponents.renderTable(tabContent, [
        { key: 'name', label: 'Source', render: (val) => `<div class="app-name">${TotoComponents.escapeHtml(val)}</div>` },
        { key: 'impressions', label: 'Impressions', align: 'right', format: (val) => TotoComponents.formatNumber(val) },
        { key: 'page_views', label: 'Page Views', align: 'right', format: (val) => TotoComponents.formatNumber(val) },
        { key: 'downloads', label: 'Downloads', align: 'right', format: (val) => TotoComponents.formatNumber(val) },
        { key: 'share', label: 'Share', align: 'right', format: (val) => `${val.toFixed(1)}%` },
        { key: 'ttr', label: 'TTR', align: 'right', format: (val) => `${val.toFixed(1)}%` },
        { key: 'cvr', label: 'CVR', align: 'right', format: (val) => `${val.toFixed(1)}%` },
      ], sourceRows, { title: 'Source Breakdown', defaultSort: 'downloads', defaultSortDir: 'desc' });
    }

    function renderByApp() {
      const appMap = apps || {};
      const selectedApps = getSelectedAppIds(funnel, filterState);
      const rows = [];

      selectedApps.forEach(appId => {
        const appData = funnel[appId];
        if (!appData) return;
        const appInfo = appMap[appId] || {};
        const dates = getFilteredDates(appData, filterState);
        const totals = { impressions: 0, product_page_views: 0, first_time_downloads: 0, trial_starts: 0, paid_conversions: 0 };
        dates.forEach(date => {
          const d = appData[date];
          if (!d) return;
          totals.impressions += parseFloat(d.impressions) || 0;
          totals.product_page_views += parseFloat(d.product_page_views) || 0;
          totals.first_time_downloads += parseFloat(d.first_time_downloads) || 0;
          totals.trial_starts += parseFloat(d.trial_starts) || 0;
          totals.paid_conversions += parseFloat(d.paid_conversions) || 0;
        });

        const ttr = totals.impressions > 0 ? (totals.product_page_views / totals.impressions * 100) : 0;
        const cvr = totals.product_page_views > 0 ? (totals.first_time_downloads / totals.product_page_views * 100) : 0;
        const t2p = totals.trial_starts > 0 ? (totals.paid_conversions / totals.trial_starts * 100) : 0;

        rows.push({
          id: appId,
          name: appInfo.name || `App ${appId}`,
          icon: appInfo.icon || '',
          ...totals,
          ttr, cvr, t2p,
        });
      });

      const columns = [
        { key: 'name', label: 'App', render: (val, row) => {
            const icon = row.icon ? `<img class="app-icon" src="${TotoComponents.escapeHtml(row.icon)}" alt="" onerror="this.style.display='none'">` : '<div class="app-icon"></div>';
            return `<div class="app-cell">${icon}<div class="app-name">${TotoComponents.escapeHtml(shortAppName(row.name))}</div></div>`;
          }
        },
        { key: 'impressions', label: 'Impr.', align: 'right', format: (val) => TotoComponents.formatNumber(val) },
        { key: 'product_page_views', label: 'PV', align: 'right', format: (val) => TotoComponents.formatNumber(val) },
        { key: 'first_time_downloads', label: 'DL', align: 'right', format: (val) => TotoComponents.formatNumber(val) },
        { key: 'ttr', label: 'TTR%', align: 'right', format: (val) => `${val.toFixed(1)}%` },
        { key: 'cvr', label: 'CVR%', align: 'right', format: (val) => `${val.toFixed(1)}%` },
        { key: 'trial_starts', label: 'Trials', align: 'right', format: (val) => TotoComponents.formatNumber(val) },
        { key: 'paid_conversions', label: 'Paid', align: 'right', format: (val) => TotoComponents.formatNumber(val) },
        { key: 't2p', label: 'T2P%', align: 'right', format: (val) => `${val.toFixed(1)}%` },
      ];

      TotoComponents.renderTable(tabContent, columns, rows, {
        title: 'Funnel by App',
        defaultSort: 'first_time_downloads',
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
