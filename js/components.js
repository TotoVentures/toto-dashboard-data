/**
 * components.js — Reusable UI components for Toto Dashboard
 */

const TotoComponents = (() => {

  /**
   * Format a number for display
   * 1234 -> "1,234"
   * 1234567 -> "1.2M"
   * 1234 with currency -> "$1,234"
   */
  function formatNumber(num, options = {}) {
    if (num == null || isNaN(num)) return '--';
    const { compact = true, currency = false, decimals } = options;

    const absNum = Math.abs(num);
    let formatted;

    if (compact && absNum >= 1000000) {
      formatted = (num / 1000000).toFixed(1) + 'M';
    } else if (compact && absNum >= 100000) {
      formatted = (num / 1000).toFixed(0) + 'K';
    } else if (compact && absNum >= 10000) {
      formatted = (num / 1000).toFixed(1) + 'K';
    } else {
      const d = decimals != null ? decimals : (currency ? 2 : 0);
      formatted = num.toLocaleString('en-US', {
        minimumFractionDigits: d,
        maximumFractionDigits: d
      });
    }

    return currency ? '$' + formatted : formatted;
  }

  /**
   * Format a percentage change with color and arrow
   */
  function formatChange(percent) {
    if (percent == null || isNaN(percent)) {
      return '<span class="kpi-change neutral">--</span>';
    }
    const isPositive = percent > 0;
    const isNegative = percent < 0;
    const cls = isPositive ? 'positive' : isNegative ? 'negative' : 'neutral';
    const arrow = isPositive ? '\u2191' : isNegative ? '\u2193' : '';
    const sign = isPositive ? '+' : '';
    return `<span class="kpi-change ${cls}">${arrow} ${sign}${percent.toFixed(1)}%</span>`;
  }

  /**
   * Ease-out exponential curve for KPI counter animation
   */
  function easeOutExpo(t) {
    return t >= 1 ? 1 : 1 - Math.pow(2, -10 * t);
  }

  /**
   * Animate a KPI value from 0 to its final value
   */
  function animateKPIValue(el, targetValue, isCurrency, duration = 600) {
    if (targetValue == null || isNaN(targetValue) || targetValue === 0) return;

    const startTime = performance.now();
    const isInteger = !isCurrency && Number.isInteger(targetValue);

    function tick(now) {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const easedProgress = easeOutExpo(progress);
      const currentValue = easedProgress * targetValue;

      el.textContent = formatNumber(
        isInteger ? Math.round(currentValue) : currentValue,
        { currency: isCurrency, compact: true }
      );

      if (progress < 1) {
        requestAnimationFrame(tick);
      }
    }

    // Start from 0
    el.textContent = formatNumber(0, { currency: isCurrency, compact: true });
    requestAnimationFrame(tick);
  }

  /**
   * Dismiss any open KPI info tooltip
   */
  function dismissKPIInfoTooltip() {
    const existing = document.querySelector('.kpi-info-tooltip');
    if (existing) existing.remove();
  }

  /**
   * Render the horizontal scrollable KPI card row
   * @param {HTMLElement} container
   * @param {Array} metrics - [{ label, value, perDay, allTime, changePercent, isCurrency, description }]
   */
  function renderKPICards(container, metrics, options = {}) {
    const row = document.createElement('div');
    row.className = 'kpi-row';
    const { onSelect, activeField } = options;

    metrics.forEach((m, idx) => {
      const valueStr = formatNumber(m.value, { currency: m.isCurrency, compact: true });
      const perDayStr = m.perDay != null ? formatNumber(m.perDay, { currency: m.isCurrency, compact: false, decimals: m.isCurrency ? 2 : 0 }) : null;
      const allTimeStr = m.allTime != null ? formatNumber(m.allTime, { currency: m.isCurrency, compact: true }) : null;

      // Raw value for clipboard copy
      const rawValue = m.value != null ? (m.isCurrency ? m.value.toFixed(2) : String(m.value)) : '';

      const card = document.createElement('div');
      const isActive = activeField && m.field === activeField;
      card.className = 'kpi-card' + (onSelect ? ' kpi-clickable' : '') + (isActive ? ' kpi-active' : '');
      card.innerHTML = `
        <div class="kpi-header">
          <span class="kpi-label">${escapeHtml(m.label)}</span>
          <svg class="kpi-info${m.description ? ' kpi-info-clickable' : ''}" viewBox="0 0 16 16" fill="currentColor"><circle cx="8" cy="8" r="7" fill="none" stroke="currentColor" stroke-width="1.5"/><text x="8" y="12" font-size="10" text-anchor="middle" fill="currentColor">i</text></svg>
        </div>
        ${formatChange(m.changePercent)}
        <div class="kpi-value" data-raw="${escapeHtml(rawValue)}">${valueStr}</div>
        ${perDayStr != null ? `<div class="kpi-per-day">${perDayStr} per day</div>` : ''}
        ${allTimeStr != null ? `<div class="kpi-alltime">${allTimeStr} All-time</div>` : ''}
      `;

      // Info tooltip on the info icon
      if (m.description) {
        const infoIcon = card.querySelector('.kpi-info');
        infoIcon.addEventListener('click', (e) => {
          e.stopPropagation();
          dismissKPIInfoTooltip();

          const tooltip = document.createElement('div');
          tooltip.className = 'kpi-info-tooltip';
          tooltip.textContent = m.description;

          // Position relative to the info icon's parent (kpi-header)
          const header = card.querySelector('.kpi-header');
          header.style.position = 'relative';
          header.appendChild(tooltip);

          // Auto-dismiss after 3 seconds
          const autoDismiss = setTimeout(() => tooltip.remove(), 3000);

          // Dismiss on click elsewhere
          const dismissHandler = (ev) => {
            if (!tooltip.contains(ev.target)) {
              tooltip.remove();
              clearTimeout(autoDismiss);
              document.removeEventListener('click', dismissHandler, true);
            }
          };
          // Delay adding the listener so this click doesn't immediately dismiss
          setTimeout(() => document.addEventListener('click', dismissHandler, true), 0);
        });
      }

      if (onSelect && m.field) {
        card.addEventListener('click', () => {
          row.querySelectorAll('.kpi-card').forEach(c => c.classList.remove('kpi-active'));
          card.classList.add('kpi-active');
          onSelect(m.field, m);
        });
      }

      row.appendChild(card);

      // Animate the KPI value from 0 on initial render
      const valueEl = card.querySelector('.kpi-value');
      if (valueEl && m.value != null && m.value !== 0) {
        animateKPIValue(valueEl, m.value, m.isCurrency);
      }
    });

    container.appendChild(row);

    // Return an object with an update method for in-place KPI value changes
    row.updateValues = function(newMetrics) {
      newMetrics.forEach(m => {
        if (!m.field) return;
        // Find the card for this field
        const cards = row.querySelectorAll('.kpi-card');
        const card = Array.from(cards).find((c, i) => metrics[i]?.field === m.field);
        if (!card) return;

        // Update the value
        const valueEl = card.querySelector('.kpi-value');
        if (valueEl) {
          const rawValue = m.value != null ? (m.isCurrency ? m.value.toFixed(2) : String(m.value)) : '';
          valueEl.setAttribute('data-raw', rawValue);
          animateKPIValue(valueEl, m.value, m.isCurrency);
        }

        // Update per-day
        const perDayEl = card.querySelector('.kpi-per-day');
        if (perDayEl && m.perDay != null) {
          perDayEl.textContent = formatNumber(m.perDay, { currency: m.isCurrency, compact: false, decimals: m.isCurrency ? 2 : 0 }) + ' per day';
        } else if (perDayEl && m.perDay == null) {
          perDayEl.textContent = '';
        }

        // Update change badge
        const existingBadge = card.querySelector('.kpi-change');
        if (existingBadge) {
          const newBadgeHTML = formatChange(m.changePercent);
          const temp = document.createElement('div');
          temp.innerHTML = newBadgeHTML;
          const newBadge = temp.firstElementChild;
          if (newBadge) {
            existingBadge.replaceWith(newBadge);
          }
        }

        // Sync metrics array so future field lookups stay correct
        const mIdx = metrics.findIndex(x => x.field === m.field);
        if (mIdx !== -1) {
          metrics[mIdx].value = m.value;
          metrics[mIdx].perDay = m.perDay;
          metrics[mIdx].changePercent = m.changePercent;
        }
      });
    };

    return row;
  }

  /**
   * Render the filter bar
   * @param {HTMLElement} container
   * @param {Array} apps - [{ id, name, icon }]
   * @param {Object} state - { selectedApps, granularity, startDate, endDate }
   * @param {Function} onChange - callback when filters change
   */
  function renderFilterBar(container, apps, state, onChange) {
    container.innerHTML = '';

    // App selector
    const appSelectorEl = renderAppSelector(apps, state.selectedApps, (selected) => {
      state.selectedApps = selected;
      onChange(state);
    });
    container.appendChild(appSelectorEl);

    // Granularity
    const granGroup = document.createElement('div');
    granGroup.className = 'filter-group';
    granGroup.innerHTML = `
      <span class="filter-label">Granularity</span>
      <select class="filter-select" id="filterGranularity">
        <option value="daily" ${state.granularity === 'daily' ? 'selected' : ''}>Daily</option>
        <option value="weekly" ${state.granularity === 'weekly' ? 'selected' : ''}>Weekly</option>
        <option value="monthly" ${state.granularity === 'monthly' ? 'selected' : ''}>Monthly</option>
      </select>
    `;
    container.appendChild(granGroup);

    // Date presets
    const presets = [
      { label: '7D', days: 7 },
      { label: '30D', days: 30 },
      { label: '60D', days: 60 },
      { label: '90D', days: 90 },
      { label: '1Y', days: 365 },
    ];
    const presetGroup = document.createElement('div');
    presetGroup.className = 'filter-group';
    presetGroup.innerHTML = `<span class="filter-label">Period</span>`;
    const presetBtns = document.createElement('div');
    presetBtns.className = 'date-presets';

    // Figure out which preset is currently active
    function activeDays() {
      if (!state.startDate || !state.endDate) return null;
      const ms = new Date(state.endDate) - new Date(state.startDate);
      return Math.round(ms / 86400000);
    }
    const currentDays = activeDays();

    presets.forEach(p => {
      const btn = document.createElement('button');
      btn.className = 'date-preset-btn' + (currentDays === p.days ? ' active' : '');
      btn.textContent = p.label;
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const end = new Date(state.endDate || new Date().toISOString().slice(0, 10));
        const start = new Date(end);
        start.setDate(start.getDate() - p.days);
        state.startDate = start.toISOString().slice(0, 10);
        // Update the date inputs visually
        const startInput = container.querySelector('#filterStartDate');
        if (startInput) startInput.value = state.startDate;
        // Highlight active button
        presetBtns.querySelectorAll('.date-preset-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        onChange(state);
      });
      presetBtns.appendChild(btn);
    });
    presetGroup.appendChild(presetBtns);
    container.appendChild(presetGroup);

    // Date range
    const dateGroup = document.createElement('div');
    dateGroup.className = 'filter-group';
    dateGroup.innerHTML = `
      <span class="filter-label">From</span>
      <input type="date" class="filter-input" id="filterStartDate" value="${state.startDate || ''}">
      <span class="filter-label">to</span>
      <input type="date" class="filter-input" id="filterEndDate" value="${state.endDate || ''}">
    `;
    container.appendChild(dateGroup);

    // Spacer
    const spacer = document.createElement('div');
    spacer.className = 'filter-spacer';
    container.appendChild(spacer);

    // Date range indicator (far right of filter bar)
    const dateIndicator = document.createElement('div');
    dateIndicator.className = 'date-range-indicator';
    dateIndicator.id = 'dateRangeIndicator';
    container.appendChild(dateIndicator);

    // Events
    container.querySelector('#filterGranularity').addEventListener('change', (e) => {
      state.granularity = e.target.value;
      onChange(state);
    });
    container.querySelector('#filterStartDate').addEventListener('change', (e) => {
      state.startDate = e.target.value;
      // Clear active preset when manual date change
      presetBtns.querySelectorAll('.date-preset-btn').forEach(b => b.classList.remove('active'));
      onChange(state);
    });
    container.querySelector('#filterEndDate').addEventListener('change', (e) => {
      state.endDate = e.target.value;
      presetBtns.querySelectorAll('.date-preset-btn').forEach(b => b.classList.remove('active'));
      onChange(state);
    });
  }

  /**
   * App multi-select dropdown
   */
  function renderAppSelector(apps, selectedIds, onChange) {
    const wrapper = document.createElement('div');
    wrapper.className = 'app-selector filter-group';

    const allSelected = !selectedIds || selectedIds.length === 0 || selectedIds.length === apps.length;
    const countText = allSelected ? 'All Apps' : `${selectedIds.length} app${selectedIds.length > 1 ? 's' : ''}`;

    wrapper.innerHTML = `
      <span class="filter-label">Apps</span>
      <div class="app-selector-trigger" tabindex="0">
        ${!allSelected ? `<span class="app-selector-count">${selectedIds.length}</span>` : ''}
        <span class="app-selector-text">${countText}</span>
        <svg width="12" height="12" viewBox="0 0 12 12" fill="#6B7280"><path d="M3 5l3 3 3-3"/></svg>
      </div>
      <div class="app-selector-dropdown">
        <div class="app-select-actions">
          <button class="select-all-btn">Select All</button>
          <button class="select-none-btn">Clear</button>
        </div>
        <input type="text" class="app-selector-search" placeholder="Search apps...">
        <div class="app-selector-list"></div>
      </div>
    `;

    const trigger = wrapper.querySelector('.app-selector-trigger');
    const dropdown = wrapper.querySelector('.app-selector-dropdown');
    const list = wrapper.querySelector('.app-selector-list');
    const searchInput = wrapper.querySelector('.app-selector-search');
    const currentSelected = new Set(allSelected ? apps.map(a => a.id) : selectedIds);

    function renderList(filter = '') {
      const lowerFilter = filter.toLowerCase();
      // Filter apps: show parent if parent name matches OR any child name matches
      const filtered = apps.filter(a => {
        if (a.name.toLowerCase().includes(lowerFilter)) return true;
        if (a.children && a.children.some(c => c.name.toLowerCase().includes(lowerFilter))) return true;
        return false;
      });

      list.innerHTML = filtered.map(app => {
        const childrenHtml = (app.children || [])
          .filter(c => !filter || c.name.toLowerCase().includes(lowerFilter) || app.name.toLowerCase().includes(lowerFilter))
          .map(c => `
            <div class="app-selector-child">
              <span class="app-child-name">${escapeHtml(c.name)}</span>
            </div>
          `).join('');

        return `
          <div class="app-selector-group">
            <label class="app-selector-option app-selector-parent">
              <input type="checkbox" value="${app.id}" ${currentSelected.has(app.id) ? 'checked' : ''}>
              ${app.icon ? `<img class="app-icon-small" src="${escapeHtml(app.icon)}" alt="" onerror="this.style.display='none'">` : ''}
              <span class="app-name-small">${escapeHtml(app.name)}</span>
            </label>
            ${childrenHtml}
          </div>
        `;
      }).join('');

      list.querySelectorAll('input[type="checkbox"]').forEach(cb => {
        cb.addEventListener('click', (e) => e.stopPropagation());
        cb.addEventListener('change', () => {
          if (cb.checked) {
            currentSelected.add(cb.value);
          } else {
            currentSelected.delete(cb.value);
          }
          updateTrigger();
          onChange(Array.from(currentSelected));
        });
      });
    }

    function updateTrigger() {
      const count = currentSelected.size;
      const isAll = count === apps.length || count === 0;
      const triggerEl = wrapper.querySelector('.app-selector-trigger');
      const countEl = triggerEl.querySelector('.app-selector-count');
      const textEl = triggerEl.querySelector('.app-selector-text');
      if (isAll) {
        if (countEl) countEl.remove();
        textEl.textContent = 'All Apps';
      } else {
        textEl.textContent = `${count} app${count > 1 ? 's' : ''}`;
        if (!countEl) {
          const badge = document.createElement('span');
          badge.className = 'app-selector-count';
          badge.textContent = count;
          triggerEl.insertBefore(badge, textEl);
        } else {
          countEl.textContent = count;
        }
      }
    }

    trigger.addEventListener('click', (e) => {
      e.stopPropagation();
      dropdown.classList.toggle('open');
      if (dropdown.classList.contains('open')) {
        searchInput.focus();
      }
    });

    document.addEventListener('click', (e) => {
      if (!wrapper.contains(e.target)) {
        dropdown.classList.remove('open');
      }
    });

    searchInput.addEventListener('input', () => renderList(searchInput.value));

    wrapper.querySelector('.select-all-btn').addEventListener('click', (e) => {
      e.stopPropagation();
      apps.forEach(a => currentSelected.add(a.id));
      renderList(searchInput.value);
      updateTrigger();
      onChange(Array.from(currentSelected));
    });

    wrapper.querySelector('.select-none-btn').addEventListener('click', (e) => {
      e.stopPropagation();
      currentSelected.clear();
      renderList(searchInput.value);
      updateTrigger();
      onChange(Array.from(currentSelected));
    });

    renderList();
    return wrapper;
  }

  /**
   * Render a sortable data table
   * @param {HTMLElement} container
   * @param {Array} columns - [{ key, label, align, format, barMax }]
   * @param {Array} rows - [{ ...data }]
   * @param {Object} options - { title, onRowClick, hideZerosField, selectedRowId }
   */
  function renderTable(container, columns, rows, options = {}) {
    const tableContainer = document.createElement('div');
    tableContainer.className = 'table-container';

    if (options.title) {
      const titleRow = document.createElement('div');
      titleRow.className = 'table-title-row';
      const titleEl = document.createElement('div');
      titleEl.className = 'table-title';
      titleEl.textContent = options.title;
      titleRow.appendChild(titleEl);

      const csvBtn = document.createElement('button');
      csvBtn.className = 'csv-export-btn';
      csvBtn.title = 'Export CSV';
      csvBtn.innerHTML = '<svg viewBox="0 0 16 16" width="14" height="14" fill="currentColor"><path d="M2 14h12v-2H2v2zm6-10v4h2.5L8 12 5.5 8H8V4h2z"/></svg> CSV';
      csvBtn.addEventListener('click', () => {
        const headers = columns.map(c => c.label);
        const csvRows = [headers.join(',')];
        sortedRows.forEach(row => {
          const vals = columns.map(col => {
            let v = row[col.key];
            if (v == null) v = '';
            v = String(v).replace(/"/g, '""');
            return `"${v}"`;
          });
          csvRows.push(vals.join(','));
        });
        const blob = new Blob([csvRows.join('\n')], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = (options.title || 'export').replace(/\s+/g, '_').toLowerCase() + '.csv';
        a.click();
        URL.revokeObjectURL(url);
      });
      titleRow.appendChild(csvBtn);
      tableContainer.appendChild(titleRow);
    }

    // Hide zeros toggle
    let hideZeros = options.hideZerosField ? true : false;
    if (options.hideZerosField) {
      const toggleBar = document.createElement('div');
      toggleBar.className = 'table-toggle-bar';
      toggleBar.innerHTML = `
        <label class="hide-zeros-toggle">
          <input type="checkbox" ${hideZeros ? 'checked' : ''}>
          <span>Hide zero-${escapeHtml(options.hideZerosField)} apps</span>
        </label>
      `;
      tableContainer.appendChild(toggleBar);
      toggleBar.querySelector('input').addEventListener('change', (e) => {
        hideZeros = e.target.checked;
        render();
      });
    }

    let sortKey = options.defaultSort || null;
    let sortDir = options.defaultSortDir || 'desc';
    let sortedRows = [...rows];

    function sortRows() {
      // Apply hide-zeros filter
      if (hideZeros && options.hideZerosField) {
        sortedRows = rows.filter(r => (parseFloat(r[options.hideZerosField]) || 0) !== 0);
      } else {
        sortedRows = [...rows];
      }
      if (!sortKey) return;
      sortedRows.sort((a, b) => {
        let va = a[sortKey];
        let vb = b[sortKey];
        if (typeof va === 'string' && !isNaN(parseFloat(va))) va = parseFloat(va);
        if (typeof vb === 'string' && !isNaN(parseFloat(vb))) vb = parseFloat(vb);
        if (va == null) return 1;
        if (vb == null) return -1;
        if (typeof va === 'string') {
          const cmp = sortDir === 'asc' ? va.localeCompare(vb) : vb.localeCompare(va);
          return cmp !== 0 ? cmp : (a.name || '').localeCompare(b.name || '');
        }
        const cmp = sortDir === 'asc' ? va - vb : vb - va;
        return cmp !== 0 ? cmp : (a.name || '').localeCompare(b.name || '');
      });
    }

    // Table wrapper for scrollable area with sticky headers
    const tableWrapper = document.createElement('div');
    tableWrapper.className = 'table-wrapper';
    tableContainer.appendChild(tableWrapper);

    function render() {
      sortRows();
      const existing = tableWrapper.querySelector('table');
      if (existing) existing.remove();

      const table = document.createElement('table');
      table.className = 'data-table';

      // Head
      const thead = document.createElement('thead');
      const headerRow = document.createElement('tr');
      columns.forEach(col => {
        const th = document.createElement('th');
        th.className = col.align === 'right' ? 'text-right' : '';
        if (col.align === 'center') th.className = 'text-center';
        if (sortKey === col.key) th.classList.add('sorted');
        const arrow = sortKey === col.key ? (sortDir === 'asc' ? '\u25B2' : '\u25BC') : '\u25BC';
        th.innerHTML = `${escapeHtml(col.label)} <span class="sort-arrow">${arrow}</span>`;
        th.addEventListener('click', () => {
          if (sortKey === col.key) {
            sortDir = sortDir === 'asc' ? 'desc' : 'asc';
          } else {
            sortKey = col.key;
            sortDir = 'desc';
          }
          render();
        });
        headerRow.appendChild(th);
      });
      thead.appendChild(headerRow);
      table.appendChild(thead);

      // Body
      const tbody = document.createElement('tbody');
      sortedRows.forEach((row, i) => {
        const tr = document.createElement('tr');

        // Row click support
        if (options.onRowClick) {
          tr.classList.add('table-row-clickable');
          if (options.selectedRowId != null && row.id === options.selectedRowId) {
            tr.classList.add('table-row-selected');
          }
          tr.addEventListener('click', () => options.onRowClick(row));
        }

        columns.forEach(col => {
          const td = document.createElement('td');
          td.className = col.align === 'right' ? 'text-right' : '';
          if (col.align === 'center') td.className = 'text-center';

          if (col.render) {
            td.innerHTML = col.render(row[col.key], row, i);
          } else if (col.barMax) {
            const val = parseFloat(row[col.key]) || 0;
            const pct = col.barMax > 0 ? Math.min((val / col.barMax) * 100, 100) : 0;
            const fmtVal = col.format ? col.format(val) : val.toLocaleString();
            td.innerHTML = `
              <div class="inline-bar">
                <div class="inline-bar-track"><div class="inline-bar-fill" style="width:${pct}%"></div></div>
                <span class="inline-bar-value">${fmtVal}</span>
              </div>
            `;
          } else if (col.format) {
            td.textContent = col.format(row[col.key], row);
          } else {
            td.textContent = row[col.key] != null ? row[col.key] : '--';
          }
          tr.appendChild(td);
        });
        tbody.appendChild(tr);
      });
      table.appendChild(tbody);
      tableWrapper.appendChild(table);
    }

    render();
    container.appendChild(tableContainer);
    return tableContainer;
  }

  /**
   * Render tab navigation
   */
  function renderTabs(container, tabs, activeTab, onSwitch) {
    const tabRow = document.createElement('div');
    tabRow.className = 'tabs';
    tabs.forEach(t => {
      const tab = document.createElement('div');
      tab.className = 'tab' + (t.key === activeTab ? ' active' : '');
      tab.textContent = t.label;
      tab.addEventListener('click', () => {
        tabRow.querySelectorAll('.tab').forEach(el => el.classList.remove('active'));
        tab.classList.add('active');
        onSwitch(t.key);
      });
      tabRow.appendChild(tab);
    });
    container.appendChild(tabRow);
    return tabRow;
  }

  /**
   * Render an empty state
   */
  function renderEmptyState(container, message = 'No data available', sub = 'Run the sync script to populate data.') {
    const el = document.createElement('div');
    el.className = 'empty-state';
    el.innerHTML = `
      <div class="empty-state-icon">
        <svg width="48" height="48" viewBox="0 0 48 48" fill="none"><rect x="4" y="8" width="40" height="32" rx="4" stroke="#D1D5DB" stroke-width="2" fill="none"/><line x1="12" y1="20" x2="36" y2="20" stroke="#D1D5DB" stroke-width="2"/><line x1="12" y1="28" x2="28" y2="28" stroke="#D1D5DB" stroke-width="2"/></svg>
      </div>
      <div class="empty-state-text">${escapeHtml(message)}</div>
      <div class="empty-state-sub">${escapeHtml(sub)}</div>
    `;
    container.appendChild(el);
  }

  /**
   * Escape HTML to prevent XSS
   */
  function escapeHtml(str) {
    if (str == null) return '';
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  return {
    formatNumber,
    formatChange,
    renderKPICards,
    renderFilterBar,
    renderAppSelector,
    renderTable,
    renderTabs,
    renderEmptyState,
    escapeHtml
  };
})();
