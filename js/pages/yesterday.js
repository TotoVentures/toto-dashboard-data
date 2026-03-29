/**
 * yesterday.js — The Daily Toto
 * Morning briefing: what happened yesterday, what needs attention.
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

    // Compute 7-day window ending at latestDate
    const dates7d = getPrevDates(latestDate, 7);
    const dates7dNoToday = dates7d.slice(0, -1); // previous 6 days for comparison

    // --- Header ---
    const header = document.createElement('div');
    header.className = 'yesterday-header';
    const d = new Date(latestDate + 'T00:00:00');
    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    header.innerHTML = `
      <h1 class="page-title">The Daily Toto</h1>
      <p class="page-subtitle">${dayNames[d.getDay()]}, ${monthNames[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}</p>
    `;
    container.appendChild(header);

    // --- Collect per-app data for the day ---
    const appIds = Object.keys(apps || {}).filter(id => {
      const app = apps[id];
      return !app.parent_id;
    });

    const rows = [];
    let portfolioRev = 0, portfolioDl = 0, portfolioTrials = 0, portfolioConv = 0;
    let portfolioAdSpend = 0, portfolioCancels = 0, portfolioActiveSubs = 0;
    let portfolio7dRev = 0, portfolio7dDl = 0, portfolio7dTrials = 0, portfolio7dAdSpend = 0;

    appIds.forEach(id => {
      const appInfo = apps[id] || {};
      const dayRev = getDayValue(revenue, id, latestDate, 'total');
      const dayDl = getDayValue(sales, id, latestDate, 'downloads') + getDayValue(sales, id, latestDate, 're_downloads');
      const dayTrials = getDayValue(data.subscriptions, id, latestDate, 'trial_starts') || getDayMetric(data, id, latestDate, 'trial_starts');
      const dayConv = getDayValue(data.subscriptions, id, latestDate, 'paid_conversions') || getDayMetric(data, id, latestDate, 'paid_conversions');
      const dayCancels = getDayMetric(data, id, latestDate, 'cancellations');
      const dayAdSpend = getDayValue(adspend, id, latestDate, 'spend');
      const dayActiveSubs = getDayMetric(data, id, latestDate, 'active_subs');

      // 7-day averages
      const avg7dRev = getAvgValue(revenue, id, dates7dNoToday, 'total');
      const avg7dDl = getAvgValue(sales, id, dates7dNoToday, 'downloads') + getAvgValue(sales, id, dates7dNoToday, 're_downloads');
      const avg7dAdSpend = getAvgValue(adspend, id, dates7dNoToday, 'spend');

      // Funnel data
      const dayImpressions = getDayValue(funnel, id, latestDate, 'impressions');
      const dayTrueFirstDl = getDayValue(funnel, id, latestDate, 'first_time_downloads');
      const dayTTR = getDayValue(funnel, id, latestDate, 'tap_through_rate');
      const dayCVR = getDayValue(funnel, id, latestDate, 'conversion_rate');
      const dayT2P = getDayValue(funnel, id, latestDate, 'trial_to_paid_rate');

      // Source attribution
      let topSource = '';
      let topSourcePct = 0;
      const bySource = funnel?.[id]?.[latestDate]?.by_source;
      if (bySource) {
        const totalSourceDl = Object.values(bySource).reduce((s, v) => s + (v.downloads || 0), 0);
        Object.entries(bySource).forEach(([src, v]) => {
          const pct = totalSourceDl > 0 ? (v.downloads || 0) / totalSourceDl * 100 : 0;
          if (pct > topSourcePct) { topSource = src; topSourcePct = pct; }
        });
      }

      // Sub state
      const dayActivePaid = getDayValue(subStates, id, latestDate, 'active_paid');

      const netRev = dayRev - dayAdSpend;
      const rpd = dayDl > 0 ? dayRev / dayDl : 0;

      // Revenue change vs 7d avg
      const revChange = avg7dRev > 0 ? ((dayRev - avg7dRev) / avg7dRev) * 100 : (dayRev > 0 ? 100 : null);
      const dlChange = avg7dDl > 0 ? ((dayDl - avg7dDl) / avg7dDl) * 100 : (dayDl > 0 ? 100 : null);

      portfolioRev += dayRev;
      portfolioDl += dayDl;
      portfolioTrials += dayTrials;
      portfolioConv += dayConv;
      portfolioAdSpend += dayAdSpend;
      portfolioCancels += dayCancels;
      portfolioActiveSubs += dayActiveSubs;
      portfolio7dRev += avg7dRev;
      portfolio7dDl += avg7dDl;
      portfolio7dAdSpend += avg7dAdSpend;

      if (dayRev > 0 || dayDl > 0 || dayTrials > 0 || dayAdSpend > 0 || dayImpressions > 0) {
        rows.push({
          id, name: appInfo.name || `App ${id}`, icon: appInfo.icon || '',
          revenue: dayRev, downloads: dayDl, trials: dayTrials, conversions: dayConv,
          cancellations: dayCancels, adSpend: dayAdSpend, netRevenue: netRev, rpd,
          revChange, dlChange, avg7dRev, activeSubs: dayActiveSubs,
          impressions: dayImpressions, trueFirstDl: dayTrueFirstDl,
          ttr: dayTTR, cvr: dayCVR, t2p: dayT2P,
          topSource, topSourcePct, activePaid: dayActivePaid,
        });
      }
    });

    const portfolioNet = portfolioRev - portfolioAdSpend;
    const portfolioRevChange = portfolio7dRev > 0 ? ((portfolioRev - portfolio7dRev) / portfolio7dRev) * 100 : null;
    const portfolioDlChange = portfolio7dDl > 0 ? ((portfolioDl - portfolio7dDl) / portfolio7dDl) * 100 : null;
    const portfolioNetChange = (portfolio7dRev - portfolio7dAdSpend) > 0
      ? ((portfolioNet - (portfolio7dRev - portfolio7dAdSpend)) / Math.abs(portfolio7dRev - portfolio7dAdSpend)) * 100 : null;

    // --- KPI Cards ---
    const metrics = [
      { label: 'Net Revenue', field: 'net', value: portfolioNet, changePercent: portfolioNetChange, isCurrency: true, description: 'Revenue minus ad spend, vs 7-day avg' },
      { label: 'Revenue', field: 'rev', value: portfolioRev, changePercent: portfolioRevChange, isCurrency: true, description: 'Total proceeds, vs 7-day avg' },
      { label: 'Downloads', field: 'dl', value: portfolioDl, changePercent: portfolioDlChange, isCurrency: false, description: 'New + re-downloads, vs 7-day avg' },
      { label: 'Trial Starts', field: 'trials', value: portfolioTrials, isCurrency: false, description: 'Subscription trials started' },
      { label: 'Conversions', field: 'conv', value: portfolioConv, isCurrency: false, description: 'Trials converted to paid' },
    ];
    TotoComponents.renderKPICards(container, metrics, {});

    // --- Stories Section ---
    const stories = buildStories(rows, portfolioRev, portfolio7dRev, portfolioDl, portfolio7dDl, portfolioTrials, portfolioConv, portfolioCancels);
    if (stories.length > 0) {
      const storiesSection = document.createElement('div');
      storiesSection.className = 'yesterday-stories';
      storiesSection.innerHTML = `<h2 class="section-title">What Happened</h2>`;
      const storyList = document.createElement('div');
      storyList.className = 'story-cards';
      stories.forEach(s => {
        const card = document.createElement('div');
        card.className = `story-card story-${s.type}`;
        card.innerHTML = `
          <div class="story-icon">${s.icon}</div>
          <div class="story-body">
            <div class="story-headline">${s.headline}</div>
            <div class="story-detail">${s.detail}</div>
          </div>
        `;
        storyList.appendChild(card);
      });
      storiesSection.appendChild(storyList);
      container.appendChild(storiesSection);
    }

    // --- App Table ---
    rows.sort((a, b) => b.revenue - a.revenue);

    if (rows.length > 0) {
      const maxRev = Math.max(...rows.map(r => r.revenue), 1);

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
            const change = row.revChange != null ? TotoComponents.formatChange(row.revChange) : '';
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

      TotoComponents.renderTable(container, columns, rows, {
        title: 'App Scorecard',
        defaultSort: 'revenue',
        defaultSortDir: 'desc',
        hideZerosField: 'revenue',
      });
    }
  }

  // --- Helpers ---

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

  function getDayMetric(data, appId, date, field) {
    // Try daily_metrics-style data if available
    if (data.metrics && data.metrics[appId] && data.metrics[appId][date]) {
      return parseFloat(data.metrics[appId][date][field]) || 0;
    }
    // Try subscriptions data
    if (data.subscriptions && data.subscriptions[appId] && data.subscriptions[appId][date]) {
      return parseFloat(data.subscriptions[appId][date][field]) || 0;
    }
    return 0;
  }

  function getAvgValue(source, appId, dates, field) {
    if (!source || !source[appId] || dates.length === 0) return 0;
    let sum = 0, count = 0;
    dates.forEach(d => {
      const val = parseFloat(source[appId]?.[d]?.[field]) || 0;
      if (source[appId]?.[d]) { sum += val; count++; }
    });
    return count > 0 ? sum / count : 0;
  }

  // --- Story Builder ---

  function buildStories(rows, portfolioRev, avg7dRev, portfolioDl, avg7dDl, portfolioTrials, portfolioConv, portfolioCancels) {
    const stories = [];

    // Portfolio-level stories
    if (avg7dRev > 0) {
      const pct = ((portfolioRev - avg7dRev) / avg7dRev) * 100;
      if (pct > 20) {
        stories.push({
          type: 'positive', icon: '\u{1F4C8}',
          headline: `Revenue up ${pct.toFixed(0)}% vs 7-day average`,
          detail: `$${portfolioRev.toFixed(2)} yesterday vs $${avg7dRev.toFixed(2)} avg`
        });
      } else if (pct < -20) {
        stories.push({
          type: 'negative', icon: '\u{1F4C9}',
          headline: `Revenue down ${Math.abs(pct).toFixed(0)}% vs 7-day average`,
          detail: `$${portfolioRev.toFixed(2)} yesterday vs $${avg7dRev.toFixed(2)} avg`
        });
      }
    }

    if (portfolioConv > 0 && portfolioTrials > 0) {
      const convRate = (portfolioConv / portfolioTrials) * 100;
      stories.push({
        type: 'neutral', icon: '\u{1F504}',
        headline: `${portfolioConv} trial${portfolioConv !== 1 ? 's' : ''} converted to paid (${convRate.toFixed(0)}% rate)`,
        detail: `${portfolioTrials} trial starts, ${portfolioConv} conversions, ${portfolioCancels} cancellations`
      });
    }

    // Per-app standouts
    const bigMoversUp = rows
      .filter(r => r.revChange != null && r.revChange > 50 && r.revenue > 5)
      .sort((a, b) => b.revChange - a.revChange)
      .slice(0, 3);

    bigMoversUp.forEach(r => {
      stories.push({
        type: 'positive', icon: '\u{1F680}',
        headline: `${shortAppName(r.name)} revenue +${r.revChange.toFixed(0)}%`,
        detail: `$${r.revenue.toFixed(2)} yesterday vs $${r.avg7dRev.toFixed(2)} avg`
      });
    });

    const bigMoversDown = rows
      .filter(r => r.revChange != null && r.revChange < -40 && r.avg7dRev > 5)
      .sort((a, b) => a.revChange - b.revChange)
      .slice(0, 3);

    bigMoversDown.forEach(r => {
      stories.push({
        type: 'negative', icon: '\u{26A0}\u{FE0F}',
        headline: `${shortAppName(r.name)} revenue ${r.revChange.toFixed(0)}%`,
        detail: `$${r.revenue.toFixed(2)} yesterday vs $${r.avg7dRev.toFixed(2)} avg`
      });
    });

    // Apps spending more on ads than they earned
    const unprofitable = rows
      .filter(r => r.adSpend > 0 && r.netRevenue < 0)
      .sort((a, b) => a.netRevenue - b.netRevenue);

    if (unprofitable.length > 0) {
      const names = unprofitable.map(r => shortAppName(r.name)).join(', ');
      const totalLoss = unprofitable.reduce((s, r) => s + r.netRevenue, 0);
      stories.push({
        type: 'warning', icon: '\u{1F4B8}',
        headline: `${unprofitable.length} app${unprofitable.length !== 1 ? 's' : ''} spent more on ads than earned`,
        detail: `${names} — net loss $${Math.abs(totalLoss).toFixed(2)}`
      });
    }

    // Best-converting apps (funnel)
    const bestCVR = rows
      .filter(r => r.cvr > 0 && r.impressions >= 50)
      .sort((a, b) => b.cvr - a.cvr)
      .slice(0, 2);

    bestCVR.forEach(r => {
      stories.push({
        type: 'positive', icon: '\u{1F3AF}',
        headline: `${shortAppName(r.name)}: ${r.cvr.toFixed(1)}% conversion rate`,
        detail: `${TotoComponents.formatNumber(r.impressions)} impressions \u2192 ${r.trueFirstDl} downloads`
      });
    });

    // Source attribution highlights
    const searchDominated = rows
      .filter(r => r.topSourcePct >= 80 && r.trueFirstDl >= 5 && r.topSource === 'App Store search')
      .slice(0, 1);

    searchDominated.forEach(r => {
      stories.push({
        type: 'neutral', icon: '\u{1F50D}',
        headline: `${shortAppName(r.name)}: ${r.topSourcePct.toFixed(0)}% of downloads from search`,
        detail: `ASO is working \u2014 ${r.trueFirstDl} first-time downloads`
      });
    });

    // High RPD apps (noteworthy performers)
    const highRPD = rows
      .filter(r => r.rpd > 1 && r.downloads >= 3)
      .sort((a, b) => b.rpd - a.rpd)
      .slice(0, 2);

    highRPD.forEach(r => {
      stories.push({
        type: 'positive', icon: '\u{1F4B0}',
        headline: `${shortAppName(r.name)}: $${r.rpd.toFixed(2)} revenue per download`,
        detail: `${r.downloads} downloads generating $${r.revenue.toFixed(2)}`
      });
    });

    return stories;
  }

  return { render };
})();
