'use strict';

import { API_HANDLERS } from './api-managers/index.js';

// ── Config ───────────────────────────────────────────────────────────────────
const CONFIG = {
	yamlPath: './services.yaml',
	refreshInterval: 30_000,
	statusInterval:  60_000,   // ping checks run at half the stats rate
	apiTimeout: 7_000,
	statusTimeout: 5_000,
};

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

// ── State ────────────────────────────────────────────────────────────────────
const state = {
	services: [],
	activeCategory: 'all',
	searchQuery: '',
	statusFilter: null,
	dashView: localStorage.getItem('dashView') ?? 'grouped',
	statusMap: {},
	statsMap: {},
	svcTimers: {},
	svcStarts: {},           // initial stagger timeouts (cleared alongside svcTimers)
	inFlight: new Set(),     // service IDs currently being updated (dedup guard)
	lastStatusCheck: {},     // timestamps of last ping per service ID
	countdownTimer: null,
	nextRefreshAt: null,
	settings: {},
	updateAvailable: false,
	latestVersion:   null,
};

// ── Utilities ─────────────────────────────────────────────────────────────────
const catColor = (cat) => CATEGORY_COLORS[(cat ?? '').toLowerCase()] ?? '#94a3b8';
const svcId    = (svc) => svc.name.toLowerCase().replace(/[^a-z0-9]/g, '-');
const fmtNum   = (n)   => (n == null || isNaN(n)) ? '—' : Number(n).toLocaleString();
const fmtBytes = (b)   => {
	if (b == null || isNaN(b)) return '—';
	const units = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];
	let i = 0;
	while (b >= 1024 && i < units.length - 1) { b /= 1024; i++; }
	return `${b.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
};

function debounce(fn, ms) {
	let t;
	return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}

async function timedFetch(url, opts = {}, timeout = CONFIG.apiTimeout) {
	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), timeout);
	try {
		return await fetch(url, { ...opts, signal: controller.signal });
	} finally {
		clearTimeout(timer);
	}
}

async function checkStatus(url) {
	try {
		// Proxy the check through PHP — server-side requests have no CORS
		// restrictions so we always get the real HTTP status code (incl. 502).
		const res  = await timedFetch(`/ping?url=${encodeURIComponent(url)}`, {}, CONFIG.statusTimeout);
		const data = await res.json();
		// status 0 means PHP couldn't reach the host at all
		if (!data.status || data.status === 502 || data.status === 503 || data.status === 504) return false;
		return true;
	} catch {
		return false;
	}
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

// ── Data Loading ──────────────────────────────────────────────────────────────
async function loadServices() {
	try {
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
			
			// Apply layout modifiers based on yaml settings:
			if (config.settings.icons_only) {
				document.body.classList.add('icons-only-mode');
			} else {
				document.body.classList.remove('icons-only-mode');
			}
			
			if (config.settings.hide_descriptions) {
				document.body.classList.add('hide-descriptions-mode');
			} else {
				document.body.classList.remove('hide-descriptions-mode');
			}
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
		{ name: 'Jellyfin',       url: 'http://localhost:8096',  category: 'Media',          icon: '🎦', description: 'Open-source media server',   api_type: 'jellyfin' },
		{ name: 'Sonarr',         url: 'http://localhost:8989',  category: 'Media',          icon: '📺', description: 'TV show management',          api_type: 'sonarr' },
		{ name: 'Radarr',         url: 'http://localhost:7878',  category: 'Media',          icon: '🎥', description: 'Movie management',             api_type: 'radarr' },
		{ name: 'qBittorrent',    url: 'http://localhost:8080',  category: 'Downloads',      icon: '⬇️', description: 'Torrent client',              api_type: 'qbittorrent' },
		{ name: 'Proxmox',        url: 'https://localhost:8006', category: 'Infrastructure', icon: '🖥️', description: 'Virtualization platform',     api_type: 'proxmox' },
		{ name: 'Portainer',      url: 'http://localhost:9000',  category: 'Infrastructure', icon: '🐳', description: 'Container management',         api_type: 'portainer' },
		{ name: 'Glances',        url: 'http://localhost:61208', category: 'Infrastructure', icon: '📊', description: 'System monitor',               api_type: 'glances' },
		{ name: 'Grafana',        url: 'http://localhost:3000',  category: 'Monitoring',     icon: '📈', description: 'Metrics & dashboards',         api_type: 'grafana' },
		{ name: 'Immich',         url: 'http://localhost:2283',  category: 'Storage',        icon: '📸', description: 'Photo backup',                 api_type: 'immich' },
		{ name: 'Nextcloud',      url: 'http://localhost:8081',  category: 'Storage',        icon: '☁️', description: 'File sync',                   api_type: 'nextcloud' },
		{ name: 'Pi-hole',        url: 'http://localhost',       category: 'Network',        icon: '🛡️', description: 'DNS ad blocker',              api_type: 'pihole' },
		{ name: 'AdGuard',        url: 'http://localhost:3001',  category: 'Network',        icon: '🔒', description: 'DNS tracker blocker',          api_type: 'adguard' },
		{ name: 'Home Assistant', url: 'http://localhost:8123',  category: 'Smart Home',     icon: '🏠', description: 'Home automation',              api_type: 'homeassistant' },
		{ name: 'Vaultwarden',    url: 'http://localhost:8222',  category: 'Security',       icon: '🔐', description: 'Password vault' },
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
			state.statusFilter   = null;
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

	const fallbackIcon = svc.icon ?? '⚙️';
	const iconHTML = svc.logo
		? `<span class="service-icon-emoji">${fallbackIcon}</span><img src="logos/${svc.logo}" alt="${svc.name}" class="service-logo-img" style="display:none" onload="this.style.display='';this.previousElementSibling.style.display='none'" onerror="this.remove()">`
		: fallbackIcon;

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
				<div class="stats-scroll-wrapper">
					<div class="service-stats" id="stats-${id}">${statsHTML}</div>
					</div>
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

	grid.querySelectorAll('.service-card').forEach((card, i) => {
		card.style.animationDelay = `${i * 45}ms`;
	});
	grid.querySelectorAll('.service-status.online .status-text').forEach(el => {
		el.style.animationDelay = '5s';
	});

	updateCounters();
	requestAnimationFrame(initAllStatsDrag);
}

// ── Update status + stats for one service ─────────────────────────────────────
// statusOverride: boolean (from batch ping) or null (do individual ping if due)
async function updateService(svc, statusOverride = null) {
	const id = svcId(svc);

	// Skip if an update is already in flight for this service
	if (state.inFlight.has(id)) return;
	state.inFlight.add(id);

	try {
		const prevStatus = state.statusMap[id];
		let online;

		if (statusOverride !== null) {
			// Status supplied by batch ping — record timestamp and use it directly
			online = statusOverride;
			state.lastStatusCheck[id] = Date.now();
		} else {
			const now       = Date.now();
			const lastCheck = state.lastStatusCheck[id] ?? 0;
			// Always re-ping offline services — never cache a down state
			if (now - lastCheck >= CONFIG.statusInterval || prevStatus === 'loading' || prevStatus === 'offline') {
				// Ping is due
				online = await checkStatus(svc.endpoint ?? svc.url);
				state.lastStatusCheck[id] = now;
			} else {
				// Reuse cached status — only fetch stats this tick
				online = prevStatus === 'online';
			}
		}

		state.statusMap[id] = online ? 'online' : 'offline';

		const statusEl = document.getElementById(`status-${id}`);
		if (statusEl && (prevStatus !== state.statusMap[id] || prevStatus === 'loading')) {
			const delayAttr = online ? ' style="animation-delay:5s"' : '';
			statusEl.className = `service-status ${online ? 'online' : 'offline'}`;
			statusEl.innerHTML = `<span class="status-dot ${online ? 'online' : 'offline'}"></span><span class="status-text"${delayAttr}>${online ? 'Online' : 'Offline'}</span>`;
		}

		if (online && svc.api_type && API_HANDLERS[svc.api_type]) {
			const stats = await API_HANDLERS[svc.api_type](svc, timedFetch, { fmtNum, fmtBytes });
			if (stats) {
				const prevStats = state.statsMap[id];
				state.statsMap[id] = stats;
				const statsEl = document.getElementById(`stats-${id}`);
				if (statsEl) {
					const prevLabels = (prevStats ?? []).map(s => s.label).join(',');
					const newLabels  = stats.map(s => s.label).join(',');

					if (prevLabels !== newLabels) {
						// Structure changed — stop scroll, full rebuild, restart
						statsEl.parentElement?._stopScroll?.();
						statsEl.innerHTML = stats.map(s => `
							<div class="stat-chip">
								<span class="s-label">${s.label}</span>
								<span class="s-value">${s.value}</span>
							</div>`).join('');
						// Animate in when chips appear for the first time
						if (!prevStats) {
							const wrapper = statsEl.parentElement;
							wrapper.classList.add('stats-entering');
							wrapper.addEventListener('animationend', () => wrapper.classList.remove('stats-entering'), { once: true });
						}
						requestAnimationFrame(() => updateStatsFades(statsEl));
					} else {
						// Same structure — update originals AND clones in place so the
						// scroll animation never needs to stop and restart
						const origChips  = statsEl.querySelectorAll('.stat-chip:not([data-scroll-clone])');
						const cloneChips = statsEl.querySelectorAll('.stat-chip[data-scroll-clone]');
						stats.forEach((s, i) => {
							const newVal  = String(s.value);
							const chip    = origChips[i];
							if (!chip) return;
							const valueEl = chip.querySelector('.s-value');
							if (valueEl && valueEl.textContent !== newVal) {
								valueEl.textContent = newVal;
								chip.classList.remove('stat-updated');
								void chip.offsetWidth; // force reflow to restart flash animation
								chip.classList.add('stat-updated');
							}
							const cloneValueEl = cloneChips[i]?.querySelector('.s-value');
							if (cloneValueEl) cloneValueEl.textContent = newVal;
						});
					}
				}
			}
		}

		updateCounters();
		setLastUpdated();
	} finally {
		state.inFlight.delete(id);
	}
}

// ── Last updated timestamp ─────────────────────────────────────────────────────
function setLastUpdated() {
	const el  = document.getElementById('last-updated');
	if (!el) return;
	const now = new Date();
	const pad = n => String(n).padStart(2, '0');
	el.textContent = `Updated ${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
}

// ── Stats scroll ─────────────────────────────────────────────────────────────

function updateStatsFades(statsEl) {
	const wrapper = statsEl?.parentElement;
	if (!wrapper) return;

	// While the CSS animation is running, scrollWidth === clientWidth (width: max-content),
	// so the normal overflow check is meaningless. Keep both fades visible and bail out.
	if (statsEl.classList.contains('is-auto-scrolling')) return;

	const canScroll    = statsEl.scrollWidth > statsEl.clientWidth + 2;
	const atStart      = statsEl.scrollLeft <= 2;
	const atEnd        = statsEl.scrollLeft >= statsEl.scrollWidth - statsEl.clientWidth - 2;
	const cloneRunning = statsEl.querySelector('[data-scroll-clone]') !== null;
	statsEl.classList.toggle('can-scroll', canScroll);
	// Auto-start infinite scroll whenever overflow is detected and it isn't already running
	if (canScroll && !cloneRunning) wrapper._startScroll?.();
	else if (!canScroll && cloneRunning) wrapper._stopScroll?.();
}

function initStatsDrag(wrapper) {
	const statsEl = wrapper.querySelector('.service-stats');
	const card    = wrapper.closest('.service-card');
	if (!statsEl) return;

	// ── Infinite scroll — CSS animation (compositor thread, never throttled) ──
	// Clones chips to form a seamless double-length strip, then applies a CSS
	// @keyframes animation so Chrome always runs it at full frame rate regardless
	// of mouse activity. Started/stopped by updateStatsFades via wrapper callbacks.
	const SCROLL_SPEED = 30; // px per second

	function stopScroll() {
		// Capture position BEFORE removing the animation — getComputedStyle returns
		// 'none' the moment the class is gone, so we must read it first and stash
		// it on the wrapper so startScroll can resume from the same pixel later.
		if (statsEl.classList.contains('is-auto-scrolling')) {
			const matrix = new DOMMatrix(getComputedStyle(statsEl).transform);
			wrapper._resumeOffset = Math.abs(matrix.m41);
		}
		statsEl.classList.remove('is-auto-scrolling');
		statsEl.style.animationDuration = '';
		statsEl.style.animationDelay    = '';
		statsEl.style.removeProperty('--scroll-loop-w');
		statsEl.querySelectorAll('[data-scroll-clone]').forEach(el => el.remove());
	}

	function startScroll() {
		stopScroll(); // captures current offset into wrapper._resumeOffset
		if (!statsEl.classList.contains('can-scroll')) return;

		const resumeOffset = wrapper._resumeOffset ?? 0;

		// Clone chips to create a seamless double-length strip
		statsEl.querySelectorAll('.stat-chip:not([data-scroll-clone])').forEach(chip => {
			const clone = chip.cloneNode(true);
			clone.setAttribute('data-scroll-clone', '');
			clone.setAttribute('aria-hidden', 'true');
			statsEl.appendChild(clone);
		});

		// Add the animating class (sets width: max-content), then force a sync
		// reflow so offsetLeft is accurate before setting the loop width
		statsEl.classList.add('is-auto-scrolling');
		void statsEl.offsetWidth;

		// Measure exact start of first clone for a pixel-perfect seamless loop
		const firstClone = statsEl.querySelector('[data-scroll-clone]');
		const loopW      = firstClone ? firstClone.offsetLeft : statsEl.scrollWidth / 2;
		const duration   = loopW / SCROLL_SPEED;
		// Negative delay seeks the animation to the same pixel position
		const delay      = -((resumeOffset % loopW) / loopW) * duration;

		statsEl.style.setProperty('--scroll-loop-w', `${loopW}px`);
		statsEl.style.animationDuration = `${duration}s`;
		statsEl.style.animationDelay    = `${delay}s`;
	}

	// Expose start/stop so updateStatsFades can trigger them automatically
	wrapper._startScroll = startScroll;
	wrapper._stopScroll  = stopScroll;

	// Initial fade state (deferred so layout is complete)
	requestAnimationFrame(() => updateStatsFades(statsEl));
}

function initAllStatsDrag() {
	document.querySelectorAll('.stats-scroll-wrapper').forEach(initStatsDrag);
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
		const count = offlineCounts[btn.dataset.cat] ?? 0;
		const el    = btn.querySelector('.cat-offline-count');
		if (!el) return;
		el.textContent    = count;
		el.style.display  = count > 0 ? '' : 'none';
	});
}

// ── Status filter (topbar pills) ──────────────────────────────────────────────
function initFilters() {
	const pills = { 'pill-online': 'online', 'pill-offline': 'offline', 'pill-total': null };
	Object.entries(pills).forEach(([id, filter]) => {
		document.getElementById(id)?.addEventListener('click', () => {
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

// ── Per-service timers ────────────────────────────────────────────────────────
function clearServiceTimers() {
	Object.values(state.svcTimers).forEach(clearInterval);
	Object.values(state.svcStarts).forEach(clearTimeout);
	state.svcTimers = {};
	state.svcStarts = {};
}

function startServiceTimers() {
	clearServiceTimers();
	const n = state.services.length;
	state.services.forEach((svc, i) => {
		const ms = svc.refresh != null ? svc.refresh * 1000 : CONFIG.refreshInterval;
		// Spread first ticks evenly across the interval so no thundering herd
		const firstDelay = n > 1 ? Math.round(((i + 1) / n) * ms) : ms;
		state.svcStarts[svcId(svc)] = setTimeout(() => {
			updateService(svc);
			state.svcTimers[svcId(svc)] = setInterval(() => updateService(svc), ms);
		}, firstDelay);
	});
	state.nextRefreshAt = Date.now() + CONFIG.refreshInterval;
}

// ── Batch status check ────────────────────────────────────────────────────────
// Sends all URLs in one request to /batch-ping (goroutine fan-out in Go).
// Falls back gracefully — if batch fails, updateService does individual pings.
async function batchCheckStatuses(services) {
	try {
		const params = new URLSearchParams();
		services.forEach(svc => params.append('urls[]', svc.endpoint ?? svc.url));
		const res  = await timedFetch(`/batch-ping?${params}`, {}, CONFIG.statusTimeout + 3000);
		return await res.json();
	} catch {
		return {};
	}
}

// ── Refresh ───────────────────────────────────────────────────────────────────
async function refreshAll() {
	const btn = document.getElementById('refresh-btn');
	btn?.classList.add('spinning');

	// One batch request replaces N individual /ping calls
	const batchResults = await batchCheckStatuses(state.services);

	await Promise.allSettled(state.services.map(svc => {
		const url    = svc.endpoint ?? svc.url;
		const code   = batchResults[url];
		// code 0 means HEAD not supported or no response — treat as unknown
		// so updateService falls back to an individual GET ping
		const online = (code == null || code === 0)
			? null
			: (code !== 502 && code !== 503 && code !== 504);
		return updateService(svc, online);
	}));

	btn?.classList.remove('spinning');
}

// ── Countdown ─────────────────────────────────────────────────────────────────
function startCountdown() {
	clearInterval(state.countdownTimer);
	state.countdownTimer = setInterval(() => {
		const el = document.getElementById('next-refresh');
		if (!el || !state.nextRefreshAt) return;
		const secs = Math.max(0, Math.ceil((state.nextRefreshAt - Date.now()) / 1000));
		el.textContent = `↺ ${secs}s`;
		if (secs === 0) state.nextRefreshAt = Date.now() + CONFIG.refreshInterval;
	}, 1000);
}

// ── Clock ─────────────────────────────────────────────────────────────────────
function startClock() {
	const el = document.getElementById('clock');
	if (!el) return;
	const pad    = n => String(n).padStart(2, '0');
	const DAYS   = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
	const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
	function tick() {
		const d = new Date();
		el.textContent = `${DAYS[d.getDay()]} ${pad(d.getDate())} ${MONTHS[d.getMonth()]}  ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
	}
	tick();
	setInterval(tick, 1000);
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

	document.addEventListener('click', e => {
		if (sidebar.classList.contains('open') &&
			!sidebar.contains(e.target) &&
			!btn.contains(e.target)) {
			closeSidebar();
		}
	});
}

// ── Changelog Modal ───────────────────────────────────────────────────────────
function simpleMarkdown(md) {
	const escape = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
	const inline = s => {
		const re = /(\*\*[^*]+\*\*|\[[^\]]+\]\([^)]+\)|https?:\/\/[^\s<>"]+)/g;
		const out = [];
		let last = 0, m;
		while ((m = re.exec(s)) !== null) {
			out.push(escape(s.slice(last, m.index)));
			const bold    = m[0].match(/^\*\*(.+)\*\*$/);
			const link    = m[0].match(/^\[(.+?)\]\((.+?)\)$/);
			const bareUrl = m[0].match(/^https?:\/\//);
			if (bold)    out.push(`<strong>${escape(bold[1])}</strong>`);
			else if (link)    out.push(`<a href="${link[2]}" target="_blank" rel="noopener noreferrer">${escape(link[1])}</a>`);
			else if (bareUrl) out.push(`<a href="${m[0]}" target="_blank" rel="noopener noreferrer">${escape(m[0])}</a>`);
			last = m.index + m[0].length;
		}
		out.push(escape(s.slice(last)));
		return out.join('');
	};

	const lines  = md.split('\n');
	const parts  = [];
	let inList   = false;

	for (const line of lines) {
		const h2 = line.match(/^## (.+)/);
		const li = line.match(/^- (.+)/);
		const hr = /^---/.test(line.trim());

		if (h2) {
			if (inList) { parts.push('</ul>'); inList = false; }
			parts.push(`<h2>${inline(h2[1])}</h2>`);
		} else if (li) {
			if (!inList) { parts.push('<ul>'); inList = true; }
			parts.push(`<li>${inline(li[1])}</li>`);
		} else if (hr) {
			if (inList) { parts.push('</ul>'); inList = false; }
			parts.push('<hr>');
		} else if (line.trim()) {
			if (inList) { parts.push('</ul>'); inList = false; }
			parts.push(`<p>${inline(line)}</p>`);
		}
	}
	if (inList) parts.push('</ul>');
	return parts.join('');
}

// ── Update checker ────────────────────────────────────────────────────────────

function parseSemver(v) {
	return (v ?? '').replace(/^v/, '').split('.').map(n => parseInt(n, 10) || 0);
}

function isNewerVersion(current, latest) {
	const [ca, cb, cc] = parseSemver(current);
	const [la, lb, lc] = parseSemver(latest);
	if (la !== ca) return la > ca;
	if (lb !== cb) return lb > cb;
	return lc > cc;
}

async function checkForUpdate() {
	try {
		const btn     = document.getElementById('version-btn');
		const current = btn?.textContent?.trim() ?? '';
		if (!current) return;

		const res = await fetch(
			'https://api.github.com/repos/BuzzMoody/LabDash/releases/latest',
			{ cache: 'no-store' }
		);
		if (!res.ok) return;

		const { tag_name: latest } = await res.json();
		if (!latest || !isNewerVersion(current, latest)) return;

		state.updateAvailable = true;
		state.latestVersion   = latest;

		// Add pulsing dot to the version button
		if (!btn.querySelector('.update-dot')) {
			const dot = document.createElement('span');
			dot.className = 'update-dot';
			dot.title     = `Update available: ${latest}`;
			btn.appendChild(dot);
			btn.classList.add('has-update');
		}
	} catch {
		// Silently fail — no internet or GitHub rate-limited
	}
}

function initChangelog() {
	const modal    = document.getElementById('changelog-modal');
	const bodyEl   = document.getElementById('changelog-body');
	const btn      = document.getElementById('version-btn');
	const closeBtn = modal?.querySelector('.changelog-close');
	const backdrop = modal?.querySelector('.changelog-backdrop');
	if (!modal || !btn) return;

	const md = (typeof window.__CHANGELOG__ === 'string') ? window.__CHANGELOG__.trim() : '';

	function openModal() {
		let html = '';
		if (state.updateAvailable && state.latestVersion) {
			html += `<div class="update-notice">
				<div class="update-notice-title">🚀 Update available &mdash; ${state.latestVersion}</div>
				<p>A newer version of LabDash is available. To update, run:</p>
				<pre class="update-cmd">docker compose pull &amp;&amp; docker compose up -d</pre>
				<p>Or if using a standalone <code>docker run</code>:</p>
				<pre class="update-cmd">docker pull buzzmoody/homelab-dash:latest</pre>
			</div>`;
		}
		html += md ? simpleMarkdown(md) : '<p>No release notes available.</p>';
		bodyEl.innerHTML = html;
		modal.classList.remove('hidden');
		document.body.style.overflow = 'hidden';
	}

	function closeModal() {
		modal.classList.add('hidden');
		document.body.style.overflow = '';
	}

	btn.addEventListener('click', openModal);
	closeBtn?.addEventListener('click', closeModal);
	backdrop?.addEventListener('click', closeModal);
	document.addEventListener('keydown', e => {
		if (e.key === 'Escape' && !modal.classList.contains('hidden')) closeModal();
	});
}

// ── Init ──────────────────────────────────────────────────────────────────────
async function init() {
	startClock();
	initSidebarToggle();
	initFilters();
	initViewToggle();
	initChangelog();
	checkForUpdate(); // fire-and-forget — updates UI when response arrives

	state.services = await loadServices();

	buildCategoryNav(state.services);

	document.getElementById('loading-overlay')?.classList.add('hidden');
	state.services.forEach(s => { state.statusMap[svcId(s)] = 'loading'; });
	renderServices();

	await refreshAll();

	startCountdown();
	startServiceTimers();

	document.getElementById('refresh-btn')?.addEventListener('click', async () => {
		clearServiceTimers();
		await refreshAll();
		startServiceTimers();
	});

	document.getElementById('search')?.addEventListener('input', debounce(e => {
		state.searchQuery = e.target.value.trim().toLowerCase();
		renderServices();
	}, 220));
}

document.addEventListener('DOMContentLoaded', init);