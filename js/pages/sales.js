/**
 * sales.js — Sales & Downloads page
 */

const SalesPage = (() => {

  function render(container, data, filterState) {
    const { sales, apps } = data;
    container.innerHTML = '';

    const getApp = () => TotoApp.state.highlightedApp;
    const setApp = (val) => { TotoApp.state.highlightedApp = val; TotoApp.updateHashFromFilters(); };

    const title = document.createElement('h1');
    title.className = 'page-title';
    title.textContent = 'Sales & Downloads';
    container.appendChild(title);

    const subtitle = document.createElement('p');
    subtitle.className = 'page-subtitle';
    subtitle.textContent = 'Track downloads, re-downloads, updates, and uninstalls';
    container.appendChild(subtitle);

    if (!sales || Object.keys(sales).length === 0) {
      TotoComponents.renderEmptyState(container, 'No sales data', 'Run the sync script to generate data/sales.json');
      return;
    }

    function computeMetrics(appId) {
      let source;
      if (appId && sales[appId]) {
        source = { [appId]: sales[appId] };
      } else {
        source = sales;
      }
      const { totals: periodTotals, dayCount } = aggregateTotals(source, ['downloads', 're_downloads', 'updates', 'uninstalls', 'net_downloads'], filterState);
      return [
        { label: 'Downloads', field: 'downloads', value: periodTotals.downloads, perDay: periodTotals.downloads / dayCount, changePercent: computePeriodChange(source, 'downloads', filterState), isCurrency: false, description: 'First-time app downloads in the selected period' },
        { label: 'Re-downloads', field: 're_downloads', value: periodTotals.re_downloads, perDay: periodTotals.re_downloads / dayCount, changePercent: computePeriodChange(source, 're_downloads', filterState), isCurrency: false, description: 'Users who previously downloaded the app and downloaded it again' },
        { label: 'Updates', field: 'updates', value: periodTotals.updates, perDay: periodTotals.updates / dayCount, changePercent: computePeriodChange(source, 'updates', filterState), isCurrency: false, description: 'App version updates installed by existing users' },
        { label: 'Uninstalls', field: 'uninstalls', value: periodTotals.uninstalls, perDay: periodTotals.uninstalls / dayCount, changePercent: computePeriodChange(source, 'uninstalls', filterState), isCurrency: false, description: 'Number of app deletions in the selected period' }
      ];
    }

    let activeField = 'downloads';
    const metrics = computeMetrics(getApp()?.id);

    // Chart section
    const chartSection = document.createElement('div');
    chartSection.className = 'chart-container';
    chartSection.id = 'salesChartSection';
    chartSection.innerHTML = `
      <div class="chart-header-row">
        <div class="chart-title" id="salesChartTitle">Downloads Over Time</div>
        <div class="chart-isolation-chip hidden" id="salesIsolationChip"></div>
      </div>
      <div class="chart-wrapper"><canvas id="salesMainChart"></canvas></div>
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
      const chip = document.getElementById('salesIsolationChip');
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
      const titleEl = document.getElementById('salesChartTitle');
      const metricInfo = metric || metrics.find(m => m.field === field);
      if (titleEl) titleEl.textContent = `${metricInfo ? metricInfo.label : field} Over Time`;

      TotoCharts.destroyChart('salesMainChart');
      const ha = getApp();

      if (ha && sales[ha.id]) {
        const appData = sales[ha.id];
        const dates = getFullDateRange(filterState);
        const bucketed = bucketDates(dates, filterState.granularity);
        const labels = bucketed.map(b => b.label);
        const values = bucketed.map(b => b.dates.reduce((sum, date) => sum + (parseFloat(appData[date]?.[field]) || 0), 0));
        if (labels.length > 0) {
          const rawDates = filterState.granularity === 'daily' ? bucketed.map(b => b.dates[0]) : null;
          TotoCharts.createAreaChart('salesMainChart', labels, [{ label: shortAppName(ha.name), data: values }], { isCurrency: false, stacked: false, rawDates });
        }
        return;
      }

      const chartData = buildTimeSeriesData(sales, field, apps, filterState, { topN: 5 });
      if (chartData.labels.length > 0) {
        TotoCharts.createAreaChart('salesMainChart', chartData.labels, chartData.datasets, { isCurrency: false, rawDates: chartData.rawDates });
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

    // Tab container
    let activeTab = 'trends';
    const tabContent = document.createElement('div');

    TotoComponents.renderTabs(container, [
      { key: 'trends', label: 'Trends' },
      { key: 'by-product', label: 'By Product' }
    ], activeTab, (key) => {
      activeTab = key;
      renderTabContent();
    });

    container.appendChild(tabContent);

    function renderTabContent() {
      TotoCharts.destroyChart('salesMainChart');
      tabContent.innerHTML = '';
      if (activeTab === 'trends') {
        renderTrends();
      } else {
        renderByProduct();
      }
    }

    function renderTrends() {
      tabContent.appendChild(chartSection);
      updateIsolationChip();
      renderChart(activeField);
    }

    function renderByProduct() {
      const appRows = getAppSalesTotals(sales, apps, filterState);
      const maxDownloads = Math.max(...appRows.map(r => r.downloads), 1);

      const columns = [
        { key: 'name', label: 'App', render: (val, row) => {
            const icon = row.icon ? `<img class="app-icon" src="${TotoComponents.escapeHtml(row.icon)}" alt="" onerror="this.style.display='none'">` : '<div class="app-icon"></div>';
            return `<div class="app-cell">${icon}<div class="app-name">${TotoComponents.escapeHtml(shortAppName(row.name))}</div></div>`;
          }
        },
        { key: 'downloads', label: 'Downloads', align: 'right', barMax: maxDownloads, format: (val) => TotoComponents.formatNumber(val) },
        { key: 're_downloads', label: 'Re-downloads', align: 'right', format: (val) => TotoComponents.formatNumber(val) },
        { key: 'updates', label: 'Updates', align: 'right', format: (val) => TotoComponents.formatNumber(val) }
      ];

      TotoComponents.renderTable(tabContent, columns, appRows, {
        title: 'Downloads by App',
        defaultSort: 'downloads',
        defaultSortDir: 'desc',
        selectedRowId: getApp() ? getApp().id : null,
        onRowClick: (row) => {
          if (getApp() && getApp().id === row.id) {
            setApp(null);
          } else {
            setApp({ id: row.id, name: row.name });
          }
          if (activeTab !== 'trends') {
            activeTab = 'trends';
            container.querySelectorAll('.tab').forEach(el => el.classList.toggle('active', el.textContent === 'Trends'));
            renderTabContent();
          } else {
            const chartEl = document.getElementById('salesChartSection');
            if (chartEl) chartEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
            onIsolationChange();
          }
        }
      });
    }

    renderTabContent();
  }

  function getAppSalesTotals(sales, apps, filterState) {
    const appMap = apps || {};
    const selectedApps = getSelectedAppIds(sales, filterState);
    const rows = [];
    selectedApps.forEach(productId => {
      const appData = sales[productId];
      if (!appData) return;
      const appInfo = appMap[productId] || {};
      const totals = { downloads: 0, re_downloads: 0, updates: 0, uninstalls: 0, net_downloads: 0 };
      const dates = getFilteredDates(appData, filterState);
      dates.forEach(date => {
        const d = appData[date];
        if (!d) return;
        totals.downloads += parseFloat(d.downloads) || 0;
        totals.re_downloads += parseFloat(d.re_downloads) || 0;
        totals.updates += parseFloat(d.updates) || 0;
        totals.uninstalls += parseFloat(d.uninstalls) || 0;
        totals.net_downloads += parseFloat(d.net_downloads) || 0;
      });
      rows.push({ id: productId, name: appInfo.name || `App ${productId}`, icon: appInfo.icon || '', ...totals });
    });
    return rows;
  }

  return { render };
})();
