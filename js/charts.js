/**
 * charts.js — Chart.js wrapper for Toto Dashboard
 */

const TotoCharts = (() => {
  // Color palette for multi-app stacking
  const PALETTE = [
    { line: '#4A90D9', fill: 'rgba(74, 144, 217, 0.15)' },
    { line: '#E67E22', fill: 'rgba(230, 126, 34, 0.15)' },
    { line: '#27AE60', fill: 'rgba(39, 174, 96, 0.15)' },
    { line: '#E74C3C', fill: 'rgba(231, 76, 60, 0.15)' },
    { line: '#9B59B6', fill: 'rgba(155, 89, 182, 0.15)' },
    { line: '#1ABC9C', fill: 'rgba(26, 188, 156, 0.15)' },
    { line: '#F39C12', fill: 'rgba(243, 156, 18, 0.15)' },
    { line: '#3498DB', fill: 'rgba(52, 152, 219, 0.15)' },
    { line: '#E91E63', fill: 'rgba(233, 30, 99, 0.15)' },
    { line: '#00BCD4', fill: 'rgba(0, 188, 212, 0.15)' },
  ];

  // Track active charts for cleanup
  const activeCharts = new Map();

  // Legend double-click state: track last click per chart for solo/unsolo
  const legendClickState = new Map(); // canvasId -> { lastClickTime, lastIndex, soloedIndex }

  /**
   * Weekend shading plugin — draws subtle gray bands behind Sat/Sun columns
   */
  const weekendShadingPlugin = {
    id: 'weekendShading',
    beforeDatasetsDraw(chart) {
      const rawDates = chart.options._rawDates;
      if (!rawDates || rawDates.length === 0) return;

      const { ctx, chartArea: { left, right, top, bottom }, scales: { x } } = chart;
      const barWidth = (right - left) / rawDates.length;

      ctx.save();
      ctx.fillStyle = 'rgba(0,0,0,0.03)';

      rawDates.forEach((dateStr, i) => {
        const day = new Date(dateStr + 'T00:00:00').getDay();
        if (day === 0 || day === 6) { // Sunday=0, Saturday=6
          const xPos = x.getPixelForValue(i);
          const halfBar = barWidth / 2;
          ctx.fillRect(xPos - halfBar, top, barWidth, bottom - top);
        }
      });

      ctx.restore();
    }
  };

  /**
   * Crosshair plugin — draws a vertical line at the hovered x position
   */
  const crosshairPlugin = {
    id: 'crosshair',
    afterDatasetsDraw(chart) {
      if (chart.tooltip?._active?.length) {
        const { ctx, chartArea: { top, bottom } } = chart;
        const x = chart.tooltip._active[0].element.x;
        ctx.save();
        ctx.beginPath();
        ctx.moveTo(x, top);
        ctx.lineTo(x, bottom);
        ctx.lineWidth = 1;
        ctx.strokeStyle = 'rgba(0, 0, 0, 0.1)';
        ctx.stroke();
        ctx.restore();
      }
    }
  };

  /**
   * Destroy chart on a canvas before reuse
   */
  function destroyChart(canvasId) {
    if (activeCharts.has(canvasId)) {
      activeCharts.get(canvasId).destroy();
      activeCharts.delete(canvasId);
    }
  }

  /**
   * Get gradient fill for area charts
   */
  function getGradientFill(ctx, color) {
    const gradient = ctx.createLinearGradient(0, 0, 0, ctx.canvas.height);
    gradient.addColorStop(0, color);
    gradient.addColorStop(1, 'rgba(255, 255, 255, 0)');
    return gradient;
  }

  /**
   * Default tooltip config
   */
  const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  function defaultTooltip(isCurrency = false) {
    return {
      mode: 'index',
      intersect: false,
      caretPadding: 12,
      backgroundColor: 'rgba(26, 26, 46, 0.9)',
      titleColor: '#fff',
      bodyColor: '#ddd',
      borderColor: 'rgba(255,255,255,0.1)',
      borderWidth: 1,
      cornerRadius: 8,
      padding: 12,
      titleFont: { size: 13, weight: '600' },
      bodyFont: { size: 12 },
      callbacks: {
        title: function(tooltipItems) {
          if (!tooltipItems.length) return '';
          const idx = tooltipItems[0].dataIndex;
          const label = tooltipItems[0].label || '';
          // Add day of week from raw dates if available
          const rawDates = tooltipItems[0].chart.options._rawDates;
          if (rawDates && rawDates[idx]) {
            const day = new Date(rawDates[idx] + 'T00:00:00').getDay();
            return `${DAY_NAMES[day]}, ${label}`;
          }
          return label;
        },
        afterTitle: function(tooltipItems) {
          // Show total across all datasets for this index (exclude Previous Period)
          const current = tooltipItems.filter(item => item.dataset.label !== 'Previous Period');
          if (current.length <= 1) return null;
          let total = 0;
          current.forEach(item => {
            total += item.parsed.y || 0;
          });
          const formatted = isCurrency
            ? '$' + total.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
            : total.toLocaleString('en-US');
          return `Total: ${formatted}`;
        },
        label: function(context) {
          let label = context.dataset.label || '';
          let value = context.parsed.y;
          if (value == null) return null;
          if (isCurrency) {
            value = '$' + value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
          } else {
            value = value.toLocaleString('en-US');
          }
          return label ? `  ${label}: ${value}` : value;
        },
        labelTextColor: function(context) {
          // Highlight the dataset nearest to cursor Y position
          const chart = context.chart;
          const mouseY = chart._lastEvent?.y;
          if (mouseY == null) return '#999';
          const active = chart.getActiveElements();
          if (active.length > 0) {
            const nearest = active.reduce((a, b) =>
              Math.abs(b.element.y - mouseY) < Math.abs(a.element.y - mouseY) ? b : a
            );
            if (context.datasetIndex === nearest.datasetIndex) {
              return '#fff';
            }
          }
          return '#999';
        }
      }
    };
  }

  /**
   * Create a stacked area chart
   */
  function createAreaChart(canvasId, labels, datasets, options = {}) {
    destroyChart(canvasId);
    const canvas = document.getElementById(canvasId);
    if (!canvas) return null;

    const ctx = canvas.getContext('2d');
    const isCurrency = options.isCurrency || false;
    const stacked = options.stacked !== false;

    const chartDatasets = datasets.map((ds, i) => {
      const color = PALETTE[i % PALETTE.length];
      return {
        label: ds.label,
        data: ds.data,
        borderColor: ds.borderColor || color.line,
        backgroundColor: ds.backgroundColor || color.fill,
        fill: stacked ? (i === 0 ? 'origin' : '-1') : 'origin',
        tension: 0.35,
        borderWidth: 2,
        pointRadius: 0,
        pointHoverRadius: 4,
        pointHoverBackgroundColor: ds.borderColor || color.line,
        pointHoverBorderColor: '#fff',
        pointHoverBorderWidth: 2,
        ...ds.chartOptions
      };
    });

    // Add previous period comparison line if provided
    if (options.previousPeriodData && Array.isArray(options.previousPeriodData)) {
      chartDatasets.push({
        label: 'Previous Period',
        data: options.previousPeriodData,
        borderColor: '#9CA3AF',
        borderDash: [5, 5],
        backgroundColor: 'transparent',
        fill: false,
        stack: 'comparison', // separate stack so it doesn't add to the main totals
        tension: 0.35,
        borderWidth: 1.5,
        pointRadius: 0,
        pointHoverRadius: 3,
        pointHoverBackgroundColor: '#9CA3AF',
        pointHoverBorderColor: '#fff',
        pointHoverBorderWidth: 2,
        order: 999 // draw behind other datasets
      });
    }

    // Initialize legend click state for solo/unsolo
    legendClickState.set(canvasId, { lastClickTime: 0, lastIndex: -1, soloedIndex: -1 });

    const chart = new Chart(ctx, {
      type: 'line',
      data: { labels, datasets: chartDatasets },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: {
          mode: 'index',
          intersect: false
        },
        plugins: {
          legend: {
            display: datasets.length > 1,
            position: 'top',
            align: 'start',
            labels: {
              boxWidth: 12,
              boxHeight: 12,
              borderRadius: 3,
              useBorderRadius: true,
              padding: 16,
              font: { size: 12, weight: '500' },
              color: '#6B7280'
            },
            onClick: function(e, legendItem, legend) {
              const clickState = legendClickState.get(canvasId);
              const now = Date.now();
              const ci = legend.chart;
              const index = legendItem.datasetIndex;

              // Detect double-click: same legend item within 300ms
              if (clickState && clickState.lastIndex === index && (now - clickState.lastClickTime) < 300) {
                // Double-click: solo/unsolo
                if (clickState.soloedIndex === index) {
                  // Already solo'd on this item — restore all
                  ci.data.datasets.forEach((ds, i) => {
                    ci.setDatasetVisibility(i, true);
                  });
                  clickState.soloedIndex = -1;
                } else {
                  // Solo this dataset, hide all others
                  ci.data.datasets.forEach((ds, i) => {
                    ci.setDatasetVisibility(i, i === index);
                  });
                  clickState.soloedIndex = index;
                }
                clickState.lastClickTime = 0; // Reset so next single click works normally
                clickState.lastIndex = -1;
                ci.update();
                return;
              }

              // Single click: default toggle behavior
              clickState.lastClickTime = now;
              clickState.lastIndex = index;
              clickState.soloedIndex = -1; // Clear solo state on single click

              ci.setDatasetVisibility(index, !ci.isDatasetVisible(index));
              ci.update();
            }
          },
          tooltip: defaultTooltip(isCurrency)
        },
        scales: {
          x: {
            grid: { display: false },
            border: { display: false },
            ticks: {
              font: { size: 11 },
              color: '#9CA3AF',
              maxRotation: 0,
              maxTicksLimit: options.maxXTicks || 12
            }
          },
          y: {
            stacked: stacked,
            grid: {
              color: '#F0F0F0',
              drawBorder: false
            },
            border: { display: false },
            ticks: {
              font: { size: 11 },
              color: '#9CA3AF',
              callback: function(value) {
                if (isCurrency) {
                  if (value >= 1000) return '$' + (value / 1000).toFixed(1) + 'K';
                  return '$' + value;
                }
                if (value >= 1000000) return (value / 1000000).toFixed(1) + 'M';
                if (value >= 1000) return (value / 1000).toFixed(1) + 'K';
                return value;
              }
            },
            beginAtZero: true
          }
        },
        // Store raw dates for weekend shading plugin
        _rawDates: options.rawDates || null,
        ...options.chartJsOptions
      },
      plugins: [weekendShadingPlugin, crosshairPlugin]
    });

    activeCharts.set(canvasId, chart);
    return chart;
  }

  /**
   * Create a grouped/stacked bar chart
   */
  function createBarChart(canvasId, labels, datasets, options = {}) {
    destroyChart(canvasId);
    const canvas = document.getElementById(canvasId);
    if (!canvas) return null;

    const ctx = canvas.getContext('2d');
    const isCurrency = options.isCurrency || false;

    const chartDatasets = datasets.map((ds, i) => {
      const color = PALETTE[i % PALETTE.length];
      return {
        label: ds.label,
        data: ds.data,
        backgroundColor: ds.backgroundColor || color.line + 'CC',
        borderColor: ds.borderColor || color.line,
        borderWidth: 1,
        borderRadius: 4,
        borderSkipped: false,
        barPercentage: 0.7,
        categoryPercentage: 0.8,
        ...ds.chartOptions
      };
    });

    const chart = new Chart(ctx, {
      type: 'bar',
      data: { labels, datasets: chartDatasets },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: {
          mode: 'index',
          intersect: false
        },
        plugins: {
          legend: {
            display: datasets.length > 1,
            position: 'top',
            align: 'start',
            labels: {
              boxWidth: 12,
              boxHeight: 12,
              borderRadius: 3,
              useBorderRadius: true,
              padding: 16,
              font: { size: 12, weight: '500' },
              color: '#6B7280'
            }
          },
          tooltip: defaultTooltip(isCurrency)
        },
        scales: {
          x: {
            grid: { display: false },
            border: { display: false },
            ticks: {
              font: { size: 11 },
              color: '#9CA3AF',
              maxRotation: 0,
              maxTicksLimit: options.maxXTicks || 12
            },
            stacked: options.stacked || false
          },
          y: {
            stacked: options.stacked || false,
            grid: {
              color: '#F0F0F0',
              drawBorder: false
            },
            border: { display: false },
            ticks: {
              font: { size: 11 },
              color: '#9CA3AF',
              callback: function(value) {
                if (isCurrency) {
                  if (value >= 1000) return '$' + (value / 1000).toFixed(1) + 'K';
                  return '$' + value;
                }
                if (value >= 1000000) return (value / 1000000).toFixed(1) + 'M';
                if (value >= 1000) return (value / 1000).toFixed(1) + 'K';
                return value;
              }
            },
            beginAtZero: true
          }
        },
        ...options.chartJsOptions
      }
    });

    activeCharts.set(canvasId, chart);
    return chart;
  }

  /**
   * Destroy all active charts
   */
  function destroyAll() {
    activeCharts.forEach((chart, id) => {
      chart.destroy();
    });
    activeCharts.clear();
  }

  /**
   * Get palette color at index
   */
  function getColor(index) {
    return PALETTE[index % PALETTE.length];
  }

  return {
    createAreaChart,
    createBarChart,
    destroyChart,
    destroyAll,
    getColor,
    PALETTE
  };
})();
