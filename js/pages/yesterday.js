/**
 * yesterday.js — "The Daily Toto" newspaper front page
 * Shows yesterday's key metrics with week-over-week comparison
 */

const YesterdayPage = (() => {

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
    let totalRev = 0, totalRevLW = 0;
    let totalDL = 0, totalDLLW = 0;
    let totalTrials = 0, totalTrialsLW = 0;
    let totalNewRatings = 0, totalNewRatingsLW = 0;
    let totalAdSpend = 0, totalAdSpendLW = 0;

    // Also compute 7-day trailing for "avg" comparison
    const trailing7Start = new Date(yesterdayDate);
    trailing7Start.setDate(trailing7Start.getDate() - 7);

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

      // Ratings delta (today count - yesterday count)
      let newRatings = 0;
      let newRatingsLW = 0;
      const ratingsHistory = ratings?.[appId]?.history || {};
      const ratingDates = Object.keys(ratingsHistory).sort();
      if (ratingDates.length >= 2) {
        // Find closest dates to yesterday and dayBefore
        const yesterdayRating = findClosestDate(ratingDates, yesterday, ratingsHistory);
        const dayBeforeRating = findClosestDate(ratingDates, dayBefore, ratingsHistory);
        if (yesterdayRating != null && dayBeforeRating != null) {
          newRatings = Math.max(0, yesterdayRating - dayBeforeRating);
        }

        // Same for last week
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

      if (rev > 0 || dl > 0 || trials > 0) {
        appRows.push({
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
        });
      }
    });

    appRows.sort((a, b) => b.revenue - a.revenue);

    const totalNet = totalRev - totalAdSpend;
    const totalNetLW = totalRevLW - totalAdSpendLW;

    // ===== Generate headlines =====
    const headlines = generateHeadlines(appRows, appMap, yesterday, data);

    // ===== Weather icon =====
    const weather = getWeatherIcon(totalRev, totalRevLW, totalDL, totalDLLW);

    // ===== Edition number (days since arbitrary epoch) =====
    const epoch = new Date('2024-01-01T00:00:00');
    const edition = Math.floor((yesterdayDate - epoch) / 86400000);

    // ===== Render the newspaper =====
    const page = document.createElement('div');
    page.className = 'yesterday-page';

    // Format date nicely
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
      ${heroCard('Net Revenue', totalNet, totalNetLW, true, '&#x1F4B0;')}
      ${heroCard('Gross Revenue', totalRev, totalRevLW, true, '&#x1F4C8;')}
      ${heroCard('Downloads', totalDL, totalDLLW, false, '&#x1F4F2;')}
      ${heroCard('New Trials', totalTrials, totalTrialsLW, false, '&#x1F3AF;')}
      ${heroCard('New Ratings', totalNewRatings, totalNewRatingsLW, false, '&#x2B50;')}
      ${heroCard('Ad Spend', totalAdSpend, totalAdSpendLW, true, '&#x1F4A1;', true)}
    `;
    page.appendChild(heroRow);

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
          const cls = i === 0 ? 'gold' : i === 1 ? 'silver' : i === 2 ? 'bronze' : '';
          return cls ? `<span class="rank-badge ${cls}">${i + 1}</span>` : `<span>${i + 1}</span>`;
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

  // ===== Helper: find closest rating count for a date =====
  function findClosestDate(sortedDates, targetDate, history) {
    // Find the latest date <= targetDate
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
  function heroCard(label, value, lastWeekValue, isCurrency, iconHtml, invertColor) {
    const formatted = TotoComponents.formatNumber(value, { currency: isCurrency, compact: true });
    const wow = wowPercent(value, lastWeekValue);
    const wowStr = wow !== null ? wowBadge(value, lastWeekValue, invertColor) : '<span class="wow-badge neutral">--</span>';

    return `
      <div class="yesterday-hero-card">
        <div class="hero-icon">${iconHtml}</div>
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
    // For ad spend, up is bad (red), down is good (green)
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

    // Top earner
    const top = appRows[0];
    if (top.revenue > 0) {
      headlines.push({
        icon: '\u{1F451}',
        text: `${shortAppName(top.name)} led the portfolio with ${TotoComponents.formatNumber(top.revenue, { currency: true })} in revenue`
      });
    }

    // Biggest gainer (w/w revenue %)
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

    // Biggest decliner
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

    // Download leader
    const dlLeader = [...appRows].sort((a, b) => b.downloads - a.downloads)[0];
    if (dlLeader && dlLeader.downloads > 0 && dlLeader.id !== top.id) {
      headlines.push({
        icon: '\u{1F4F2}',
        text: `${shortAppName(dlLeader.name)} had the most downloads (${dlLeader.downloads})`
      });
    }

    // Any app with new ratings
    const ratedApps = appRows.filter(a => a.newRatings > 0);
    if (ratedApps.length > 0) {
      const totalNew = ratedApps.reduce((sum, a) => sum + a.newRatings, 0);
      const names = ratedApps.map(a => shortAppName(a.name)).slice(0, 3).join(', ');
      headlines.push({
        icon: '\u2B50',
        text: `${totalNew} new rating${totalNew > 1 ? 's' : ''} across ${names}`
      });
    }

    // Most trials
    const trialLeader = [...appRows].sort((a, b) => b.trials - a.trials)[0];
    if (trialLeader && trialLeader.trials > 3) {
      headlines.push({
        icon: '\u{1F3AF}',
        text: `${shortAppName(trialLeader.name)} started ${trialLeader.trials} new trial${trialLeader.trials > 1 ? 's' : ''}`
      });
    }

    // Zero revenue day (bad day warning)
    const zeroDays = appRows.filter(a => a.revenue === 0 && a.revenueLW > 5);
    if (zeroDays.length > 0) {
      const names = zeroDays.map(a => shortAppName(a.name)).slice(0, 3).join(', ');
      headlines.push({
        icon: '\u{1F6A8}',
        text: `${names} had $0 revenue (earned last week)`
      });
    }

    return headlines.slice(0, 6); // Cap at 6 headlines
  }

  // ===== Weather icon based on performance =====
  function getWeatherIcon(rev, revLW, dl, dlLW) {
    // Revenue-weighted: 80% revenue, 20% downloads
    const revChange = revLW > 0 ? (rev - revLW) / revLW : 0;
    const dlChange = dlLW > 0 ? (dl - dlLW) / dlLW : 0;
    const composite = revChange * 0.8 + dlChange * 0.2;

    if (composite > 0.15) return { icon: '\u2600\uFE0F', label: 'Great day' };   // sunny
    if (composite > 0.0) return { icon: '\u{1F324}\uFE0F', label: 'Good day' };  // mostly sunny
    if (composite > -0.1) return { icon: '\u26C5', label: 'Average day' };        // partly cloudy
    if (composite > -0.25) return { icon: '\u{1F325}\uFE0F', label: 'Slow day' }; // mostly cloudy
    return { icon: '\u{1F327}\uFE0F', label: 'Rough day' };                       // rainy
  }

  return { render };
})();
