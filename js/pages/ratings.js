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

      // Calculate new ratings in period.
      // iTunes only gives us snapshot counts, and history is often sparse
      // (collection gaps), so anchor "latest" to current.count — that's the
      // freshest live value — and pick the most recent history snapshot
      // strictly before filter.startDate as the baseline.
      const histDates = Object.keys(history).sort();
      let newInPeriod = 0;
      let baselineCount = null;

      if (filterState.startDate) {
        const before = histDates.filter(d => d < filterState.startDate);
        if (before.length > 0) {
          baselineCount = history[before[before.length - 1]]?.count;
        } else if (histDates.length > 0) {
          // No snapshot before period — fall back to earliest available
          baselineCount = history[histDates[0]]?.count;
        }
      } else if (histDates.length > 0) {
        baselineCount = history[histDates[0]]?.count;
      }

      if (baselineCount != null && count > 0) {
        // Show real delta (can be negative if ratings were removed)
        newInPeriod = count - baselineCount;
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
      { label: 'New Ratings', field: 'new', value: totalNew, isCurrency: false, description: 'Net change in rating count from the start of the period to now (live iTunes count)' },
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
        render: (val) => {
          const num = Number(val) || 0;
          if (num > 0) return `<span class="text-green">+${TotoComponents.formatNumber(num)}</span>`;
          if (num < 0) return `<span class="text-red">${TotoComponents.formatNumber(num)}</span>`;
          return '\u2014';
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
