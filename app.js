// =============================================================================
//  Homelab Dashboard — app.js
//  NOTE: Must be served via HTTP (not file://) for fetch() to work.
//  Quick start: python3 -m http.server 8888
// =============================================================================

'use strict';

// ── Config ───────────────────────────────────────────────────────────────────
const CONFIG = {
  yamlPath: './services.yaml',
  refreshInterval: 30_000,
  apiTimeout: 7_000,
  statusTimeout: 5_000,
};

// ── Category color map ────────────────────────────────────────────────────────
const CATEGORY_COLORS = {
  'media':          '#f472b6',
  'downloads':      '#fbbf24',
  'infrastructure': '#4ade80',
  'network':        '#22d3ee',
  'storage':        '#c084fc',
  'monitoring':     '#60a5fa',
  'smart home':     '#a78bfa',
  'smart-home':     '#a78bfa',
  'security':       '#fb7185',
};

function catColor(cat) {
  return CATEGORY_COLORS[(cat ?? '').toLowerCase()] ?? '#94a3b8';
}

// ── State ────────────────────────────────────────────────────────────────────
const state = {
  services: [],
  activeCategory: 'all',
  searchQuery: '',
  statusFilter: null,   // null | 'online' | 'offline'
  dashView: localStorage.getItem('dashView') ?? 'flat',  // 'flat' | 'grouped'
  statusMap: {},        // id → 'online' | 'offline' | 'loading'
  statsMap: {},         // id → [{label, value}]
  refreshTimer: null,
  countdownTimer: null,
  nextRefreshAt: null,
  settings: {},
};

// ── Utilities ─────────────────────────────────────────────────────────────────
function svcId(svc) {
  return svc.name.toLowerCase().replace(/[^a-z0-9]/g, '-');
}

function fmtBytes(b) {
  if (!b || b === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(b) / Math.log(k));
  return `${(b / k ** i).toFixed(1)} ${sizes[i]}`;
}

function fmtSpeed(bps) {
  return fmtBytes(bps) + '/s';
}

function fmtNum(n) {
  if (n == null || isNaN(n)) return '—';
  return Number(n).toLocaleString();
}

function fmtPct(n, dec = 1) {
  if (n == null) return '—';
  return `${parseFloat(n).toFixed(dec)}%`;
}

function debounce(fn, ms) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}

async function timedFetch(url, opts = {}, timeout = CONFIG.apiTimeout) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    const res = await fetch(url, { ...opts, signal: controller.signal });
    return res;
  } finally {
    clearTimeout(timer);
  }
}

// ── Status check (mode: no-cors — opaque means reachable) ────────────────────
async function checkStatus(url) {
  try {
    await timedFetch(url, { mode: 'no-cors' }, CONFIG.statusTimeout);
    return true;
  } catch {
    return false;
  }
}

// ── API Handlers ──────────────────────────────────────────────────────────────
// Each returns [{label, value}] or null on any failure.

async function api_qbittorrent(svc) {
  try {
    const b = (svc.endpoint ?? svc.url).replace(/\/$/, '');
    const [tr, to] = await Promise.all([
      timedFetch(`${b}/api/v2/transfer/info`,  { credentials: 'include' }),
      timedFetch(`${b}/api/v2/torrents/info`,  { credentials: 'include' }),
    ]);
    if (!tr.ok || !to.ok) return null;
    const transfer  = await tr.json();
    const torrents  = await to.json();
    const active    = torrents.filter(t => ['downloading', 'uploading', 'stalledDL', 'stalledUP'].includes(t.state));
    return [
      { label: 'Active',  value: active.length },
      { label: 'DL',      value: fmtSpeed(transfer.dl_info_speed ?? 0) },
      { label: 'UL',      value: fmtSpeed(transfer.up_info_speed ?? 0) },
    ];
  } catch { return null; }
}

async function api_proxmox(svc) {
  try {
    const b = (svc.endpoint ?? svc.url).replace(/\/$/, '');
    const headers = svc.api_key ? { 'Authorization': `PVEAPIToken=${svc.api_key}` } : {};
    const res = await timedFetch(`${b}/api2/json/cluster/resources`, { headers });
    if (!res.ok) return null;
    const { data } = await res.json();
    const vms    = data.filter(r => r.type === 'vm' || r.type === 'lxc');
    const running = vms.filter(v => v.status === 'running').length;
    const nodes  = data.filter(r => r.type === 'node');
    return [
      { label: 'VMs/LXC', value: vms.length },
      { label: 'Running',  value: running },
      { label: 'Nodes',    value: nodes.length },
    ];
  } catch { return null; }
}

async function api_glances(svc) {
  try {
    const b = (svc.endpoint ?? svc.url).replace(/\/$/, '');
    const [cpuR, memR, loadR] = await Promise.all([
      timedFetch(`${b}/api/3/cpu`),
      timedFetch(`${b}/api/3/mem`),
      timedFetch(`${b}/api/3/load`),
    ]);
    if (!cpuR.ok || !memR.ok) return null;
    const cpu  = await cpuR.json();
    const mem  = await memR.json();
    const load = loadR.ok ? await loadR.json() : null;
    const stats = [
      { label: 'CPU',  value: fmtPct(cpu.total) },
      { label: 'RAM',  value: fmtPct(mem.percent) },
    ];
    if (load?.min1 != null) stats.push({ label: 'Load', value: load.min1.toFixed(2) });
    return stats;
  } catch { return null; }
}

async function api_immich(svc) {
  try {
    const b = (svc.endpoint ?? svc.url).replace(/\/$/, '');
    const headers = svc.api_key ? { 'x-api-key': svc.api_key } : {};
    const res = await timedFetch(`${b}/api/server-info/stats`, { headers });
    if (!res.ok) return null;
    const d = await res.json();
    return [
      { label: 'Photos', value: fmtNum(d.photos) },
      { label: 'Videos', value: fmtNum(d.videos) },
    ];
  } catch { return null; }
}

async function api_pihole(svc) {
  try {
    const b = (svc.endpoint ?? svc.url).replace(/\/$/, '');
    const key = svc.api_key ? `&auth=${svc.api_key}` : '';
    const res = await timedFetch(`${b}/admin/api.php?summaryRaw${key}`);
    if (!res.ok) return null;
    const d = await res.json();
    if (!d || d.status === undefined) return null;
    return [
      { label: 'Blocked',  value: fmtPct(d.ads_percentage_today) },
      { label: 'Queries',  value: fmtNum(d.dns_queries_today) },
      { label: 'Status',   value: d.status === 'enabled' ? '● ON' : '○ OFF' },
    ];
  } catch { return null; }
}

async function api_sonarr(svc) {
  try {
    const b = (svc.endpoint ?? svc.url).replace(/\/$/, '');
    const headers = svc.api_key ? { 'X-Api-Key': svc.api_key } : {};
    const res = await timedFetch(`${b}/api/v3/series`, { headers });
    if (!res.ok) return null;
    const series = await res.json();
    return [
      { label: 'Series',    value: series.length },
      { label: 'Monitored', value: series.filter(s => s.monitored).length },
    ];
  } catch { return null; }
}

async function api_radarr(svc) {
  try {
    const b = (svc.endpoint ?? svc.url).replace(/\/$/, '');
    const headers = svc.api_key ? { 'X-Api-Key': svc.api_key } : {};
    const res = await timedFetch(`${b}/api/v3/movie`, { headers });
    if (!res.ok) return null;
    const movies = await res.json();
    return [
      { label: 'Movies',     value: movies.length },
      { label: 'Downloaded', value: movies.filter(m => m.hasFile).length },
    ];
  } catch { return null; }
}

async function api_portainer(svc) {
  try {
    const b = (svc.endpoint ?? svc.url).replace(/\/$/, '');
    const headers = svc.api_key ? { 'X-API-Key': svc.api_key } : {};
    const [epR, cR] = await Promise.all([
      timedFetch(`${b}/api/endpoints`, { headers }),
      timedFetch(`${b}/api/containers/json?all=true`, { headers }),
    ]);
    const eps  = epR.ok  ? await epR.json()  : [];
    const ctrs = cR.ok   ? await cR.json()   : [];
    const running = ctrs.filter(c => c.State === 'running').length;
    return [
      { label: 'Endpoints',  value: eps.length },
      { label: 'Containers', value: ctrs.length },
      { label: 'Running',    value: running },
    ];
  } catch { return null; }
}

async function api_homeassistant(svc) {
  try {
    const b = (svc.endpoint ?? svc.url).replace(/\/$/, '');
    const headers = svc.api_key ? { 'Authorization': `Bearer ${svc.api_key}` } : {};
    const res = await timedFetch(`${b}/api/states`, { headers });
    if (!res.ok) return null;
    const states = await res.json();
    const on  = states.filter(s => s.state === 'on').length;
    return [
      { label: 'Entities', value: states.length },
      { label: 'Active',   value: on },
    ];
  } catch { return null; }
}

async function api_jellyfin(svc) {
  try {
    const b = (svc.endpoint ?? svc.url).replace(/\/$/, '');
    const infoR = await timedFetch(`${b}/System/Info/Public`);
    if (!infoR.ok) return null;
    const info = await infoR.json();
    const headers = svc.api_key ? { 'X-Emby-Authorization': `MediaBrowser Token="${svc.api_key}"` } : {};
    const sessR = await timedFetch(`${b}/Sessions`, { headers });
    const sessions = sessR.ok ? await sessR.json() : [];
    return [
      { label: 'Version',  value: (info.Version ?? '').split('.').slice(0,2).join('.') || '—' },
      { label: 'Sessions', value: sessions.length },
    ];
  } catch { return null; }
}

async function api_nextcloud(svc) {
  try {
    const b = (svc.endpoint ?? svc.url).replace(/\/$/, '');
    const [user, pass] = (svc.api_key ?? ':').split(':');
    const res = await timedFetch(
      `${b}/ocs/v2.php/apps/serverinfo/api/v1/info?format=json`,
      { headers: { 'Authorization': `Basic ${btoa(`${user}:${pass}`)}`, 'OCS-APIRequest': 'true' } }
    );
    if (!res.ok) return null;
    const d   = await res.json();
    const nc  = d?.ocs?.data?.nextcloud;
    const sys = d?.ocs?.data?.server;
    const stats = [
      { label: 'Files', value: fmtNum(nc?.storage?.num_files) },
      { label: 'Users', value: fmtNum(nc?.storage?.num_users) },
    ];
    if (sys?.php?.version) stats.push({ label: 'PHP', value: sys.php.version.split('.').slice(0,2).join('.') });
    return stats;
  } catch { return null; }
}

async function api_grafana(svc) {
  try {
    const b = (svc.endpoint ?? svc.url).replace(/\/$/, '');
    const headers = svc.api_key ? { 'Authorization': `Bearer ${svc.api_key}` } : {};
    const [dashR, dsR] = await Promise.all([
      timedFetch(`${b}/api/search?type=dash-db&limit=500`, { headers }),
      timedFetch(`${b}/api/datasources`, { headers }),
    ]);
    const dashes  = dashR.ok ? await dashR.json() : [];
    const sources = dsR.ok   ? await dsR.json()   : [];
    return [
      { label: 'Dashboards', value: dashes.length },
      { label: 'Sources',    value: sources.length },
    ];
  } catch { return null; }
}

async function api_adguard(svc) {
  try {
    const b = (svc.endpoint ?? svc.url).replace(/\/$/, '');
    const [user, pass] = (svc.api_key ?? ':').split(':');
    const headers = { 'Authorization': `Basic ${btoa(`${user}:${pass}`)}` };
    const res = await timedFetch(`${b}/control/stats`, { headers });
    if (!res.ok) return null;
    const d      = await res.json();
    const total   = d.num_dns_queries ?? 0;
    const blocked = d.num_blocked_filtering ?? 0;
    const pct     = total > 0 ? ((blocked / total) * 100).toFixed(1) : '0.0';
    return [
      { label: 'Blocked', value: `${pct}%` },
      { label: 'Queries', value: fmtNum(total) },
    ];
  } catch { return null; }
}

const API_HANDLERS = {
  qbittorrent:   api_qbittorrent,
  proxmox:       api_proxmox,
  glances:       api_glances,
  immich:        api_immich,
  pihole:        api_pihole,
  sonarr:        api_sonarr,
  radarr:        api_radarr,
  portainer:     api_portainer,
  homeassistant: api_homeassistant,
  jellyfin:      api_jellyfin,
  nextcloud:     api_nextcloud,
  grafana:       api_grafana,
  adguard:       api_adguard,
};

// ── YAML Loader ───────────────────────────────────────────────────────────────
async function loadServices() {
  try {
    // Use server-injected YAML (Docker / PHP) when available — avoids a
    // network fetch and keeps services.yaml out of the web root entirely.
    let text;
    if (typeof window.__DASHBOARD_YAML__ === 'string' && window.__DASHBOARD_YAML__.trim()) {
      text = window.__DASHBOARD_YAML__;
    } else {
      const res = await fetch(CONFIG.yamlPath);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      text = await res.text();
    }

    const config = jsyaml.load(text);

    if (config?.settings) {
      state.settings = config.settings;
      const { title, subtitle, refresh_interval } = config.settings;
      if (title) {
        document.getElementById('dash-title').textContent = title.toUpperCase();
        document.title = `${title} Dashboard`;
      }
      if (subtitle) document.getElementById('dash-subtitle').textContent = subtitle.toUpperCase();
      if (refresh_interval) CONFIG.refreshInterval = refresh_interval * 1000;
    }

    return (config?.services ?? []).filter(s => s?.name && s?.url);
  } catch (err) {
    console.warn('[Dashboard] Could not load services.yaml:', err);
    showToast('Could not load services.yaml — showing demo services.', 'error');
    return getDemoServices();
  }
}

function getDemoServices() {
  return [
    { name: 'Jellyfin',      url: 'http://localhost:8096', category: 'Media',          icon: '🎦', description: 'Open-source media server', api_type: 'jellyfin' },
    { name: 'Sonarr',        url: 'http://localhost:8989', category: 'Media',          icon: '📺', description: 'TV show management',       api_type: 'sonarr' },
    { name: 'Radarr',        url: 'http://localhost:7878', category: 'Media',          icon: '🎥', description: 'Movie management',          api_type: 'radarr' },
    { name: 'qBittorrent',   url: 'http://localhost:8080', category: 'Downloads',      icon: '⬇️', description: 'Torrent client',            api_type: 'qbittorrent' },
    { name: 'Proxmox',       url: 'https://localhost:8006',category: 'Infrastructure', icon: '🖥️', description: 'Virtualization platform',   api_type: 'proxmox' },
    { name: 'Portainer',     url: 'http://localhost:9000', category: 'Infrastructure', icon: '🐳', description: 'Container management',       api_type: 'portainer' },
    { name: 'Glances',       url: 'http://localhost:61208',category: 'Infrastructure', icon: '📊', description: 'System monitor',             api_type: 'glances' },
    { name: 'Grafana',       url: 'http://localhost:3000', category: 'Monitoring',     icon: '📈', description: 'Metrics & dashboards',       api_type: 'grafana' },
    { name: 'Immich',        url: 'http://localhost:2283', category: 'Storage',        icon: '📸', description: 'Photo backup',               api_type: 'immich' },
    { name: 'Nextcloud',     url: 'http://localhost:8081', category: 'Storage',        icon: '☁️', description: 'File sync',                  api_type: 'nextcloud' },
    { name: 'Pi-hole',       url: 'http://localhost',      category: 'Network',        icon: '🛡️', description: 'DNS ad blocker',             api_type: 'pihole' },
    { name: 'AdGuard',       url: 'http://localhost:3001', category: 'Network',        icon: '🔒', description: 'DNS tracker blocker',        api_type: 'adguard' },
    { name: 'Home Assistant',url: 'http://localhost:8123', category: 'Smart Home',     icon: '🏠', description: 'Home automation',            api_type: 'homeassistant' },
    { name: 'Vaultwarden',   url: 'http://localhost:8222', category: 'Security',       icon: '🔐', description: 'Password vault' },
  ];
}

// ── Render: Category Nav ──────────────────────────────────────────────────────
function buildCategoryNav(services) {
  const nav = document.getElementById('cat-nav');
  if (!nav) return;

  const counts = { all: services.length };
  services.forEach(s => {
    const k = s.category ?? 'Other';
    counts[k] = (counts[k] ?? 0) + 1;
  });

  const categories = [...new Set(services.map(s => s.category ?? 'Other'))].sort();

  nav.innerHTML = `
    <div class="cat-section-label">Categories</div>
    <button class="cat-item ${state.activeCategory === 'all' ? 'active' : ''}" data-cat="all">
      <span class="cat-dot" style="background: linear-gradient(135deg, #22d3ee, #818cf8)"></span>
      <span class="cat-label">All Services</span>
      <span class="cat-offline-count" style="display:none">0</span>
      <span class="cat-count">${counts.all}</span>
    </button>
    ${categories.map(cat => `
      <button class="cat-item ${state.activeCategory === cat.toLowerCase() ? 'active' : ''}" data-cat="${cat.toLowerCase()}">
        <span class="cat-dot" style="background: ${catColor(cat)}"></span>
        <span class="cat-label">${cat}</span>
        <span class="cat-offline-count" style="display:none">0</span>
        <span class="cat-count">${counts[cat] ?? 0}</span>
      </button>
    `).join('')}
  `;

  nav.querySelectorAll('.cat-item').forEach(btn => {
    btn.addEventListener('click', () => {
      state.activeCategory = btn.dataset.cat;
      state.statusFilter   = null;   // reset status filter on category change
      updatePillActiveState();
      nav.querySelectorAll('.cat-item').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const heading = document.getElementById('topbar-heading');
      if (heading) {
        heading.textContent = state.activeCategory === 'all'
          ? 'All Services'
          : btn.querySelector('.cat-label').textContent.trim();
      }
      renderServices();
    });
  });
}

// ── Render: Single Card ───────────────────────────────────────────────────────
function buildCardHTML(svc) {
  const id     = svcId(svc);
  const color  = catColor(svc.category);
  const status = state.statusMap[id] ?? 'loading';
  const stats  = state.statsMap[id] ?? [];

  const statusLabel = { online: 'Online', offline: 'Offline', loading: 'Checking…' }[status] ?? '—';

  const statsHTML = stats.map(s => `
    <div class="stat-chip">
      <span class="s-label">${s.label}</span>
      <span class="s-value">${s.value}</span>
    </div>`).join('');

  const iconHTML = svc.logo
    ? `<img src="logos/${svc.logo}" alt="${svc.name}" class="service-logo-img">`
    : (svc.icon ?? '⚙️');

  return `
    <a href="${svc.url}" target="_blank" rel="noopener noreferrer" class="service-card" id="card-${id}" style="--card-accent:${color}" data-cat="${(svc.category ?? '').toLowerCase()}" data-name="${svc.name.toLowerCase()}" data-desc="${(svc.description ?? '').toLowerCase()}">
      <div class="card-stripe"></div>
      <div class="card-body">
        <div class="card-header">
          <div class="service-icon">${iconHTML}</div>
          <div class="card-title-block">
            <div class="service-name">${svc.name}</div>
            <span class="service-category-badge">${svc.category ?? 'Other'}</span>
          </div>
          <div class="service-status ${status}" id="status-${id}">
            <span class="status-dot ${status}"></span>
            <span class="status-text">${statusLabel}</span>
          </div>
        </div>
        <p class="service-desc" id="desc-${id}">${svc.description ?? ''}</p>
        <div class="service-stats" id="stats-${id}">${statsHTML}</div>
      </div>
      <div class="card-accent-bar"></div>
    </a>`;
}

// ── Render: Grouped sections ──────────────────────────────────────────────────
function renderGrouped(services) {
  const groups = {};
  services.forEach(s => {
    const cat = s.category ?? 'Other';
    if (!groups[cat]) groups[cat] = [];
    groups[cat].push(s);
  });
  return Object.entries(groups)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([cat, svcs]) => {
      const color = catColor(cat);
      return `
        <div class="cat-section">
          <div class="cat-section-header">
            <span class="cat-section-dot" style="background:${color};box-shadow:0 0 7px ${color}80"></span>
            <h2 class="cat-section-title" style="color:${color}">${cat}</h2>
            <div class="cat-section-rule" style="background:${color}"></div>
            <span class="cat-section-count" style="color:${color}">${svcs.length}</span>
          </div>
          <div class="cat-section-grid">
            ${svcs.map(s => buildCardHTML(s)).join('')}
          </div>
        </div>`;
    }).join('');
}

// ── Render: Grid ──────────────────────────────────────────────────────────────
function renderServices() {
  const grid       = document.getElementById('services-grid');
  const emptyState = document.getElementById('empty-state');
  if (!grid) return;

  let filtered = state.services;

  if (state.activeCategory !== 'all') {
    filtered = filtered.filter(s => (s.category ?? '').toLowerCase() === state.activeCategory);
  }

  if (state.searchQuery) {
    const q = state.searchQuery;
    filtered = filtered.filter(s =>
      s.name.toLowerCase().includes(q) ||
      (s.category ?? '').toLowerCase().includes(q) ||
      (s.description ?? '').toLowerCase().includes(q)
    );
  }

  if (state.statusFilter) {
    filtered = filtered.filter(s => (state.statusMap[svcId(s)] ?? 'loading') === state.statusFilter);
  }

  if (filtered.length === 0) {
    grid.innerHTML = '';
    grid.classList.remove('view-grouped');
    emptyState?.classList.remove('hidden');
    return;
  }
  emptyState?.classList.add('hidden');

  const grouped = state.dashView === 'grouped';
  grid.classList.toggle('view-grouped', grouped);
  grid.innerHTML = grouped ? renderGrouped(filtered) : filtered.map(s => buildCardHTML(s)).join('');

  // Stagger entrance animation + random online-text collapse delay
  grid.querySelectorAll('.service-card').forEach((card, i) => {
    card.style.animationDelay = `${i * 45}ms`;
  });
  grid.querySelectorAll('.service-status.online .status-text').forEach(el => {
    el.style.animationDelay = '5s';
  });

  updateCounters();
}

// ── Update status + stats for one service ─────────────────────────────────────
async function updateService(svc) {
  const id = svcId(svc);

  // Status check
  const prevStatus = state.statusMap[id];
  const online     = await checkStatus(svc.endpoint ?? svc.url);
  state.statusMap[id] = online ? 'online' : 'offline';

  // Only touch the DOM if status changed or was still loading — avoids
  // resetting the collapse animation on cards that are already online.
  const statusEl = document.getElementById(`status-${id}`);
  if (statusEl && (prevStatus !== state.statusMap[id] || prevStatus === 'loading')) {
    const delayAttr = online ? ' style="animation-delay:5s"' : '';
    statusEl.className = `service-status ${online ? 'online' : 'offline'}`;
    statusEl.innerHTML = `<span class="status-dot ${online ? 'online' : 'offline'}"></span><span class="status-text"${delayAttr}>${online ? 'Online' : 'Offline'}</span>`;
  }

  // API data
  if (online && svc.api_type && API_HANDLERS[svc.api_type]) {
    const stats = await API_HANDLERS[svc.api_type](svc);
    if (stats) {
      state.statsMap[id] = stats;
      const statsEl = document.getElementById(`stats-${id}`);
      if (statsEl) {
        statsEl.innerHTML = stats.map(s => `
          <div class="stat-chip">
            <span class="s-label">${s.label}</span>
            <span class="s-value">${s.value}</span>
          </div>`).join('');
      }
    }
  }

  updateCounters();
}

// ── Counters ──────────────────────────────────────────────────────────────────
function updateCounters() {
  const vals    = Object.values(state.statusMap);
  const online  = vals.filter(v => v === 'online').length;
  const offline = vals.filter(v => v === 'offline').length;

  const setEl = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
  setEl('count-online',  online);
  setEl('count-offline', offline);
  setEl('count-total',   state.services.length);

  updatePillActiveState();
  updateCategoryOfflineCounts();
}

function updatePillActiveState() {
  document.getElementById('pill-online') ?.classList.toggle('active', state.statusFilter === 'online');
  document.getElementById('pill-offline')?.classList.toggle('active', state.statusFilter === 'offline');
  // total pill: no persistent active state — it's just a reset trigger
}

// ── Status filter (topbar pills) ──────────────────────────────────────────────
function initFilters() {
  const pills = {
    'pill-online':  'online',
    'pill-offline': 'offline',
    'pill-total':   null,
  };
  Object.entries(pills).forEach(([id, filter]) => {
    document.getElementById(id)?.addEventListener('click', () => {
      // Toggle: clicking the active filter turns it off
      state.statusFilter = (filter !== null && state.statusFilter === filter) ? null : filter;
      updatePillActiveState();
      renderServices();
    });
  });
}

// ── View toggle ───────────────────────────────────────────────────────────────
function initViewToggle() {
  document.querySelectorAll('.view-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.view === state.dashView);
    btn.addEventListener('click', () => {
      state.dashView = btn.dataset.view;
      localStorage.setItem('dashView', state.dashView);
      document.querySelectorAll('.view-btn').forEach(b =>
        b.classList.toggle('active', b.dataset.view === state.dashView)
      );
      renderServices();
    });
  });
}

function updateCategoryOfflineCounts() {
  const offlineCounts = { all: 0 };
  state.services.forEach(s => {
    if (state.statusMap[svcId(s)] === 'offline') {
      const cat = (s.category ?? 'Other').toLowerCase();
      offlineCounts[cat] = (offlineCounts[cat] ?? 0) + 1;
      offlineCounts.all++;
    }
  });

  document.querySelectorAll('#cat-nav .cat-item').forEach(btn => {
    const cat = btn.dataset.cat;
    const count = offlineCounts[cat] ?? 0;
    const el = btn.querySelector('.cat-offline-count');
    if (!el) return;
    el.textContent = count;
    el.style.display = count > 0 ? '' : 'none';
  });
}

// ── Refresh all ───────────────────────────────────────────────────────────────
async function refreshAll() {
  const btn = document.getElementById('refresh-btn');
  btn?.classList.add('spinning');

  await Promise.allSettled(state.services.map(updateService));

  btn?.classList.remove('spinning');

  const now = new Date();
  const pad = n => String(n).padStart(2, '0');
  const el  = document.getElementById('last-updated');
  if (el) el.textContent = `Updated ${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;

  state.nextRefreshAt = Date.now() + CONFIG.refreshInterval;
}

// ── Countdown display ─────────────────────────────────────────────────────────
function startCountdown() {
  clearInterval(state.countdownTimer);
  state.countdownTimer = setInterval(() => {
    const el = document.getElementById('next-refresh');
    if (!el || !state.nextRefreshAt) return;
    const secs = Math.max(0, Math.ceil((state.nextRefreshAt - Date.now()) / 1000));
    el.textContent = `↺ ${secs}s`;
  }, 1000);
}

// ── Clock ─────────────────────────────────────────────────────────────────────
function startClock() {
  const el = document.getElementById('clock');
  if (!el) return;
  const pad = n => String(n).padStart(2, '0');
  const DAYS   = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  function tick() {
    const d = new Date();
    el.textContent = `${DAYS[d.getDay()]} ${pad(d.getDate())} ${MONTHS[d.getMonth()]}  ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  }
  tick();
  setInterval(tick, 1000);
}

// ── Toasts ────────────────────────────────────────────────────────────────────
function showToast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  if (!container) return;
  const icons = { info: 'ℹ️', success: '✅', error: '⚠️' };
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.innerHTML = `<span class="toast-icon">${icons[type] ?? 'ℹ️'}</span><span>${message}</span>`;
  container.appendChild(el);
  setTimeout(() => {
    el.classList.add('hiding');
    el.addEventListener('animationend', () => el.remove());
  }, 4500);
}

// ── Sidebar toggle (mobile) ───────────────────────────────────────────────────
function initSidebarToggle() {
  const btn     = document.getElementById('sidebar-toggle');
  const sidebar = document.getElementById('sidebar');
  const overlay = document.getElementById('sidebar-overlay');
  if (!btn || !sidebar) return;

  function closeSidebar() {
    sidebar.classList.remove('open');
    overlay?.classList.remove('active');
    document.body.classList.remove('sidebar-open');
    btn.setAttribute('aria-expanded', 'false');
  }

  btn.addEventListener('click', () => {
    const open = sidebar.classList.toggle('open');
    overlay?.classList.toggle('active', open);
    document.body.classList.toggle('sidebar-open', open);
    btn.setAttribute('aria-expanded', open);
  });

  // Overlay is purely visual — close by detecting taps outside the sidebar.
  // pointer-events: none on #main-content means those taps fall through to document
  // without activating the card underneath.
  document.addEventListener('click', e => {
    if (sidebar.classList.contains('open') &&
        !sidebar.contains(e.target) &&
        !btn.contains(e.target)) {
      closeSidebar();
    }
  });
}

// ── Init ──────────────────────────────────────────────────────────────────────
async function init() {
  startClock();
  initSidebarToggle();
  initFilters();
  initViewToggle();

  // Load YAML
  state.services = await loadServices();

  // Build category nav
  buildCategoryNav(state.services);

  // Hide loader, render cards (all in loading state)
  document.getElementById('loading-overlay')?.classList.add('hidden');
  renderServices();

  // Set all statuses to loading initially
  state.services.forEach(s => { state.statusMap[svcId(s)] = 'loading'; });

  // First full refresh
  await refreshAll();

  // Auto-refresh
  state.nextRefreshAt = Date.now() + CONFIG.refreshInterval;
  startCountdown();
  state.refreshTimer = setInterval(async () => {
    await refreshAll();
    state.nextRefreshAt = Date.now() + CONFIG.refreshInterval;
  }, CONFIG.refreshInterval);

  // Manual refresh button
  document.getElementById('refresh-btn')?.addEventListener('click', async () => {
    clearInterval(state.refreshTimer);
    await refreshAll();
    state.nextRefreshAt = Date.now() + CONFIG.refreshInterval;
    state.refreshTimer = setInterval(async () => {
      await refreshAll();
      state.nextRefreshAt = Date.now() + CONFIG.refreshInterval;
    }, CONFIG.refreshInterval);
  });

  // Search
  document.getElementById('search')?.addEventListener('input', debounce(e => {
    state.searchQuery = e.target.value.trim().toLowerCase();
    renderServices();
  }, 220));
}

document.addEventListener('DOMContentLoaded', init);
