/**
 * adspend.js — Ad Spend page (Apple Search Ads)
 */

const AdSpendPage = (() => {

  function render(container, data, filterState) {
    const { adspend, revenue, apps } = data;
    container.innerHTML = '';

    const getApp = () => TotoApp.state.highlightedApp;
    const setApp = (val) => { TotoApp.state.highlightedApp = val; TotoApp.updateHashFromFilters(); };

    const title = document.createElement('h1');
    title.className = 'page-title';
    title.textContent = 'Ad Spend';
    container.appendChild(title);

    const subtitle = document.createElement('p');
    subtitle.className = 'page-subtitle';
    subtitle.textContent = 'Apple Search Ads performance and ROAS';
    container.appendChild(subtitle);

    if (!adspend || Object.keys(adspend).length === 0) {
      TotoComponents.renderEmptyState(container, 'No ad spend data', 'Run the sync script to pull Apple Search Ads data');
      return;
    }

    function computeMetrics(appId) {
      let spendSource, revSource;
      if (appId) {
        spendSource = adspend[appId] ? { [appId]: adspend[appId] } : {};
        revSource = revenue && revenue[appId] ? { [appId]: revenue[appId] } : {};
      } else {
        spendSource = adspend;
        revSource = revenue || {};
      }

      const { totals: spendTotals, dayCount } = aggregateTotals(spendSource, ['spend', 'impressions', 'taps', 'installs', 'new_downloads'], filterState);
      const { totals: revTotals } = Object.keys(revSource).length > 0
        ? aggregateTotals(revSource, ['total'], filterState)
        : { totals: { total: 0 } };

      const spend = spendTotals.spend;
      const installs = spendTotals.installs;
      const taps = spendTotals.taps;
      const impressions = spendTotals.impressions;
      const cpa = installs > 0 ? spend / installs : 0;
      const cpt = taps > 0 ? spend / taps : 0;
      const roas = spend > 0 ? revTotals.total / spend : 0;
      const ctr = impressions > 0 ? (taps / impressions) * 100 : 0;

      return [
        { label: 'Ad Spend', field: 'spend', value: spend, perDay: spend / dayCount, changePercent: computePeriodChange(spendSource, 'spend', filterState), isCurrency: true, description: 'Total Apple Search Ads spend (converted to USD)' },
        { label: 'Ad Installs', field: 'installs', value: installs, perDay: installs / dayCount, changePercent: computePeriodChange(spendSource, 'installs', filterState), isCurrency: false, description: 'Installs attributed to ads (30-day attribution window)' },
        { label: 'CPA', value: cpa, isCurrency: true, description: 'Cost per acquisition (spend / installs)' },
        { label: 'ROAS', value: roas, isCurrency: false, description: 'Return on ad spend (revenue / ad spend). >1.0x means profitable.' },
        { label: 'Impressions', field: 'impressions', value: impressions, perDay: impressions / dayCount, changePercent: computePeriodChange(spendSource, 'impressions', filterState), isCurrency: false, description: 'Times ads were shown in search results' },
        { label: 'Taps', field: 'taps', value: taps, perDay: taps / dayCount, changePercent: computePeriodChange(spendSource, 'taps', filterState), isCurrency: false, description: 'Times ads were tapped' },
      ];
    }

    let activeField = 'spend';
    const metrics = computeMetrics(getApp()?.id);

    // Chart section
    const chartSection = document.createElement('div');
    chartSection.className = 'chart-container';
    chartSection.id = 'adspendChartSection';
    chartSection.innerHTML = `
      <div class="chart-header-row">
        <div class="chart-title" id="adspendChartTitle">Ad Spend Over Time</div>
        <div class="chart-isolation-chip hidden" id="adspendIsolationChip"></div>
      </div>
      <div class="chart-wrapper"><canvas id="adspendMainChart"></canvas></div>
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
      const chip = document.getElementById('adspendIsolationChip');
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
      const titleEl = document.getElementById('adspendChartTitle');
      const metricInfo = metric || metrics.find(m => m.field === field);
      if (titleEl) titleEl.textContent = `${metricInfo ? metricInfo.label : field} Over Time`;

      TotoCharts.destroyChart('adspendMainChart');
      const isCurrency = metricInfo ? metricInfo.isCurrency : false;
      const ha = getApp();

      if (ha && adspend[ha.id]) {
        const appData = adspend[ha.id];
        const dates = getFullDateRange(filterState);
        const bucketed = bucketDates(dates, filterState.granularity);
        const labels = bucketed.map(b => b.label);
        const values = bucketed.map(b => b.dates.reduce((sum, date) => sum + (parseFloat(appData[date]?.[field]) || 0), 0));
        if (labels.length > 0) {
          const rawDates = filterState.granularity === 'daily' ? bucketed.map(b => b.dates[0]) : null;
          TotoCharts.createAreaChart('adspendMainChart', labels, [{ label: shortAppName(ha.name), data: values }], { isCurrency, stacked: false, rawDates });
        }
        return;
      }

      if (!field) return;
      const chartData = buildTimeSeriesData(adspend, field, apps, filterState, { topN: 5 });
      if (chartData.labels.length > 0) {
        TotoCharts.createAreaChart('adspendMainChart', chartData.labels, chartData.datasets, { isCurrency, rawDates: chartData.rawDates });
      }
    }

    const kpiRow = TotoComponents.renderKPICards(container, metrics, {
      activeField,
      onSelect: (field, metric) => {
        if (field) {
          activeField = field;
          renderChart(field, metric);
        }
      }
    });

    container.appendChild(chartSection);
    updateIsolationChip();
    renderChart(activeField);

    // Per-app table
    const appRows = getAppAdSpendTotals(adspend, revenue, apps, filterState);
    if (appRows.length > 0) {
      const maxSpend = Math.max(...appRows.map(r => r.spend), 1);

      const columns = [
        { key: 'name', label: 'App', render: (val, row) => {
            const icon = row.icon ? `<img class="app-icon" src="${TotoComponents.escapeHtml(row.icon)}" alt="" onerror="this.style.display='none'">` : '<div class="app-icon"></div>';
            return `<div class="app-cell">${icon}<div class="app-name">${TotoComponents.escapeHtml(shortAppName(row.name))}</div></div>`;
          }
        },
        { key: 'spend', label: 'Ad Spend', align: 'right', barMax: maxSpend, format: (val) => TotoComponents.formatNumber(val, { currency: true }) },
        { key: 'installs', label: 'Installs', align: 'right', format: (val) => TotoComponents.formatNumber(val) },
        { key: 'cpa', label: 'CPA', align: 'right', format: (val) => val > 0 ? TotoComponents.formatNumber(val, { currency: true, compact: false, decimals: 2 }) : '\u2014' },
        { key: 'revenue', label: 'Revenue', align: 'right', format: (val) => TotoComponents.formatNumber(val, { currency: true }) },
        { key: 'roas', label: 'ROAS', align: 'right', render: (val, row) => {
            if (!row.spend || row.spend === 0) return '<span class="roas-neutral">\u2014</span>';
            const roas = row.revenue / row.spend;
            const cls = roas >= 1 ? 'roas-positive' : 'roas-negative';
            return `<span class="${cls}">${roas.toFixed(1)}x</span>`;
          }
        },
        { key: 'impressions', label: 'Impr', align: 'right', format: (val) => TotoComponents.formatNumber(val) },
        { key: 'taps', label: 'Taps', align: 'right', format: (val) => TotoComponents.formatNumber(val) },
        { key: 'ctr', label: 'CTR', align: 'right', format: (val, row) => {
            if (!row.impressions) return '\u2014';
            return ((row.taps / row.impressions) * 100).toFixed(1) + '%';
          }
        },
      ];

      TotoComponents.renderTable(container, columns, appRows, {
        title: 'Ad Performance by App',
        defaultSort: 'spend',
        defaultSortDir: 'desc',
        selectedRowId: getApp() ? getApp().id : null,
        onRowClick: (row) => {
          if (getApp() && getApp().id === row.id) {
            setApp(null);
          } else {
            setApp({ id: row.id, name: row.name });
          }
          const chartEl = document.getElementById('adspendChartSection');
          if (chartEl) chartEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
          onIsolationChange();
        }
      });
    }
  }

  function getAppAdSpendTotals(adspend, revenue, apps, filterState) {
    const appMap = apps || {};
    const selectedApps = getSelectedAppIds(adspend, filterState);
    const rows = [];

    selectedApps.forEach(productId => {
      const spendData = adspend[productId];
      if (!spendData) return;

      const appInfo = appMap[productId] || {};
      const totals = { spend: 0, impressions: 0, taps: 0, installs: 0, new_downloads: 0 };
      const dates = getFilteredDates(spendData, filterState);

      dates.forEach(date => {
        const d = spendData[date];
        if (!d) return;
        totals.spend += parseFloat(d.spend) || 0;
        totals.impressions += parseInt(d.impressions) || 0;
        totals.taps += parseInt(d.taps) || 0;
        totals.installs += parseInt(d.installs) || 0;
        totals.new_downloads += parseInt(d.new_downloads) || 0;
      });

      // Get revenue for ROAS
      let rev = 0;
      if (revenue && revenue[productId]) {
        const revDates = getFilteredDates(revenue[productId], filterState);
        revDates.forEach(date => {
          rev += parseFloat(revenue[productId][date]?.total) || 0;
        });
      }

      const cpa = totals.installs > 0 ? totals.spend / totals.installs : 0;

      rows.push({
        id: productId,
        name: appInfo.name || `App ${productId}`,
        icon: appInfo.icon || '',
        spend: totals.spend,
        impressions: totals.impressions,
        taps: totals.taps,
        installs: totals.installs,
        cpa,
        revenue: rev,
        roas: totals.spend > 0 ? rev / totals.spend : 0,
      });
    });

    return rows;
  }

  return { render };
})();
