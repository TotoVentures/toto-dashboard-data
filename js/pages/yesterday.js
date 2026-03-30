/**
 * yesterday.js — "The Daily Toto" newspaper front page
 * Morning briefing with newspaper aesthetic + full data.
 */

const YesterdayPage = (() => {

  function render(container, data, filterState) {
    const { apps, revenue, sales, subscriptions, adspend, summary, funnel, subStates } = data;
    container.innerHTML = '';

    // Find the most recent date with data
    const latestDate = findLatestDate(revenue, sales);
    if (!latestDate) {
      TotoComponents.renderEmptyState(container, 'No data yet', 'Run the sync script to populate dashboard data.');
      return;
    }

    const yesterdayDate = new Date(latestDate + 'T00:00:00');

    // Same day last week
    const lastWeekDate = new Date(yesterdayDate);
    lastWeekDate.setDate(lastWeekDate.getDate() - 7);
    const lastWeek = lastWeekDate.toISOString().slice(0, 10);

    // 7-day trailing window (for avg comparison)
    const dates7d = getPrevDates(latestDate, 7);
    const dates7dNoToday = dates7d.slice(0, -1);

    const appMap = apps || {};

    // ===== Compute per-app metrics =====
    const appRows = [];
    let totalRev = 0, totalRevLW = 0;
    let totalDL = 0, totalDLLW = 0;
    let totalTrials = 0, totalTrialsLW = 0;
    let totalConv = 0, totalChurn = 0;
    let totalAdSpend = 0, totalAdSpendLW = 0;

    const appIds = Object.keys(appMap).filter(id => !appMap[id].parent_id);

    appIds.forEach(appId => {
      const appInfo = appMap[appId];

      // Revenue
      const rev = getDayValue(revenue, appId, latestDate, 'total');
      const revLW = getDayValue(revenue, appId, lastWeek, 'total');
      const avg7dRev = getAvgValue(revenue, appId, dates7dNoToday, 'total');

      // Downloads
      const dl = getDayValue(sales, appId, latestDate, 'downloads');
      const dlLW = getDayValue(sales, appId, lastWeek, 'downloads');

      // Subscriptions — correct field names from sync data
      const trials = getDayValue(subscriptions, appId, latestDate, 'new_trials');
      const trialsLW = getDayValue(subscriptions, appId, lastWeek, 'new_trials');
      const conv = getDayValue(subscriptions, appId, latestDate, 'new_subscriptions')
                 + getDayValue(subscriptions, appId, latestDate, 'activations');
      const churn = getDayValue(subscriptions, appId, latestDate, 'churn');
      const activeSubs = getDayValue(subscriptions, appId, latestDate, 'active_subscriptions');
      const mrr = getDayValue(subscriptions, appId, latestDate, 'mrr');

      // Ad spend
      const spend = getDayValue(adspend, appId, latestDate, 'spend');
      const spendLW = getDayValue(adspend, appId, lastWeek, 'spend');
      const avg7dSpend = getAvgValue(adspend, appId, dates7dNoToday, 'spend');

      // Funnel data (if available)
      const impressions = getDayValue(funnel, appId, latestDate, 'impressions');
      const cvr = getDayValue(funnel, appId, latestDate, 'conversion_rate');
      const t2p = getDayValue(funnel, appId, latestDate, 'trial_to_paid_rate');

      const netRev = rev - spend;
      const rpd = dl > 0 ? rev / dl : 0;
      const revChange = avg7dRev > 0 ? ((rev - avg7dRev) / avg7dRev) * 100 : (rev > 0 ? 100 : null);

      totalRev += rev; totalRevLW += revLW;
      totalDL += dl; totalDLLW += dlLW;
      totalTrials += trials; totalTrialsLW += trialsLW;
      totalConv += conv; totalChurn += churn;
      totalAdSpend += spend; totalAdSpendLW += spendLW;

      if (rev > 0 || dl > 0 || trials > 0 || spend > 0) {
        appRows.push({
          id: appId,
          name: appInfo.name || `App ${appId}`,
          icon: appInfo.icon || '',
          revenue: rev, revenueLW: revLW, avg7dRev,
          downloads: dl, downloadsLW: dlLW,
          trials, trialsLW, conversions: conv, churn,
          activeSubs, mrr,
          adSpend: spend, netRevenue: netRev, rpd, revChange,
          impressions, cvr, t2p,
        });
      }
    });

    appRows.sort((a, b) => b.revenue - a.revenue);

    const totalNet = totalRev - totalAdSpend;
    const totalNetLW = totalRevLW - totalAdSpendLW;

    // ===== Weather icon =====
    const weather = getWeatherIcon(totalRev, totalRevLW, totalDL, totalDLLW);

    // ===== Edition number =====
    const epoch = new Date('2024-01-01T00:00:00');
    const edition = Math.floor((yesterdayDate - epoch) / 86400000);

    // ===== Render the newspaper =====
    const page = document.createElement('div');
    page.className = 'yesterday-page';

    // Format date
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
      ${heroCard('Conversions', totalConv, null, false, '&#x1F504;')}
      ${heroCard('Ad Spend', totalAdSpend, totalAdSpendLW, true, '&#x1F4A1;', true)}
    `;
    page.appendChild(heroRow);

    // Stories section (from current version — richer data)
    const stories = buildStories(appRows, totalRev, totalRevLW, totalDL, totalDLLW, totalTrials, totalConv, totalChurn);
    if (stories.length > 0) {
      const storiesSection = document.createElement('div');
      storiesSection.className = 'yesterday-headlines';
      storiesSection.innerHTML = `<div class="headlines-header">Headlines</div>`;
      const storyList = document.createElement('div');
      storyList.className = 'headlines-list';
      stories.forEach(s => {
        const item = document.createElement('div');
        item.className = 'headline-item';
        item.innerHTML = `
          <span class="headline-icon">${s.icon}</span>
          <span class="headline-text">${s.headline}${s.detail ? ' — ' + s.detail : ''}</span>
        `;
        storyList.appendChild(item);
      });
      storiesSection.appendChild(storyList);
      page.appendChild(storiesSection);
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

    if (appRows.length > 0) {
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
          render: (val, row) => {
            const revStr = TotoComponents.formatNumber(val, { currency: true });
            const change = row.revChange != null ? wowBadge(val, row.avg7dRev) : '';
            return `${revStr} ${change}`;
          }
        },
        { key: 'downloads', label: 'DLs', align: 'right', format: (val) => TotoComponents.formatNumber(val) },
        { key: 'rpd', label: 'RPD', align: 'right', format: (val) => val > 0 ? TotoComponents.formatNumber(val, { currency: true, compact: false, decimals: 2 }) : '\u2014' },
        { key: 'trials', label: 'Trials', align: 'right', format: (val) => val > 0 ? TotoComponents.formatNumber(val) : '\u2014' },
        { key: 'conversions', label: 'Conv', align: 'right', format: (val) => val > 0 ? TotoComponents.formatNumber(val) : '\u2014' },
        { key: 'impressions', label: 'Impr', align: 'right', format: (val) => val > 0 ? TotoComponents.formatNumber(val) : '\u2014' },
        { key: 'cvr', label: 'CVR', align: 'right', format: (val) => val > 0 ? `${val.toFixed(1)}%` : '\u2014' },
        { key: 't2p', label: 'T2P', align: 'right', format: (val) => val > 0 ? `${val.toFixed(0)}%` : '\u2014' },
        { key: 'adSpend', label: 'Ad Spend', align: 'right', format: (val) => val > 0 ? TotoComponents.formatNumber(val, { currency: true }) : '\u2014' },
        { key: 'netRevenue', label: 'Net', align: 'right', format: (val, row) => {
          const cls = val < 0 ? 'negative' : val > 0 ? 'positive' : '';
          return `<span class="${cls}">${TotoComponents.formatNumber(val, { currency: true })}</span>`;
        }},
      ];

      TotoComponents.renderTable(tableSection, columns, appRows, {
        defaultSort: 'revenue',
        defaultSortDir: 'desc',
        hideZerosField: 'revenue',
      });
    }

    container.appendChild(page);
  }

  // ===== Helper: hero card HTML =====
  function heroCard(label, value, lastWeekValue, isCurrency, iconHtml, invertColor) {
    const formatted = TotoComponents.formatNumber(value, { currency: isCurrency, compact: true });
    const wowStr = lastWeekValue != null ? wowBadge(value, lastWeekValue, invertColor) : '<span class="wow-badge neutral">--</span>';

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

  // ===== W/W percent + badge =====
  function wowPercent(current, lastWeek) {
    if (lastWeek === 0 && current === 0) return 0;
    if (lastWeek === 0) return current > 0 ? 100 : 0;
    return ((current - lastWeek) / Math.abs(lastWeek)) * 100;
  }

  function wowBadge(current, lastWeek, invertColor) {
    const pct = wowPercent(current, lastWeek);
    if (current === 0 && lastWeek === 0) return '<span class="wow-badge neutral">--</span>';
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

  // ===== Weather icon =====
  function getWeatherIcon(rev, revLW, dl, dlLW) {
    const revChange = revLW > 0 ? (rev - revLW) / revLW : 0;
    const dlChange = dlLW > 0 ? (dl - dlLW) / dlLW : 0;
    const composite = (revChange + dlChange) / 2;

    if (composite > 0.15) return { icon: '\u2600\uFE0F', label: 'Great day' };
    if (composite > 0.0) return { icon: '\u{1F324}\uFE0F', label: 'Good day' };
    if (composite > -0.1) return { icon: '\u26C5', label: 'Average day' };
    if (composite > -0.25) return { icon: '\u{1F325}\uFE0F', label: 'Slow day' };
    return { icon: '\u{1F327}\uFE0F', label: 'Rough day' };
  }

  // ===== Story builder =====
  function buildStories(rows, portfolioRev, portfolioRevLW, portfolioDl, portfolioDlLW, portfolioTrials, portfolioConv, portfolioChurn) {
    const stories = [];

    // Portfolio revenue vs last week
    if (portfolioRevLW > 0) {
      const pct = ((portfolioRev - portfolioRevLW) / portfolioRevLW) * 100;
      if (pct > 20) {
        stories.push({ icon: '\u{1F4C8}', headline: `Revenue up ${pct.toFixed(0)}% vs last week`, detail: `$${portfolioRev.toFixed(2)} vs $${portfolioRevLW.toFixed(2)}` });
      } else if (pct < -20) {
        stories.push({ icon: '\u{1F4C9}', headline: `Revenue down ${Math.abs(pct).toFixed(0)}% vs last week`, detail: `$${portfolioRev.toFixed(2)} vs $${portfolioRevLW.toFixed(2)}` });
      }
    }

    // Trial conversions
    if (portfolioConv > 0 && portfolioTrials > 0) {
      const convRate = (portfolioConv / portfolioTrials) * 100;
      stories.push({ icon: '\u{1F504}', headline: `${portfolioConv} trial${portfolioConv !== 1 ? 's' : ''} converted to paid (${convRate.toFixed(0)}% rate)`, detail: `${portfolioTrials} trial starts, ${portfolioChurn} cancellations` });
    } else if (portfolioTrials > 0) {
      stories.push({ icon: '\u{1F3AF}', headline: `${portfolioTrials} new trial${portfolioTrials !== 1 ? 's' : ''} started`, detail: `${portfolioChurn} cancellations` });
    }

    // Top earner
    if (rows.length > 0 && rows[0].revenue > 0) {
      stories.push({ icon: '\u{1F451}', headline: `${shortAppName(rows[0].name)} led with ${TotoComponents.formatNumber(rows[0].revenue, { currency: true })}` });
    }

    // Big movers up
    rows.filter(r => r.revenueLW > 2 && r.revenue > r.revenueLW)
      .map(r => ({ ...r, gain: ((r.revenue - r.revenueLW) / r.revenueLW) * 100 }))
      .sort((a, b) => b.gain - a.gain)
      .slice(0, 2)
      .filter(r => r.gain > 30)
      .forEach(r => {
        stories.push({ icon: '\u{1F680}', headline: `${shortAppName(r.name)} revenue up ${r.gain.toFixed(0)}% vs last week` });
      });

    // Big movers down
    rows.filter(r => r.revenueLW > 5 && r.revenue < r.revenueLW)
      .map(r => ({ ...r, drop: ((r.revenueLW - r.revenue) / r.revenueLW) * 100 }))
      .sort((a, b) => b.drop - a.drop)
      .slice(0, 2)
      .filter(r => r.drop > 30)
      .forEach(r => {
        stories.push({ icon: '\u{26A0}\u{FE0F}', headline: `${shortAppName(r.name)} revenue down ${r.drop.toFixed(0)}% vs last week` });
      });

    // Unprofitable ad spend
    const unprofitable = rows.filter(r => r.adSpend > 0 && r.netRevenue < 0);
    if (unprofitable.length > 0) {
      const names = unprofitable.map(r => shortAppName(r.name)).join(', ');
      const totalLoss = unprofitable.reduce((s, r) => s + r.netRevenue, 0);
      stories.push({ icon: '\u{1F4B8}', headline: `${unprofitable.length} app${unprofitable.length !== 1 ? 's' : ''} spent more on ads than earned`, detail: `${names} — net loss $${Math.abs(totalLoss).toFixed(2)}` });
    }

    // Zero revenue (earned last week)
    const zeroed = rows.filter(r => r.revenue === 0 && r.revenueLW > 5);
    if (zeroed.length > 0) {
      const names = zeroed.map(r => shortAppName(r.name)).slice(0, 3).join(', ');
      stories.push({ icon: '\u{1F6A8}', headline: `${names} had $0 revenue (earned last week)` });
    }

    return stories.slice(0, 8);
  }

  // ===== Data helpers =====
  function findLatestDate(revenue, sales) {
    const dates = new Set();
    [revenue, sales].forEach(source => {
      if (!source) return;
      Object.values(source).forEach(appData => {
        Object.keys(appData).forEach(k => {
          if (/^\d{4}-\d{2}-\d{2}$/.test(k)) dates.add(k);
        });
      });
    });
    const sorted = [...dates].sort();
    return sorted.length > 0 ? sorted[sorted.length - 1] : null;
  }

  function getPrevDates(dateStr, count) {
    const dates = [];
    const d = new Date(dateStr + 'T00:00:00');
    for (let i = count - 1; i >= 0; i--) {
      const prev = new Date(d);
      prev.setDate(prev.getDate() - i);
      dates.push(prev.toISOString().slice(0, 10));
    }
    return dates;
  }

  function getDayValue(source, appId, date, field) {
    if (!source || !source[appId] || !source[appId][date]) return 0;
    return parseFloat(source[appId][date][field]) || 0;
  }

  function getAvgValue(source, appId, dates, field) {
    if (!source || !source[appId] || dates.length === 0) return 0;
    let sum = 0, count = 0;
    dates.forEach(d => {
      if (source[appId]?.[d]) {
        sum += parseFloat(source[appId][d][field]) || 0;
        count++;
      }
    });
    return count > 0 ? sum / count : 0;
  }

  return { render };
})();
