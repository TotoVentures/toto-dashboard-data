/**
 * app.js — Main application for Toto Dashboard
 * Hash-based router, data loader, filter state, nav handling
 */

const TotoApp = (() => {

  // ===== State =====
  const state = {
    currentPage: 'overview',
    data: {
      apps: null,
      sales: null,
      revenue: null,
      subscriptions: null,
      ratings: null,
      summary: null
    },
    filter: {
      selectedApps: [],  // empty = all
      granularity: 'daily',
      startDate: '',
      endDate: ''
    },
    dataLoaded: false,
    isMobileMenuOpen: false,
    highlightedApp: null  // { id, name } or null — persists across pages
  };

  // ===== Data Cache =====
  const dataCache = {};

  async function fetchJSON(path) {
    if (dataCache[path]) return dataCache[path];
    try {
      const resp = await fetch(path);
      if (!resp.ok) return null;
      const data = await resp.json();
      dataCache[path] = data;
      return data;
    } catch (e) {
      console.warn(`Failed to load ${path}:`, e.message);
      return null;
    }
  }

  async function loadAllData() {
    const [apps, sales, revenue, subscriptions, adspend, ratings, summary, funnel, subStates] = await Promise.all([
      fetchJSON('data/apps.json'),
      fetchJSON('data/sales.json'),
      fetchJSON('data/revenue.json'),
      fetchJSON('data/subscriptions.json'),
      fetchJSON('data/adspend.json'),
      fetchJSON('data/ratings.json'),
      fetchJSON('data/summary.json'),
      fetchJSON('data/funnel.json'),
      fetchJSON('data/sub_states.json'),
    ]);

    state.data = { apps, sales, revenue, subscriptions, adspend, ratings, summary, funnel, subStates };
    state.dataLoaded = true;

    // Default to last 30 days
    if (summary && summary.date_range) {
      if (!state.filter.endDate) state.filter.endDate = summary.date_range.end;
      if (!state.filter.startDate) {
        const end = new Date(summary.date_range.end);
        const start = new Date(end);
        start.setDate(start.getDate() - 30);
        state.filter.startDate = start.toISOString().slice(0, 10);
      }
    }

    // Update sync info
    updateSyncInfo(summary);
  }

  function updateSyncInfo(summary) {
    const syncEl = document.getElementById('syncInfo');
    if (!syncEl) return;
    if (summary && summary.sync_date) {
      const d = new Date(summary.sync_date);
      const ago = getTimeAgo(d);
      syncEl.querySelector('.sync-text').textContent = `Synced ${ago}`;
      syncEl.title = `Last sync: ${d.toLocaleString()}`;
    } else {
      syncEl.querySelector('.sync-dot').style.background = '#9CA3AF';
      syncEl.querySelector('.sync-text').textContent = 'No sync data';
    }
  }

  function getTimeAgo(date) {
    const now = new Date();
    const diffMs = now - date;
    const diffMin = Math.floor(diffMs / 60000);
    const diffHr = Math.floor(diffMin / 60);
    const diffDay = Math.floor(diffHr / 24);
    if (diffMin < 1) return 'just now';
    if (diffMin < 60) return `${diffMin}m ago`;
    if (diffHr < 24) return `${diffHr}h ago`;
    if (diffDay < 7) return `${diffDay}d ago`;
    return date.toLocaleDateString();
  }

  // ===== Router =====
  let _suppressHashUpdate = false; // avoid re-render loop when we update hash for filters

  function getPageFromHash() {
    const raw = window.location.hash.replace('#', '') || 'overview';
    const qIdx = raw.indexOf('?');
    return qIdx === -1 ? raw : raw.slice(0, qIdx);
  }

  function parseHashParams() {
    const raw = window.location.hash.replace('#', '') || '';
    const qIdx = raw.indexOf('?');
    if (qIdx === -1) return {};
    const params = {};
    raw.slice(qIdx + 1).split('&').forEach(pair => {
      const [k, v] = pair.split('=');
      if (k) params[decodeURIComponent(k)] = decodeURIComponent(v || '');
    });
    return params;
  }

  /**
   * Compute the default 30-day start date relative to an end date string
   */
  function getDefault30DayStart(endStr) {
    const end = new Date(endStr);
    const start = new Date(end);
    start.setDate(start.getDate() - 30);
    return start.toISOString().slice(0, 10);
  }

  /**
   * Serialize current filter state into URL query params.
   * Only encode non-default values to keep the URL clean.
   */
  function serializeFilters() {
    const parts = [];
    const f = state.filter;
    const defaultEnd = state.data.summary?.date_range?.end || '';
    const defaultStart = defaultEnd ? getDefault30DayStart(defaultEnd) : '';

    if (f.startDate && f.startDate !== defaultStart) {
      parts.push('start=' + encodeURIComponent(f.startDate));
    }
    if (f.endDate && f.endDate !== defaultEnd) {
      parts.push('end=' + encodeURIComponent(f.endDate));
    }
    if (f.granularity && f.granularity !== 'daily') {
      parts.push('gran=' + encodeURIComponent(f.granularity));
    }
    if (f.selectedApps && f.selectedApps.length > 0) {
      // Only encode if not all apps are selected
      const allAppIds = getAppsList().map(a => a.id);
      if (f.selectedApps.length !== allAppIds.length) {
        parts.push('apps=' + encodeURIComponent(f.selectedApps.join(',')));
      }
    }
    if (state.highlightedApp) {
      parts.push('app=' + encodeURIComponent(state.highlightedApp.id));
    }
    return parts.length > 0 ? '?' + parts.join('&') : '';
  }

  /**
   * Update the URL hash with current page + filter state, using replaceState to avoid history spam
   */
  function updateHashFromFilters() {
    const newHash = '#' + state.currentPage + serializeFilters();
    if (window.location.hash !== newHash) {
      _suppressHashUpdate = true;
      history.replaceState(null, '', newHash);
      _suppressHashUpdate = false;
    }
  }

  function navigateTo(page) {
    window.location.hash = page;
  }

  function handleRoute() {
    if (_suppressHashUpdate) return;

    const page = getPageFromHash();
    const pageChanged = page !== state.currentPage;
    state.currentPage = page;

    // Read filter state from hash params on page load / hash change
    const params = parseHashParams();
    if (params.start) state.filter.startDate = params.start;
    if (params.end) state.filter.endDate = params.end;
    if (params.gran) state.filter.granularity = params.gran;
    if (params.apps) {
      state.filter.selectedApps = params.apps.split(',').filter(Boolean);
    }
    if (params.app) {
      const appInfo = state.data.apps?.[params.app];
      state.highlightedApp = { id: params.app, name: appInfo?.name || `App ${params.app}` };
    } else if (!params.app && pageChanged) {
      // Don't clear on same-page re-renders, only if explicitly absent AND page changed
    }

    // Update nav active state
    document.querySelectorAll('.nav-item').forEach(el => {
      el.classList.toggle('active', el.dataset.page === page);
    });

    // Close mobile menu on navigation
    closeMobileMenu();

    // Re-render filter bar on page change (to reset app selector state etc.)
    if (pageChanged) {
      filterBarRendered = false;
    }

    // Render page
    renderCurrentPage();
  }

  // ===== Rendering =====
  let filterBarRendered = false;

  function renderCurrentPage() {
    TotoCharts.destroyAll();
    const pageContent = document.getElementById('pageContent');

    if (!state.dataLoaded) {
      pageContent.innerHTML = '<div class="loading-state"><div class="spinner"></div><p>Loading dashboard data...</p></div>';
      return;
    }

    // Only render filter bar once (or on page change) — don't destroy it on filter changes
    if (!filterBarRendered) {
      const filterBar = document.getElementById('filterBar');
      const appsList = getAppsList();
      TotoComponents.renderFilterBar(filterBar, appsList, state.filter, onFilterChange);
      filterBarRendered = true;
      updateDateRangeIndicator();
    }

    renderPageContent(pageContent);
  }

  function renderPageContent(pageContent) {
    // Render page content
    switch (state.currentPage) {
      case 'yesterday':
        YesterdayPage.render(pageContent, state.data, state.filter);
        break;
      case 'overview':
        OverviewPage.render(pageContent, state.data, state.filter);
        break;
      case 'revenue':
      case 'sales':           // legacy hash redirects
      case 'funnel':
      case 'sub-insights':
        RevenuePage.render(pageContent, state.data, state.filter);
        break;
      case 'subscriptions':
        SubscriptionsPage.render(pageContent, state.data, state.filter);
        break;
      case 'adspend':
        AdSpendPage.render(pageContent, state.data, state.filter);
        break;
      case 'ratings':
        RatingsPage.render(pageContent, state.data, state.filter);
        break;
      default:
        OverviewPage.render(pageContent, state.data, state.filter);
    }
  }

  function onFilterChange(newFilter) {
    state.filter = newFilter;
    // Persist filter state into URL hash (replaceState, no history spam)
    updateHashFromFilters();
    // Update the date range indicator in the filter bar
    updateDateRangeIndicator();
    // Re-render page content only, NOT the filter bar
    TotoCharts.destroyAll();
    const pageContent = document.getElementById('pageContent');
    renderPageContent(pageContent);
  }

  /**
   * Update the date range indicator text in the filter bar
   */
  function updateDateRangeIndicator() {
    const el = document.getElementById('dateRangeIndicator');
    if (!el) return;
    const { startDate, endDate } = state.filter;
    if (!startDate || !endDate) {
      el.textContent = '';
      return;
    }
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const s = new Date(startDate + 'T00:00:00');
    const e = new Date(endDate + 'T00:00:00');
    const days = getDayCount(startDate, endDate);
    const startStr = `${months[s.getMonth()]} ${s.getDate()}`;
    const endStr = `${months[e.getMonth()]} ${e.getDate()}`;
    el.textContent = `${startStr} \u2013 ${endStr} \u00B7 ${days} days`;
  }

  function getAppsList() {
    // Build apps list from apps.json (parent apps with children nested)
    const list = [];
    const seen = new Set();

    if (state.data.apps) {
      Object.entries(state.data.apps).forEach(([id, app]) => {
        if (app.parent_id != null) return;
        if (!seen.has(id)) {
          list.push({
            id,
            name: app.name || `App ${id}`,
            icon: app.icon || '',
            developer: app.developer || '',
            children: app.products || []
          });
          seen.add(id);
        }
      });
    }

    list.sort((a, b) => a.name.localeCompare(b.name));
    return list;
  }

  // ===== Mobile Menu =====
  function toggleMobileMenu() {
    state.isMobileMenuOpen = !state.isMobileMenuOpen;
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('sidebarOverlay');
    const hamburger = document.getElementById('menuToggle');

    sidebar.classList.toggle('open', state.isMobileMenuOpen);
    overlay.classList.toggle('visible', state.isMobileMenuOpen);
    hamburger.classList.toggle('active', state.isMobileMenuOpen);
  }

  function closeMobileMenu() {
    state.isMobileMenuOpen = false;
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('sidebarOverlay');
    const hamburger = document.getElementById('menuToggle');

    if (sidebar) sidebar.classList.remove('open');
    if (overlay) overlay.classList.remove('visible');
    if (hamburger) hamburger.classList.remove('active');
  }

  // ===== Init =====
  function init() {
    // Nav click handlers
    document.querySelectorAll('.nav-item').forEach(el => {
      el.addEventListener('click', (e) => {
        e.preventDefault();
        navigateTo(el.dataset.page);
      });
    });

    // Mobile menu
    document.getElementById('menuToggle').addEventListener('click', toggleMobileMenu);
    document.getElementById('sidebarOverlay').addEventListener('click', closeMobileMenu);

    // Hash change
    window.addEventListener('hashchange', handleRoute);

    // Keyboard navigation
    const pageKeys = { '1': 'yesterday', '2': 'overview', '3': 'revenue', '4': 'subscriptions', '5': 'adspend', '6': 'ratings' };
    const datePresetOrder = [
      { label: '7D', days: 7 },
      { label: '30D', days: 30 },
      { label: '60D', days: 60 },
      { label: '90D', days: 90 },
      { label: '1Y', days: 365 }
    ];

    document.addEventListener('keydown', (e) => {
      const tag = document.activeElement?.tagName?.toLowerCase();
      const isTyping = tag === 'input' || tag === 'textarea' || tag === 'select' || document.activeElement?.isContentEditable;

      if (isTyping) return;

      // Number keys 1-4 for page navigation
      if (pageKeys[e.key]) {
        e.preventDefault();
        navigateTo(pageKeys[e.key]);
        return;
      }

      // Escape to clear app isolation
      if (e.key === 'Escape' && state.highlightedApp) {
        e.preventDefault();
        state.highlightedApp = null;
        updateHashFromFilters();
        renderCurrentPage();
        return;
      }

      // Left/Right arrow keys to cycle date presets
      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        e.preventDefault();
        // Determine current preset index
        const currentDays = state.filter.startDate && state.filter.endDate
          ? Math.round((new Date(state.filter.endDate) - new Date(state.filter.startDate)) / 86400000)
          : 30;
        let idx = datePresetOrder.findIndex(p => p.days === currentDays);
        if (idx === -1) idx = 1; // default to 30D position

        if (e.key === 'ArrowLeft') {
          idx = Math.max(0, idx - 1);
        } else {
          idx = Math.min(datePresetOrder.length - 1, idx + 1);
        }

        const preset = datePresetOrder[idx];
        const end = new Date(state.filter.endDate || new Date().toISOString().slice(0, 10));
        const start = new Date(end);
        start.setDate(start.getDate() - preset.days);
        state.filter.startDate = start.toISOString().slice(0, 10);

        // Update preset buttons visually
        document.querySelectorAll('.date-preset-btn').forEach(btn => {
          btn.classList.toggle('active', btn.textContent === preset.label);
        });
        // Update start date input visually
        const startInput = document.getElementById('filterStartDate');
        if (startInput) startInput.value = state.filter.startDate;

        onFilterChange(state.filter);
      }
    });

    // Load data then render
    loadAllData().then(() => {
      handleRoute();
    });
  }

  document.addEventListener('DOMContentLoaded', init);

  return { state, navigateTo, updateHashFromFilters, renderCurrentPage };
})();


// =============================================================================
// Shared utility functions used across pages
// =============================================================================

/**
 * Shorten an app name — strip subtitle after colon
 * "My Bracket: Tournament Maker" → "My Bracket"
 */
function shortAppName(name) {
  if (!name) return name;
  const colonIdx = name.indexOf(':');
  if (colonIdx > 0) return name.slice(0, colonIdx).trim();
  return name;
}

/**
 * Get the number of days between two date strings
 */
function getDayCount(startStr, endStr) {
  if (!startStr || !endStr) return 1;
  const start = new Date(startStr);
  const end = new Date(endStr);
  const diff = Math.ceil((end - start) / (1000 * 60 * 60 * 24)) + 1;
  return Math.max(diff, 1);
}

/**
 * Get selected app IDs from a data object based on filter state
 */
function getSelectedAppIds(data, filterState) {
  if (!data) return [];
  const allIds = Object.keys(data);
  if (!filterState.selectedApps || filterState.selectedApps.length === 0) return allIds;
  return allIds.filter(id => filterState.selectedApps.includes(id));
}

/**
 * Get dates from a per-app data object filtered by date range
 */
function getFilteredDates(appData, filterState) {
  if (!appData) return [];
  let dates = Object.keys(appData).filter(k => /^\d{4}-\d{2}-\d{2}$/.test(k)).sort();
  if (filterState.startDate) {
    dates = dates.filter(d => d >= filterState.startDate);
  }
  if (filterState.endDate) {
    dates = dates.filter(d => d <= filterState.endDate);
  }
  return dates;
}

/**
 * Generate a continuous date range between startDate and endDate.
 * Ensures charts always span the full selected period even if an app has no data on some days.
 */
function getFullDateRange(filterState) {
  if (!filterState.startDate || !filterState.endDate) return [];
  const dates = [];
  const end = filterState.endDate;
  let cur = new Date(filterState.startDate + 'T00:00:00');
  while (true) {
    const ds = cur.toISOString().slice(0, 10);
    if (ds > end) break;
    dates.push(ds);
    cur.setDate(cur.getDate() + 1);
  }
  return dates;
}

/**
 * Bucket dates by granularity (daily, weekly, monthly)
 */
function bucketDates(sortedDates, granularity) {
  if (!sortedDates || sortedDates.length === 0) return [];

  if (granularity === 'daily') {
    return sortedDates.map(d => ({ label: formatDateLabel(d, 'daily'), dates: [d] }));
  }

  const buckets = [];
  let currentBucket = null;

  sortedDates.forEach(dateStr => {
    const key = granularity === 'weekly' ? getWeekKey(dateStr) : getMonthKey(dateStr);
    if (!currentBucket || currentBucket.key !== key) {
      currentBucket = { key, label: formatDateLabel(dateStr, granularity), dates: [] };
      buckets.push(currentBucket);
    }
    currentBucket.dates.push(dateStr);
  });

  return buckets;
}

function getWeekKey(dateStr) {
  const d = new Date(dateStr);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  const monday = new Date(d.setDate(diff));
  return monday.toISOString().slice(0, 10);
}

function getMonthKey(dateStr) {
  return dateStr.slice(0, 7);
}

function formatDateLabel(dateStr, granularity) {
  const d = new Date(dateStr + 'T00:00:00');
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  if (granularity === 'monthly') {
    return `${months[d.getMonth()]} ${d.getFullYear()}`;
  }
  return `${months[d.getMonth()]} ${d.getDate()}`;
}

/**
 * Build time series chart data: top N apps stacked
 */
function buildTimeSeriesData(dataByProduct, field, apps, filterState, options = {}) {
  const topN = options.topN || 5;
  const appMap = apps || {};
  const selectedApps = getSelectedAppIds(dataByProduct, filterState);

  // Compute totals per app to rank
  const appTotals = {};
  selectedApps.forEach(productId => {
    const appData = dataByProduct[productId];
    if (!appData) return;
    let total = 0;
    const dates = getFilteredDates(appData, filterState);
    dates.forEach(date => {
      total += parseFloat(appData[date]?.[field]) || 0;
    });
    appTotals[productId] = total;
  });

  // Top N by total
  const ranked = Object.entries(appTotals)
    .sort((a, b) => b[1] - a[1]);
  const topApps = ranked.slice(0, topN).map(([id]) => id);
  const otherApps = ranked.slice(topN).map(([id]) => id);
  const topSet = new Set(topApps);

  // Collect ALL dates from all selected apps (not just top N)
  const allDates = new Set();
  selectedApps.forEach(productId => {
    const appData = dataByProduct[productId];
    if (!appData) return;
    getFilteredDates(appData, filterState).forEach(d => allDates.add(d));
  });

  const sortedDates = [...allDates].sort();
  const bucketedDates = bucketDates(sortedDates, filterState.granularity);
  const labels = bucketedDates.map(b => b.label);

  const clampNegative = options.clampNegative === true;
  const datasets = topApps.map((productId, i) => {
    const appData = dataByProduct[productId];
    const appInfo = appMap[productId] || {};
    const name = shortAppName(appInfo.name || `App ${productId}`);

    const rawData = bucketedDates.map(bucket => {
      return bucket.dates.reduce((sum, date) => {
        return sum + (parseFloat(appData?.[date]?.[field]) || 0);
      }, 0);
    });
    const data = clampNegative ? rawData.map(v => v < 0 ? 0 : v) : rawData;

    return { label: name, data, rawData };
  });

  // Add "Other" bucket for remaining apps so totals are accurate
  if (otherApps.length > 0) {
    const otherRaw = bucketedDates.map(bucket => {
      return bucket.dates.reduce((sum, date) => {
        let daySum = 0;
        otherApps.forEach(pid => {
          daySum += parseFloat(dataByProduct[pid]?.[date]?.[field]) || 0;
        });
        return sum + daySum;
      }, 0);
    });
    const otherData = clampNegative ? otherRaw.map(v => v < 0 ? 0 : v) : otherRaw;
    // Only add if there's actual data
    if (otherData.some(v => v > 0) || otherRaw.some(v => v !== 0)) {
      datasets.push({ label: 'Other', data: otherData, rawData: otherRaw });
    }
  }

  // For daily granularity, provide raw dates for weekend shading
  const rawDates = filterState.granularity === 'daily'
    ? bucketedDates.map(b => b.dates[0])
    : null;

  // Compute previous period comparison data if requested
  let previousPeriodData = null;
  if (options.showComparison && filterState.startDate && filterState.endDate) {
    previousPeriodData = computePreviousPeriodTotals(dataByProduct, field, filterState, bucketedDates);
  }

  return { labels, datasets, rawDates, previousPeriodData };
}

/**
 * Aggregate totals across all selected apps for summable fields
 */
function aggregateTotals(dataByProduct, fields, filterState) {
  const selectedApps = getSelectedAppIds(dataByProduct, filterState);
  const totals = {};
  fields.forEach(f => totals[f] = 0);
  let allDates = new Set();

  selectedApps.forEach(productId => {
    const appData = dataByProduct[productId];
    if (!appData) return;
    const dates = getFilteredDates(appData, filterState);
    dates.forEach(d => allDates.add(d));

    dates.forEach(date => {
      const d = appData[date];
      if (!d) return;
      fields.forEach(f => {
        totals[f] += parseFloat(d[f]) || 0;
      });
    });
  });

  const sorted = [...allDates].sort();
  const dayCount = sorted.length >= 2 ? getDayCount(sorted[0], sorted[sorted.length - 1]) : 1;

  return { totals, dayCount };
}

/**
 * Compute period-over-period change %
 * Compare second half vs first half of the date range
 */
function computePeriodChange(dataByProduct, field, filterState) {
  if (!dataByProduct) return null;
  const selectedApps = getSelectedAppIds(dataByProduct, filterState);

  // Collect all dates
  const allDates = new Set();
  selectedApps.forEach(productId => {
    const appData = dataByProduct[productId];
    if (!appData) return;
    getFilteredDates(appData, filterState).forEach(d => allDates.add(d));
  });

  const sortedDates = [...allDates].sort();
  if (sortedDates.length < 4) return null;

  const mid = Math.floor(sortedDates.length / 2);
  const firstHalf = sortedDates.slice(0, mid);
  const secondHalf = sortedDates.slice(mid);

  function sumPeriod(dates) {
    let total = 0;
    selectedApps.forEach(productId => {
      const appData = dataByProduct[productId];
      if (!appData) return;
      dates.forEach(date => {
        total += parseFloat(appData[date]?.[field]) || 0;
      });
    });
    return total;
  }

  const first = sumPeriod(firstHalf);
  const second = sumPeriod(secondHalf);

  if (first === 0) return second > 0 ? 100 : 0;
  return ((second - first) / Math.abs(first)) * 100;
}

/**
 * Compute aggregated totals for the equivalent previous period.
 * Returns an array of numeric values with the same length as bucketedDates.
 * Each value is the total across all selected apps for the corresponding day offset in the prior period.
 */
function computePreviousPeriodTotals(dataByProduct, field, filterState, bucketedDates) {
  if (!filterState.startDate || !filterState.endDate) return null;

  const startMs = new Date(filterState.startDate).getTime();
  const endMs = new Date(filterState.endDate).getTime();
  const rangeMs = endMs - startMs;

  // Previous period: same duration ending the day before current start
  const prevEndMs = startMs - 86400000; // day before current start
  const prevStartMs = prevEndMs - rangeMs;

  const prevFilter = {
    ...filterState,
    startDate: new Date(prevStartMs).toISOString().slice(0, 10),
    endDate: new Date(prevEndMs).toISOString().slice(0, 10)
  };

  const selectedApps = getSelectedAppIds(dataByProduct, prevFilter);

  // Collect all dates in previous period across all apps
  const allPrevDates = new Set();
  selectedApps.forEach(pid => {
    const appData = dataByProduct[pid];
    if (!appData) return;
    getFilteredDates(appData, prevFilter).forEach(d => allPrevDates.add(d));
  });

  const sortedPrevDates = [...allPrevDates].sort();
  const prevBucketed = bucketDates(sortedPrevDates, filterState.granularity);

  // Aggregate totals per bucket across all selected apps
  const prevValues = prevBucketed.map(bucket => {
    let total = 0;
    selectedApps.forEach(pid => {
      const appData = dataByProduct[pid];
      if (!appData) return;
      bucket.dates.forEach(date => {
        total += parseFloat(appData[date]?.[field]) || 0;
      });
    });
    return total;
  });

  // Align to current period bucket count: pad or truncate
  const result = [];
  for (let i = 0; i < bucketedDates.length; i++) {
    result.push(i < prevValues.length ? prevValues[i] : 0);
  }

  return result;
}
