/**
 * ratings.js — Ratings & Reviews page
 */

const RatingsPage = (() => {

  function render(container, data, filterState) {
    const { apps, ratings } = data;
    container.innerHTML = '';

    const title = document.createElement('h1');
    title.className = 'page-title';
    title.textContent = 'Ratings & Reviews';
    container.appendChild(title);

    const subtitle = document.createElement('p');
    subtitle.className = 'page-subtitle';
    subtitle.textContent = 'App Store ratings across your portfolio';
    container.appendChild(subtitle);

    if (!ratings || Object.keys(ratings).length === 0) {
      TotoComponents.renderEmptyState(container, 'No ratings data', 'Run the sync script to fetch ratings from App Store Connect.');
      return;
    }

    const appMap = apps || {};

    // Build per-app rows
    const rows = [];
    let totalRatings = 0;
    let totalWeighted = 0;
    let totalNew = 0;

    Object.entries(ratings).forEach(([appId, appRatings]) => {
      const appInfo = appMap[appId];
      if (!appInfo || appInfo.parent_id != null) return;

      const current = appRatings.current || {};
      const count = current.count || 0;
      const rating = current.rating || 0;
      const territories = appRatings.territories || {};
      const history = appRatings.history || {};

      // Calculate new ratings in filtered period
      const histDates = Object.keys(history).sort();
      let newInPeriod = 0;
      if (histDates.length >= 2) {
        const filteredDates = histDates.filter(d => {
          if (filterState.startDate && d < filterState.startDate) return false;
          if (filterState.endDate && d > filterState.endDate) return false;
          return true;
        });
        if (filteredDates.length >= 2) {
          const first = history[filteredDates[0]];
          const last = history[filteredDates[filteredDates.length - 1]];
          newInPeriod = (last?.count || 0) - (first?.count || 0);
        }
        // Also check: first date in period vs date just before period
        const beforePeriod = histDates.filter(d => filterState.startDate && d < filterState.startDate);
        if (beforePeriod.length > 0 && filteredDates.length > 0) {
          const baseline = history[beforePeriod[beforePeriod.length - 1]];
          const latest = history[filteredDates[filteredDates.length - 1]];
          newInPeriod = (latest?.count || 0) - (baseline?.count || 0);
        }
      }

      if (count > 0 || newInPeriod > 0) {
        rows.push({
          id: appId,
          name: appInfo.name || `App ${appId}`,
          icon: appInfo.icon || '',
          developer: appInfo.developer || '',
          rating,
          count,
          newInPeriod: Math.max(0, newInPeriod),
          territoryCount: Object.keys(territories).length,
          history
        });
        totalRatings += count;
        totalWeighted += count * rating;
        totalNew += Math.max(0, newInPeriod);
      }
    });

    const avgRating = totalRatings > 0 ? totalWeighted / totalRatings : 0;

    // KPI cards
    const metrics = [
      { label: 'Total Ratings', field: 'total', value: totalRatings, isCurrency: false, description: 'Sum of all ratings across all apps' },
      { label: 'Avg Rating', field: 'avg', value: avgRating, isCurrency: false, description: 'Weighted average across portfolio' },
      { label: 'New in Period', field: 'new', value: totalNew, isCurrency: false, description: 'New ratings gained during the selected date range' },
      { label: 'Rated Apps', field: 'rated', value: rows.length, isCurrency: false, description: 'Number of apps with at least one rating' }
    ];

    TotoComponents.renderKPICards(container, metrics);

    // Chart: new ratings over time (stacked by top apps)
    const chartSection = document.createElement('div');
    chartSection.className = 'chart-container';
    chartSection.innerHTML = `
      <div class="chart-header-row">
        <div class="chart-title">New Ratings Over Time</div>
      </div>
      <div class="chart-wrapper"><canvas id="ratingsChart"></canvas></div>
    `;
    container.appendChild(chartSection);
    renderRatingsChart(rows, filterState, apps);

    // Table
    const maxCount = Math.max(...rows.map(r => r.count), 1);
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
      {
        key: 'rating', label: 'Rating', align: 'right',
        render: (val) => {
          if (!val) return '--';
          const stars = renderStars(val);
          return `<span class="rating-display">${stars} <span class="rating-number">${val.toFixed(1)}</span></span>`;
        }
      },
      { key: 'count', label: 'Total', align: 'right', barMax: maxCount, format: (val) => TotoComponents.formatNumber(val) },
      {
        key: 'newInPeriod', label: 'New', align: 'right',
        format: (val) => {
          if (!val) return '--';
          return '+' + TotoComponents.formatNumber(val);
        }
      },
      { key: 'territoryCount', label: 'Countries', align: 'right', format: (val) => val || '--' }
    ];

    TotoComponents.renderTable(container, columns, rows, {
      title: 'Ratings by App',
      defaultSort: 'count',
      defaultSortDir: 'desc'
    });
  }

  function renderStars(rating) {
    const full = Math.floor(rating);
    const half = rating - full >= 0.25 && rating - full < 0.75;
    const empty = 5 - full - (half ? 1 : 0);
    let html = '';
    for (let i = 0; i < full; i++) html += '<span class="star full">&#9733;</span>';
    if (half) html += '<span class="star half">&#9733;</span>';
    for (let i = 0; i < empty; i++) html += '<span class="star empty">&#9734;</span>';
    return html;
  }

  function renderRatingsChart(rows, filterState, apps) {
    // Build daily deltas from history
    const appMap = apps || {};
    const topApps = [...rows].sort((a, b) => b.newInPeriod - a.newInPeriod).slice(0, 5);

    // Collect all dates across all apps
    const allDates = new Set();
    topApps.forEach(app => {
      Object.keys(app.history).forEach(d => {
        if (filterState.startDate && d < filterState.startDate) return;
        if (filterState.endDate && d > filterState.endDate) return;
        allDates.add(d);
      });
    });

    const sortedDates = [...allDates].sort();
    if (sortedDates.length < 2) return;

    const buckets = bucketDates(sortedDates, filterState.granularity);
    const labels = buckets.map(b => b.label);

    const datasets = topApps.map(app => {
      const data = buckets.map(bucket => {
        const bucketDatesArr = bucket.dates;
        if (bucketDatesArr.length === 0) return 0;
        const first = bucketDatesArr[0];
        const last = bucketDatesArr[bucketDatesArr.length - 1];

        // Find the closest available history dates
        const histDates = Object.keys(app.history).sort();
        const beforeBucket = histDates.filter(d => d <= first);
        const inOrAfterBucket = histDates.filter(d => d >= first && d <= last);

        let startCount = 0;
        if (beforeBucket.length > 0) {
          startCount = app.history[beforeBucket[beforeBucket.length - 1]]?.count || 0;
        } else if (inOrAfterBucket.length > 0) {
          startCount = app.history[inOrAfterBucket[0]]?.count || 0;
        }

        let endCount = startCount;
        const endDates = histDates.filter(d => d <= last);
        if (endDates.length > 0) {
          endCount = app.history[endDates[endDates.length - 1]]?.count || 0;
        }

        return Math.max(0, endCount - startCount);
      });

      return {
        label: shortAppName(app.name),
        data
      };
    });

    const rawDates = filterState.granularity === 'daily' ? buckets.map(b => b.dates[0]) : null;

    if (labels.length > 0) {
      TotoCharts.createBarChart('ratingsChart', labels, datasets, {
        isCurrency: false,
        stacked: true,
        rawDates
      });
    }
  }

  return { render };
})();
