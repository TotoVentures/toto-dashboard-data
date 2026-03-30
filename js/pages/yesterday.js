/**
 * yesterday.js — "The Daily Toto" newspaper front page
 * Shows yesterday's key metrics with week-over-week comparison
 * Baustein-inspired infographic + NYT editorial typography
 */

const YesterdayPage = (() => {

  // Baustein color palette
  const COLORS = {
    green:  '#2d8a4e',
    blue:   '#2563eb',
    amber:  '#d97706',
    red:    '#dc2626',
    gray:   '#1a1a1a',
    muted:  '#c5c0b8',
    bg:     '#eae6df',
  };

  function render(container, data) {
    const { apps, revenue, sales, subscriptions, ratings, adspend, summary } = data;
    container.innerHTML = '';

    if (!summary || !revenue) {
      TotoComponents.renderEmptyState(container, 'No data yet', 'Run the sync script to populate dashboard data.');
      return;
    }

    // Determine "yesterday" = last date in the data
    const endDate = summary.date_range?.end;
    if (!endDate) {
      TotoComponents.renderEmptyState(container, 'No date range', 'Sync data is missing date range info.');
      return;
    }

    const yesterday = endDate;
    const yesterdayDate = new Date(yesterday + 'T00:00:00');

    // Same day last week
    const lastWeekDate = new Date(yesterdayDate);
    lastWeekDate.setDate(lastWeekDate.getDate() - 7);
    const lastWeek = lastWeekDate.toISOString().slice(0, 10);

    // Day before yesterday (for ratings delta)
    const dayBeforeDate = new Date(yesterdayDate);
    dayBeforeDate.setDate(dayBeforeDate.getDate() - 1);
    const dayBefore = dayBeforeDate.toISOString().slice(0, 10);

    const appMap = apps || {};

    // ===== Compute per-app metrics =====
    const appRows = [];
    const allApps = []; // includes $0 apps for dot matrix
    let totalRev = 0, totalRevLW = 0;
    let totalDL = 0, totalDLLW = 0;
    let totalTrials = 0, totalTrialsLW = 0;
    let totalNewRatings = 0, totalNewRatingsLW = 0;
    let totalAdSpend = 0, totalAdSpendLW = 0;

    Object.keys(appMap).forEach(appId => {
      const appInfo = appMap[appId];
      if (appInfo.parent_id != null) return;

      // Revenue
      const rev = parseFloat(revenue?.[appId]?.[yesterday]?.total) || 0;
      const revLW = parseFloat(revenue?.[appId]?.[lastWeek]?.total) || 0;

      // Downloads
      const dl = parseInt(sales?.[appId]?.[yesterday]?.downloads) || 0;
      const dlLW = parseInt(sales?.[appId]?.[lastWeek]?.downloads) || 0;

      // Trials
      const trials = parseInt(subscriptions?.[appId]?.[yesterday]?.new_trials) || 0;
      const trialsLW = parseInt(subscriptions?.[appId]?.[lastWeek]?.new_trials) || 0;

      // Ad spend
      const spend = parseFloat(adspend?.[appId]?.[yesterday]?.spend) || 0;
      const spendLW = parseFloat(adspend?.[appId]?.[lastWeek]?.spend) || 0;

      // Ratings delta
      let newRatings = 0;
      let newRatingsLW = 0;
      const ratingsHistory = ratings?.[appId]?.history || {};
      const ratingDates = Object.keys(ratingsHistory).sort();
      if (ratingDates.length >= 2) {
        const yesterdayRating = findClosestDate(ratingDates, yesterday, ratingsHistory);
        const dayBeforeRating = findClosestDate(ratingDates, dayBefore, ratingsHistory);
        if (yesterdayRating != null && dayBeforeRating != null) {
          newRatings = Math.max(0, yesterdayRating - dayBeforeRating);
        }
        const lwRating = findClosestDate(ratingDates, lastWeek, ratingsHistory);
        const lwDayBefore = new Date(lastWeekDate);
        lwDayBefore.setDate(lwDayBefore.getDate() - 1);
        const lwDayBeforeRating = findClosestDate(ratingDates, lwDayBefore.toISOString().slice(0, 10), ratingsHistory);
        if (lwRating != null && lwDayBeforeRating != null) {
          newRatingsLW = Math.max(0, lwRating - lwDayBeforeRating);
        }
      }

      totalRev += rev; totalRevLW += revLW;
      totalDL += dl; totalDLLW += dlLW;
      totalTrials += trials; totalTrialsLW += trialsLW;
      totalNewRatings += newRatings; totalNewRatingsLW += newRatingsLW;
      totalAdSpend += spend; totalAdSpendLW += spendLW;

      const appData = {
        id: appId,
        name: appInfo.name || `App ${appId}`,
        icon: appInfo.icon || '',
        revenue: rev,
        revenueLW: revLW,
        downloads: dl,
        downloadsLW: dlLW,
        trials: trials,
        trialsLW: trialsLW,
        newRatings,
        adSpend: spend
      };

      allApps.push(appData);
      if (rev > 0 || dl > 0 || trials > 0) {
        appRows.push(appData);
      }
    });

    appRows.sort((a, b) => b.revenue - a.revenue);
    allApps.sort((a, b) => b.revenue - a.revenue);

    const totalNet = totalRev - totalAdSpend;
    const totalNetLW = totalRevLW - totalAdSpendLW;

    // ===== Generate headlines =====
    const headlines = generateHeadlines(appRows, appMap, yesterday, data);

    // ===== Weather icon =====
    const weather = getWeatherIcon(totalRev, totalRevLW, totalDL, totalDLLW);

    // ===== Edition number =====
    const epoch = new Date('2024-01-01T00:00:00');
    const edition = Math.floor((yesterdayDate - epoch) / 86400000);

    // ===== Render the page =====
    const page = document.createElement('div');
    page.className = 'yesterday-page';

    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    const dateStr = `${days[yesterdayDate.getDay()]}, ${months[yesterdayDate.getMonth()]} ${yesterdayDate.getDate()}, ${yesterdayDate.getFullYear()}`;

    // Masthead
    page.innerHTML = `
      <div class="newspaper-masthead">
        <div class="masthead-rule"></div>
        <div class="masthead-meta">
          <span class="masthead-edition">No. ${edition}</span>
          <span class="masthead-weather">${weather.icon}</span>
          <span class="masthead-date">${dateStr}</span>
        </div>
        <h1 class="masthead-title">The Daily Toto</h1>
        <div class="masthead-tagline">"All the revenue that's fit to print"</div>
        <div class="masthead-rule"></div>
      </div>
    `;

    // Hero metrics row
    const heroRow = document.createElement('div');
    heroRow.className = 'yesterday-hero-row';
    heroRow.innerHTML = `
      ${heroCard('Net Revenue', totalNet, totalNetLW, true)}
      ${heroCard('Gross Revenue', totalRev, totalRevLW, true)}
      ${heroCard('Downloads', totalDL, totalDLLW, false)}
      ${heroCard('New Trials', totalTrials, totalTrialsLW, false)}
      ${heroCard('New Ratings', totalNewRatings, totalNewRatingsLW, false)}
      ${heroCard('Ad Spend', totalAdSpend, totalAdSpendLW, true, true)}
    `;
    page.appendChild(heroRow);

    // ===== Portfolio Dot Matrix + Revenue Bar (side by side) =====
    const vizSection = document.createElement('div');
    vizSection.className = 'yesterday-viz-section';

    // Dot matrix
    const dotMatrix = buildDotMatrix(allApps, totalRev);

    // Revenue proportion bar
    const revBar = buildRevenueBar(appRows, totalRev);

    vizSection.innerHTML = `
      <div class="viz-left">
        <div class="viz-header">Portfolio Health</div>
        ${dotMatrix}
      </div>
      <div class="viz-right">
        <div class="viz-header">Revenue Split</div>
        ${revBar}
      </div>
    `;
    page.appendChild(vizSection);

    // Headlines section
    if (headlines.length > 0) {
      const headlinesSection = document.createElement('div');
      headlinesSection.className = 'yesterday-headlines';
      headlinesSection.innerHTML = `
        <div class="headlines-header">Headlines</div>
        <div class="headlines-list">
          ${headlines.map(h => `
            <div class="headline-item">
              <span class="headline-icon">${h.icon}</span>
              <span class="headline-text">${TotoComponents.escapeHtml(h.text)}</span>
            </div>
          `).join('')}
        </div>
      `;
      page.appendChild(headlinesSection);
    }

    // Podium — top 3 earners
    if (appRows.length >= 3) {
      const podiumSection = document.createElement('div');
      podiumSection.className = 'yesterday-podium';
      podiumSection.innerHTML = `
        <div class="podium-header">Top Earners</div>
        <div class="podium-row">
          ${podiumCard(appRows[1], 2)}
          ${podiumCard(appRows[0], 1)}
          ${podiumCard(appRows[2], 3)}
        </div>
      `;
      page.appendChild(podiumSection);
    }

    // Full breakdown table
    const tableSection = document.createElement('div');
    tableSection.className = 'yesterday-table-section';
    tableSection.innerHTML = `<div class="table-section-header">Full Breakdown</div>`;
    page.appendChild(tableSection);

    const maxRev = Math.max(...appRows.map(r => r.revenue), 1);
    const columns = [
      {
        key: 'rank', label: '#', align: 'center',
        render: (val, row, i) => {
          const color = getTierColor(row.revenue, totalRev);
          return `<span class="rank-dot" style="background:${color}"></span>`;
        }
      },
      {
        key: 'name', label: 'App',
        render: (val, row) => {
          const icon = row.icon ? `<img class="app-icon" src="${TotoComponents.escapeHtml(row.icon)}" alt="" onerror="this.style.display='none'">` : '<div class="app-icon"></div>';
          return `<div class="app-cell">${icon}<div><div class="app-name">${TotoComponents.escapeHtml(shortAppName(row.name))}</div></div></div>`;
        }
      },
      {
        key: 'revenue', label: 'Revenue', align: 'right', barMax: maxRev,
        format: (val) => TotoComponents.formatNumber(val, { currency: true })
      },
      {
        key: 'revenueWoW', label: 'W/W', align: 'right',
        render: (val, row) => wowBadge(row.revenue, row.revenueLW)
      },
      {
        key: 'downloads', label: 'Downloads', align: 'right',
        format: (val) => TotoComponents.formatNumber(val)
      },
      {
        key: 'downloadsWoW', label: 'W/W', align: 'right',
        render: (val, row) => wowBadge(row.downloads, row.downloadsLW)
      },
      {
        key: 'trials', label: 'Trials', align: 'right',
        format: (val) => val > 0 ? TotoComponents.formatNumber(val) : '--'
      },
      {
        key: 'newRatings', label: 'Ratings', align: 'right',
        format: (val) => val > 0 ? `+${val}` : '--'
      }
    ];

    TotoComponents.renderTable(tableSection, columns, appRows, {
      defaultSort: 'revenue',
      defaultSortDir: 'desc'
    });

    container.appendChild(page);
  }

  // ===== Dot Matrix: circular grid, colored by revenue tier =====
  function buildDotMatrix(allApps, totalRev) {
    // Build circular dot positions
    const size = 280;
    const center = size / 2;
    const dotR = 7;
    const spacing = 20;

    // Generate grid positions within a circle
    const positions = [];
    for (let y = dotR + 2; y < size - dotR; y += spacing) {
      for (let x = dotR + 2; x < size - dotR; x += spacing) {
        const dx = x - center;
        const dy = y - center;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < center - dotR - 4) {
          positions.push({ x, y });
        }
      }
    }

    // Sort positions by distance from center (inside-out)
    positions.sort((a, b) => {
      const da = Math.sqrt((a.x - center) ** 2 + (a.y - center) ** 2);
      const db = Math.sqrt((b.x - center) ** 2 + (b.y - center) ** 2);
      return da - db;
    });

    // Assign apps to dots — active apps first (colored), then fill rest with muted
    const dots = [];
    const activeApps = allApps.filter(a => a.revenue > 0 || a.downloads > 0);
    const inactiveCount = Math.max(0, positions.length - activeApps.length);

    activeApps.forEach((app, i) => {
      if (i < positions.length) {
        dots.push({
          ...positions[i],
          color: getTierColor(app.revenue, totalRev),
          name: shortAppName(app.name),
          revenue: app.revenue
        });
      }
    });

    // Fill remaining positions with muted dots
    for (let i = activeApps.length; i < positions.length; i++) {
      dots.push({
        ...positions[i],
        color: COLORS.muted,
        name: '',
        revenue: 0
      });
    }

    // Build SVG
    const dotsSvg = dots.map(d => {
      const title = d.name ? `${d.name}: ${TotoComponents.formatNumber(d.revenue, { currency: true })}` : '';
      return `<circle cx="${d.x}" cy="${d.y}" r="${dotR}" fill="${d.color}" opacity="${d.name ? 1 : 0.35}">
        ${title ? `<title>${TotoComponents.escapeHtml(title)}</title>` : ''}
      </circle>`;
    }).join('');

    // Legend
    const legend = `
      <div class="dot-legend">
        <span class="dot-legend-item"><span class="dot-swatch" style="background:${COLORS.green}"></span> Top</span>
        <span class="dot-legend-item"><span class="dot-swatch" style="background:${COLORS.blue}"></span> Solid</span>
        <span class="dot-legend-item"><span class="dot-swatch" style="background:${COLORS.amber}"></span> Small</span>
        <span class="dot-legend-item"><span class="dot-swatch" style="background:${COLORS.muted};opacity:0.35"></span> Inactive</span>
      </div>
    `;

    return `
      <div class="dot-matrix-wrap">
        <svg viewBox="0 0 ${size} ${size}" class="dot-matrix-svg">
          ${dotsSvg}
        </svg>
      </div>
      ${legend}
    `;
  }

  // ===== Revenue Proportion Bar =====
  function buildRevenueBar(appRows, totalRev) {
    if (totalRev <= 0) return '<div class="rev-bar-empty">No revenue</div>';

    const topN = 6;
    const top = appRows.slice(0, topN);
    const otherRev = appRows.slice(topN).reduce((s, a) => s + a.revenue, 0);

    const barColors = [COLORS.green, COLORS.blue, '#6366f1', COLORS.amber, '#f97316', '#8b5cf6'];

    let bars = top.map((app, i) => {
      const pct = (app.revenue / totalRev * 100);
      if (pct < 1) return '';
      return `
        <div class="rev-bar-segment" style="width:${pct}%;background:${barColors[i % barColors.length]}"
             title="${TotoComponents.escapeHtml(shortAppName(app.name))}: ${TotoComponents.formatNumber(app.revenue, { currency: true })} (${pct.toFixed(0)}%)">
        </div>
      `;
    }).join('');

    if (otherRev > 0) {
      const pct = (otherRev / totalRev * 100);
      bars += `<div class="rev-bar-segment" style="width:${pct}%;background:${COLORS.muted}" title="Other: ${TotoComponents.formatNumber(otherRev, { currency: true })} (${pct.toFixed(0)}%)"></div>`;
    }

    // Legend items
    const legendItems = top.map((app, i) => {
      const pct = (app.revenue / totalRev * 100).toFixed(0);
      return `
        <div class="rev-legend-item">
          <span class="dot-swatch" style="background:${barColors[i % barColors.length]}"></span>
          <span class="rev-legend-name">${TotoComponents.escapeHtml(shortAppName(app.name))}</span>
          <span class="rev-legend-pct">${pct}%</span>
        </div>
      `;
    }).join('');

    const otherLegend = otherRev > 0 ? `
      <div class="rev-legend-item">
        <span class="dot-swatch" style="background:${COLORS.muted}"></span>
        <span class="rev-legend-name">Other</span>
        <span class="rev-legend-pct">${(otherRev / totalRev * 100).toFixed(0)}%</span>
      </div>
    ` : '';

    return `
      <div class="rev-bar-track">${bars}</div>
      <div class="rev-legend">${legendItems}${otherLegend}</div>
    `;
  }

  // ===== Tier color for an app's revenue =====
  function getTierColor(rev, totalRev) {
    if (rev <= 0) return COLORS.muted;
    const pct = (rev / totalRev) * 100;
    if (pct >= 15) return COLORS.green;   // top earner
    if (pct >= 5) return COLORS.blue;     // solid
    return COLORS.amber;                   // small
  }

  // ===== Helper: find closest rating count for a date =====
  function findClosestDate(sortedDates, targetDate, history) {
    let closest = null;
    for (let i = sortedDates.length - 1; i >= 0; i--) {
      if (sortedDates[i] <= targetDate) {
        closest = sortedDates[i];
        break;
      }
    }
    return closest ? (history[closest]?.count || 0) : null;
  }

  // ===== Helper: hero card HTML =====
  function heroCard(label, value, lastWeekValue, isCurrency, invertColor) {
    const formatted = TotoComponents.formatNumber(value, { currency: isCurrency, compact: true });
    const wow = wowPercent(value, lastWeekValue);
    const wowStr = wow !== null ? wowBadge(value, lastWeekValue, invertColor) : '<span class="wow-badge neutral">--</span>';

    return `
      <div class="yesterday-hero-card">
        <div class="hero-label">${label}</div>
        <div class="hero-value">${formatted}</div>
        <div class="hero-wow">${wowStr}</div>
      </div>
    `;
  }

  // ===== Helper: podium card =====
  function podiumCard(app, rank) {
    const medals = { 1: '&#x1F947;', 2: '&#x1F948;', 3: '&#x1F949;' };
    const heights = { 1: '120px', 2: '90px', 3: '70px' };
    const formatted = TotoComponents.formatNumber(app.revenue, { currency: true });
    const wow = wowBadge(app.revenue, app.revenueLW);
    const iconImg = app.icon ? `<img class="podium-icon" src="${TotoComponents.escapeHtml(app.icon)}" alt="" onerror="this.style.display='none'">` : '';

    return `
      <div class="podium-card podium-rank-${rank}">
        <div class="podium-medal">${medals[rank]}</div>
        ${iconImg}
        <div class="podium-app-name">${TotoComponents.escapeHtml(shortAppName(app.name))}</div>
        <div class="podium-revenue">${formatted}</div>
        <div class="podium-wow">${wow}</div>
        <div class="podium-bar" style="height:${heights[rank]}"></div>
      </div>
    `;
  }

  // ===== Helper: W/W percent =====
  function wowPercent(current, lastWeek) {
    if (lastWeek === 0 && current === 0) return 0;
    if (lastWeek === 0) return current > 0 ? 100 : 0;
    return ((current - lastWeek) / Math.abs(lastWeek)) * 100;
  }

  // ===== Helper: W/W badge HTML =====
  function wowBadge(current, lastWeek, invertColor) {
    const pct = wowPercent(current, lastWeek);
    if (pct === null || (current === 0 && lastWeek === 0)) return '<span class="wow-badge neutral">--</span>';

    const isUp = pct > 0;
    const isDown = pct < 0;
    let cls;
    if (invertColor) {
      cls = isUp ? 'negative' : isDown ? 'positive' : 'neutral';
    } else {
      cls = isUp ? 'positive' : isDown ? 'negative' : 'neutral';
    }
    const arrow = isUp ? '\u2191' : isDown ? '\u2193' : '';
    const sign = isUp ? '+' : '';
    return `<span class="wow-badge ${cls}">${arrow}${sign}${pct.toFixed(0)}%</span>`;
  }

  // ===== Generate auto-headlines =====
  function generateHeadlines(appRows, appMap, yesterday, data) {
    const headlines = [];
    if (appRows.length === 0) return headlines;

    const top = appRows[0];
    if (top.revenue > 0) {
      headlines.push({
        icon: '\u{1F451}',
        text: `${shortAppName(top.name)} led the portfolio with ${TotoComponents.formatNumber(top.revenue, { currency: true })} in revenue`
      });
    }

    const gainers = appRows
      .filter(a => a.revenueLW > 0 && a.revenue > a.revenueLW)
      .map(a => ({ ...a, gain: ((a.revenue - a.revenueLW) / a.revenueLW) * 100 }))
      .sort((a, b) => b.gain - a.gain);
    if (gainers.length > 0 && gainers[0].gain > 20) {
      const g = gainers[0];
      headlines.push({
        icon: '\u{1F680}',
        text: `${shortAppName(g.name)} revenue up ${g.gain.toFixed(0)}% vs last week`
      });
    }

    const decliners = appRows
      .filter(a => a.revenueLW > 2 && a.revenue < a.revenueLW)
      .map(a => ({ ...a, drop: ((a.revenueLW - a.revenue) / a.revenueLW) * 100 }))
      .sort((a, b) => b.drop - a.drop);
    if (decliners.length > 0 && decliners[0].drop > 30) {
      const d = decliners[0];
      headlines.push({
        icon: '\u{1F4C9}',
        text: `${shortAppName(d.name)} revenue down ${d.drop.toFixed(0)}% vs last week`
      });
    }

    const dlLeader = [...appRows].sort((a, b) => b.downloads - a.downloads)[0];
    if (dlLeader && dlLeader.downloads > 0 && dlLeader.id !== top.id) {
      headlines.push({
        icon: '\u{1F4F2}',
        text: `${shortAppName(dlLeader.name)} had the most downloads (${dlLeader.downloads})`
      });
    }

    const ratedApps = appRows.filter(a => a.newRatings > 0);
    if (ratedApps.length > 0) {
      const totalNew = ratedApps.reduce((sum, a) => sum + a.newRatings, 0);
      const names = ratedApps.map(a => shortAppName(a.name)).slice(0, 3).join(', ');
      headlines.push({
        icon: '\u2B50',
        text: `${totalNew} new rating${totalNew > 1 ? 's' : ''} across ${names}`
      });
    }

    const trialLeader = [...appRows].sort((a, b) => b.trials - a.trials)[0];
    if (trialLeader && trialLeader.trials > 3) {
      headlines.push({
        icon: '\u{1F3AF}',
        text: `${shortAppName(trialLeader.name)} started ${trialLeader.trials} new trial${trialLeader.trials > 1 ? 's' : ''}`
      });
    }

    const zeroDays = appRows.filter(a => a.revenue === 0 && a.revenueLW > 5);
    if (zeroDays.length > 0) {
      const names = zeroDays.map(a => shortAppName(a.name)).slice(0, 3).join(', ');
      headlines.push({
        icon: '\u{1F6A8}',
        text: `${names} had $0 revenue (earned last week)`
      });
    }

    return headlines.slice(0, 6);
  }

  // ===== Weather icon based on performance =====
  function getWeatherIcon(rev, revLW, dl, dlLW) {
    const revChange = revLW > 0 ? (rev - revLW) / revLW : 0;
    const dlChange = dlLW > 0 ? (dl - dlLW) / dlLW : 0;
    const composite = revChange * 0.8 + dlChange * 0.2;

    if (composite > 0.15) return { icon: '\u2600\uFE0F', label: 'Great day' };
    if (composite > 0.0) return { icon: '\u{1F324}\uFE0F', label: 'Good day' };
    if (composite > -0.1) return { icon: '\u26C5', label: 'Average day' };
    if (composite > -0.25) return { icon: '\u{1F325}\uFE0F', label: 'Slow day' };
    return { icon: '\u{1F327}\uFE0F', label: 'Rough day' };
  }

  return { render };
})();
