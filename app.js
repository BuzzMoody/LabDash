'use strict';

import { API_HANDLERS } from './api-managers/index.js';

// ── Config ───────────────────────────────────────────────────────────────────
const CONFIG = {
	yamlPath: './services.yaml',
	refreshInterval: 30_000,
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
	countdownTimer: null,
	nextRefreshAt: null,
	settings: {},
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
		const res  = await timedFetch(`/ping.php?url=${encodeURIComponent(url)}`, {}, CONFIG.statusTimeout);
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
				<div class="stats-scroll-wrapper">
					<div class="service-stats" id="stats-${id}">${statsHTML}</div>
					<div class="stats-fade stats-fade-l"></div>
					<div class="stats-fade stats-fade-r"></div>
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
async function updateService(svc) {
	const id = svcId(svc);

	const prevStatus = state.statusMap[id];
	const online     = await checkStatus(svc.endpoint ?? svc.url);
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
					// Structure changed — full rebuild, no flash
					statsEl.innerHTML = stats.map(s => `
						<div class="stat-chip">
							<span class="s-label">${s.label}</span>
							<span class="s-value">${s.value}</span>
						</div>`).join('');
				} else {
					// Same structure — update only changed values and flash those chips
					const chips = statsEl.querySelectorAll('.stat-chip');
					stats.forEach((s, i) => {
						const chip    = chips[i];
						if (!chip) return;
						const valueEl = chip.querySelector('.s-value');
						if (valueEl && valueEl.textContent !== String(s.value)) {
							valueEl.textContent = s.value;
							chip.classList.remove('stat-updated');
							void chip.offsetWidth; // force reflow to restart animation
							chip.classList.add('stat-updated');
						}
					});
				}

				requestAnimationFrame(() => updateStatsFades(statsEl));
			}
		}
	}

	updateCounters();
	setLastUpdated();
}

// ── Last updated timestamp ─────────────────────────────────────────────────────
function setLastUpdated() {
	const el  = document.getElementById('last-updated');
	if (!el) return;
	const now = new Date();
	const pad = n => String(n).padStart(2, '0');
	el.textContent = `Updated ${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
}

// ── Stats scroll + drag ───────────────────────────────────────────────────────
const statsDrag = { el: null, startX: 0, startScroll: 0 };

// Capture-phase click blocker — attached once per stats mousedown, auto-removes after first click
function blockNextClick(e) {
	e.preventDefault();
	e.stopPropagation();
}

function updateStatsFades(statsEl) {
	const wrapper = statsEl?.parentElement;
	if (!wrapper) return;
	const canScroll = statsEl.scrollWidth > statsEl.clientWidth + 2;
	const atStart   = statsEl.scrollLeft <= 2;
	const atEnd     = statsEl.scrollLeft >= statsEl.scrollWidth - statsEl.clientWidth - 2;
	statsEl.classList.toggle('can-scroll', canScroll);
	wrapper.querySelector('.stats-fade-l')?.classList.toggle('visible', canScroll && !atStart);
	wrapper.querySelector('.stats-fade-r')?.classList.toggle('visible', canScroll && !atEnd);
}

function initStatsDrag(wrapper) {
	const statsEl = wrapper.querySelector('.service-stats');
	const card    = wrapper.closest('.service-card');
	if (!statsEl) return;

	// ── Scroll-peek hint ───────────────────────────────────────────────────────
	let peekTimer = null, returnTimer = null;
	function cancelHint() {
		clearTimeout(peekTimer);
		clearTimeout(returnTimer);
		peekTimer = returnTimer = null;
	}

	if (card) {
		card.addEventListener('mouseenter', () => {
			if (!statsEl.classList.contains('can-scroll')) return;
			if (statsEl.scrollLeft > 2) return; // user already scrolled — don't interfere
			peekTimer = setTimeout(() => {
				statsEl.scrollTo({ left: 52, behavior: 'smooth' });
				returnTimer = setTimeout(() => {
					statsEl.scrollTo({ left: 0, behavior: 'smooth' });
				}, 560);
			}, 380);
		});

		card.addEventListener('mouseleave', () => {
			cancelHint();
			// Glide back if the peek is still in progress
			if (statsEl.scrollLeft > 0 && statsEl.scrollLeft <= 56) {
				statsEl.scrollTo({ left: 0, behavior: 'smooth' });
			}
		});
	}

	// ── Drag ──────────────────────────────────────────────────────────────────
	// Prevent clicks on the stats area from bubbling up to the <a> card link
	wrapper.addEventListener('click', e => {
		e.preventDefault();
		e.stopPropagation();
	});

	statsEl.addEventListener('mousedown', e => {
		cancelHint(); // don't let hint interfere with a deliberate drag
		statsDrag.el          = statsEl;
		statsDrag.startX      = e.clientX;
		statsDrag.startScroll = statsEl.scrollLeft;
		statsEl.classList.add('is-dragging');
		e.preventDefault();
		// Block the next click at document level (capture phase) so releasing
		// anywhere on the card — inside or outside the stats wrapper — never
		// triggers the <a> link navigation.
		document.addEventListener('click', blockNextClick, { capture: true, once: true });
	});

	// Update fades on native scroll (covers touch swipe)
	statsEl.addEventListener('scroll', () => updateStatsFades(statsEl), { passive: true });

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
	state.svcTimers = {};
}

function startServiceTimers() {
	clearServiceTimers();
	state.services.forEach(svc => {
		const ms = svc.refresh != null
			? svc.refresh * 1000
			: CONFIG.refreshInterval;
		state.svcTimers[svcId(svc)] = setInterval(() => updateService(svc), ms);
	});
	// Countdown tracks the default refresh cycle
	state.nextRefreshAt = Date.now() + CONFIG.refreshInterval;
}

// ── Refresh ───────────────────────────────────────────────────────────────────
async function refreshAll() {
	const btn = document.getElementById('refresh-btn');
	btn?.classList.add('spinning');

	await Promise.allSettled(state.services.map(updateService));

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

function initChangelog() {
	const modal    = document.getElementById('changelog-modal');
	const bodyEl   = document.getElementById('changelog-body');
	const btn      = document.getElementById('version-btn');
	const closeBtn = modal?.querySelector('.changelog-close');
	const backdrop = modal?.querySelector('.changelog-backdrop');
	if (!modal || !btn) return;

	const md = (typeof window.__CHANGELOG__ === 'string') ? window.__CHANGELOG__.trim() : '';

	function openModal() {
		bodyEl.innerHTML = md ? simpleMarkdown(md) : '<p>No release notes available.</p>';
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
	// Document-level handlers for stats drag (registered once)
	document.addEventListener('mousemove', e => {
		if (!statsDrag.el) return;
		statsDrag.el.scrollLeft = statsDrag.startScroll - (e.clientX - statsDrag.startX);
		updateStatsFades(statsDrag.el);
	});
	document.addEventListener('mouseup', () => {
		if (!statsDrag.el) return;
		statsDrag.el.classList.remove('is-dragging');
		statsDrag.el = null;
	});

	startClock();
	initSidebarToggle();
	initFilters();
	initViewToggle();
	initChangelog();

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