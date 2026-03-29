/**
 * ratings.js — Ratings page
 * Focuses on new ratings gained, not overall rating.
 */

const RatingsPage = (() => {

  function render(container, data, filterState) {
    const { apps, ratings } = data;
    container.innerHTML = '';

    const title = document.createElement('h1');
    title.className = 'page-title';
    title.textContent = 'Ratings';
    container.appendChild(title);

    const subtitle = document.createElement('p');
    subtitle.className = 'page-subtitle';
    subtitle.textContent = 'New ratings and trends across your portfolio';
    container.appendChild(subtitle);

    if (!ratings || Object.keys(ratings).length === 0) {
      TotoComponents.renderEmptyState(container, 'No ratings data', 'Run the sync script to fetch ratings.');
      return;
    }

    const appMap = apps || {};
    const rows = [];
    let totalRatings = 0;
    let totalNew = 0;
    let totalWeighted = 0;

    Object.entries(ratings).forEach(([appId, appRatings]) => {
      const appInfo = appMap[appId];
      if (!appInfo || appInfo.parent_id != null) return;

      const current = appRatings.current || {};
      const count = current.count || 0;
      const rating = current.rating || 0;
      const history = appRatings.history || {};
      const histogram = appRatings.histogram || {};

      // Calculate new ratings in period from history snapshots
      const histDates = Object.keys(history).sort();
      let newInPeriod = 0;

      if (histDates.length >= 2) {
        // Find baseline: latest date BEFORE the filter start
        const beforePeriod = histDates.filter(d => filterState.startDate && d < filterState.startDate);
        const inPeriod = histDates.filter(d => {
          if (filterState.startDate && d < filterState.startDate) return false;
          if (filterState.endDate && d > filterState.endDate) return false;
          return true;
        });

        if (beforePeriod.length > 0 && inPeriod.length > 0) {
          const baseline = history[beforePeriod[beforePeriod.length - 1]]?.count || 0;
          const latest = history[inPeriod[inPeriod.length - 1]]?.count || 0;
          newInPeriod = Math.max(0, latest - baseline);
        } else if (inPeriod.length >= 2) {
          const first = history[inPeriod[0]]?.count || 0;
          const last = history[inPeriod[inPeriod.length - 1]]?.count || 0;
          newInPeriod = Math.max(0, last - first);
        }
      }

      if (count > 0) {
        rows.push({
          id: appId,
          name: appInfo.name || `App ${appId}`,
          icon: appInfo.icon || '',
          rating,
          count,
          newInPeriod,
          histogram,
        });
        totalRatings += count;
        totalWeighted += count * rating;
        totalNew += newInPeriod;
      }
    });

    const avgRating = totalRatings > 0 ? totalWeighted / totalRatings : 0;

    // KPI cards — new ratings first
    const metrics = [
      { label: 'New Ratings', field: 'new', value: totalNew, isCurrency: false, description: 'New ratings gained during the selected period (needs 2+ days of history)' },
      { label: 'Total Ratings', field: 'total', value: totalRatings, isCurrency: false, description: 'Sum of all ratings across all apps (all countries)' },
      { label: 'Avg Rating', field: 'avg', value: avgRating, isCurrency: false, description: 'Weighted average across portfolio', format: (v) => v.toFixed(2) },
      { label: 'Rated Apps', field: 'rated', value: rows.length, isCurrency: false, description: 'Apps with at least one rating' }
    ];

    TotoComponents.renderKPICards(container, metrics);

    // Sort by new ratings first (most active), fall back to total
    rows.sort((a, b) => (b.newInPeriod - a.newInPeriod) || (b.count - a.count));

    const maxCount = Math.max(...rows.map(r => r.count), 1);

    const columns = [
      {
        key: 'name', label: 'App',
        render: (val, row) => {
          const icon = row.icon ? `<img class="app-icon" src="${TotoComponents.escapeHtml(row.icon)}" alt="" onerror="this.style.display='none'">` : '<div class="app-icon"></div>';
          return `<div class="app-cell">${icon}<div class="app-name">${TotoComponents.escapeHtml(shortAppName(row.name))}</div></div>`;
        }
      },
      {
        key: 'newInPeriod', label: 'New', align: 'right',
        format: (val) => val > 0 ? `+${TotoComponents.formatNumber(val)}` : '\u2014'
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
        key: 'histogram', label: 'Distribution', align: 'left',
        render: (val) => {
          if (!val || Object.keys(val).length === 0) return '\u2014';
          const total = Object.values(val).reduce((s, v) => s + v, 0);
          if (total === 0) return '\u2014';
          // Mini horizontal bar for 1-5 stars
          let html = '<div style="display:flex;gap:1px;align-items:center;min-width:80px">';
          for (let i = 5; i >= 1; i--) {
            const pct = (val[String(i)] || 0) / total * 100;
            const color = i >= 4 ? 'var(--green)' : i === 3 ? 'var(--orange, #f0ad4e)' : 'var(--red)';
            html += `<div style="height:12px;width:${Math.max(pct, 2)}%;background:${color};border-radius:2px" title="${i}\u2605: ${val[String(i)] || 0} (${pct.toFixed(0)}%)"></div>`;
          }
          html += '</div>';
          return html;
        }
      },
    ];

    TotoComponents.renderTable(container, columns, rows, {
      title: 'Ratings by App',
      defaultSort: 'newInPeriod',
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

  return { render };
})();
