/* CORP INTEL — Frontend Application */

let isLoading = false;

// ── Entry Points ──

function quickSearch(name) {
  document.getElementById('company-input').value = name;
  research();
}

function research() {
  const input = document.getElementById('company-input');
  const company = input.value.trim();
  if (!company || isLoading) return;

  hideAll();
  startInvestigation(company);
}

// ── Enter key support ──
document.getElementById('company-input').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') research();
});

// ── UI Helpers ──

function hideAll() {
  document.getElementById('status-section').classList.add('hidden');
  document.getElementById('results-section').classList.add('hidden');
  document.getElementById('error-section').classList.add('hidden');
}

function showStatus() {
  document.getElementById('status-section').classList.remove('hidden');
  setProgress(5);
}

function showResults() {
  document.getElementById('results-section').classList.remove('hidden');
}

function showError(msg) {
  isLoading = false;
  document.getElementById('search-btn').disabled = false;
  document.getElementById('status-section').classList.add('hidden');
  document.getElementById('error-section').classList.remove('hidden');
  document.getElementById('error-message').textContent = msg;
}

function setProgress(pct) {
  document.getElementById('progress-bar').style.width = Math.min(pct, 100) + '%';
}

function setStatusMessage(msg) {
  document.getElementById('status-message').textContent = msg;
}

function appendLog(msg) {
  const log = document.getElementById('status-log');
  const entry = document.createElement('div');
  entry.className = 'status-log-entry';
  entry.textContent = msg;
  log.appendChild(entry);
  // Keep last 5 entries
  while (log.children.length > 5) log.removeChild(log.firstChild);
}

// ── Investigation ──

async function startInvestigation(company) {
  isLoading = true;
  document.getElementById('search-btn').disabled = true;
  showStatus();

  // Clear log
  document.getElementById('status-log').innerHTML = '';
  setStatusMessage('Connecting to intelligence network…');
  setProgress(8);

  const statusMessages = [
    'Accessing corporate databases…',
    'Cross-referencing public records…',
    'Retrieving financial intelligence…',
    'Compiling executive profiles…',
    'Analyzing trade data…',
    'Generating intelligence report…',
  ];
  let msgIdx = 0;

  try {
    const response = await fetch('/api/research', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ company }),
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({ error: 'Server error' }));
      showError(err.error || `Server returned ${response.status}`);
      return;
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let progressValue = 10;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop(); // keep incomplete line

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        let event;
        try {
          event = JSON.parse(line.slice(6));
        } catch {
          continue;
        }

        switch (event.type) {
          case 'status':
            appendLog(event.data);
            // Cycle through status messages for variety
            setStatusMessage(statusMessages[msgIdx % statusMessages.length]);
            msgIdx++;
            progressValue = Math.min(progressValue + 12, 75);
            setProgress(progressValue);
            break;

          case 'progress':
            progressValue = Math.min(progressValue + 2, 85);
            setProgress(progressValue);
            break;

          case 'complete':
            setStatusMessage('Intelligence report compiled.');
            setProgress(100);
            appendLog('Analysis complete. Rendering dossier…');
            setTimeout(() => {
              document.getElementById('status-section').classList.add('hidden');
              renderDossier(event.data);
              isLoading = false;
              document.getElementById('search-btn').disabled = false;
            }, 600);
            break;

          case 'error':
            showError(event.data || 'Investigation failed. Please try again.');
            break;
        }
      }
    }
  } catch (err) {
    showError('Network error: ' + (err.message || 'Could not reach server'));
  }
}

// ── Render Dossier ──

function renderDossier(data) {
  // Header
  document.getElementById('dossier-name').textContent = data.company_name || 'Unknown Company';
  document.getElementById('dossier-industry').textContent = data.industry || '';
  document.getElementById('dossier-date').textContent =
    'REPORT GENERATED: ' + new Date().toLocaleString('en-US', {
      dateStyle: 'long', timeStyle: 'short'
    }).toUpperCase();

  const tickerEl = document.getElementById('dossier-ticker');
  if (data.ticker) {
    tickerEl.textContent = data.ticker;
    tickerEl.classList.remove('hidden');
  } else {
    tickerEl.classList.add('hidden');
  }

  renderOverview(data.overview);
  renderLeadership(data.leadership);
  renderFinancials(data.financials);
  renderNews(data.latest_news);
  renderActions(data.company_actions);
  renderShipments(data.shipments_trade);
  renderRisk(data.risk_flags);

  showResults();

  // Stagger card animations
  document.querySelectorAll('.card').forEach((card, i) => {
    card.style.animationDelay = `${i * 0.07}s`;
  });
}

// ── Section Renderers ──

function renderOverview(overview) {
  if (!overview) return;
  const body = document.getElementById('overview-body');

  const desc = overview.description || '';
  const rows = [
    { label: 'FOUNDED',   value: overview.founded    || 'N/A' },
    { label: 'HQ',        value: overview.headquarters || 'N/A' },
    { label: 'EMPLOYEES', value: overview.employees   || 'N/A' },
    { label: 'WEBSITE',
      value: overview.website
        ? `<a href="${escAttr(overview.website)}" target="_blank" rel="noopener noreferrer">${esc(overview.website)}</a>`
        : 'N/A',
      raw: true },
  ];

  body.innerHTML = `
    <p class="overview-desc">${esc(desc)}</p>
    <div class="info-grid">
      ${rows.map(r => `
        <div class="info-item">
          <span class="label">${esc(r.label)}</span>
          <span class="value">${r.raw ? r.value : esc(r.value)}</span>
        </div>
      `).join('')}
    </div>
  `;
}

function renderLeadership(leadership) {
  if (!leadership) return;
  const body = document.getElementById('leadership-body');
  let html = '';

  if (leadership.ceo) {
    const c = leadership.ceo;
    html += `
      <div class="ceo-card">
        <div class="ceo-header">
          <span class="ceo-badge">CEO</span>
          <span class="ceo-name">${esc(c.name || '')}</span>
        </div>
        ${c.since ? `<div class="ceo-since">CEO SINCE ${esc(c.since)}</div>` : ''}
        <p class="ceo-bio">${esc(c.background || '')}</p>
      </div>
    `;
  }

  const execs = leadership.key_executives || [];
  if (execs.length) {
    html += `<div class="exec-list">` +
      execs.map(e => `
        <div class="exec-item">
          <span class="exec-role">${esc(e.role || '')}</span>
          <span class="exec-name-sm">${esc(e.name || '')}</span>
        </div>
      `).join('') +
    `</div>`;
  }

  body.innerHTML = html || '<p style="color:var(--text-muted);font-size:13px">No leadership data available.</p>';
}

function renderFinancials(financials) {
  if (!financials) return;
  const body = document.getElementById('financials-body');
  const f = financials;

  const highlights = [
    { label: 'REVENUE',    value: f.revenue    || 'N/A' },
    { label: 'MARKET CAP', value: f.market_cap || 'N/A' },
    { label: 'STOCK',      value: f.stock_price || 'PRIVATE' },
  ];

  let html = `
    <div class="fin-highlights">
      ${highlights.map(h => `
        <div class="fin-block">
          <div class="fin-label">${esc(h.label)}</div>
          <div class="fin-value">${esc(h.value)}</div>
        </div>
      `).join('')}
    </div>
  `;

  const metrics = f.key_metrics || [];
  if (metrics.length) {
    html += `<div class="metrics-grid">` +
      metrics.map(m => `
        <div class="metric-item">
          <span class="metric-name">${esc(m.metric || '')}</span>
          <span class="metric-val">${esc(m.value || '')}</span>
        </div>
      `).join('') +
    `</div>`;
  }

  if (f.recent_performance) {
    html += `<p class="perf-summary">${esc(f.recent_performance)}</p>`;
  }

  body.innerHTML = html;
}

function renderNews(news) {
  if (!news || !news.length) return;
  const body = document.getElementById('news-body');

  body.innerHTML = `
    <div class="news-grid">
      ${news.map(n => `
        <div class="news-item">
          <div class="news-date">${esc(n.date || '')}</div>
          <div class="news-headline">${esc(n.headline || '')}</div>
          <p class="news-summary">${esc(n.summary || '')}</p>
          ${n.significance ? `<div class="news-sig">⚡ ${esc(n.significance)}</div>` : ''}
        </div>
      `).join('')}
    </div>
  `;
}

function renderActions(actions) {
  if (!actions || !actions.length) return;
  const body = document.getElementById('actions-body');

  body.innerHTML = `
    <div class="actions-list">
      ${actions.map(a => `
        <div class="action-item">
          <div class="action-header">
            <span class="action-date">${esc(a.date || '')}</span>
            <span class="action-type">${esc(a.action || '')}</span>
          </div>
          <p class="action-desc">${esc(a.description || '')}</p>
        </div>
      `).join('')}
    </div>
  `;
}

function renderShipments(shipments) {
  if (!shipments) return;
  const body = document.getElementById('shipments-body');

  let html = `<p class="ship-summary">${esc(shipments.summary || 'No trade data available.')}</p>`;

  const movements = shipments.notable_movements || [];
  if (movements.length) {
    html += `<div class="ship-list">` +
      movements.map(m => `
        <div class="ship-item">
          <span class="ship-icon">📦</span>
          <span>${esc(m.description || '')}</span>
        </div>
      `).join('') +
    `</div>`;
  }

  body.innerHTML = html;
}

function renderRisk(flags) {
  const body = document.getElementById('risk-body');

  if (!flags || !flags.length) {
    body.innerHTML = '<p class="no-risk">✅ &nbsp;No significant risk flags identified.</p>';
    return;
  }

  body.innerHTML = `
    <div class="risk-list">
      ${flags.map(f => `
        <div class="risk-item">
          <span class="risk-icon">⚠</span>
          <span>${esc(f || '')}</span>
        </div>
      `).join('')}
    </div>
  `;
}

// ── Security Helpers ──

function esc(str) {
  if (typeof str !== 'string') str = String(str ?? '');
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function escAttr(str) {
  // For use in href attributes - only allow http(s) URLs
  if (typeof str !== 'string') return '#';
  const trimmed = str.trim();
  if (!/^https?:\/\//i.test(trimmed)) return '#';
  return esc(trimmed);
}
