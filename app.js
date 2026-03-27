'use strict';

import { API_HANDLERS } from './api-managers/index.js';

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

const state = {
	services: [],
	activeCategory: 'all',
	searchQuery: '',
	statusFilter: null,
	dashView: localStorage.getItem('dashView') ?? 'flat',
	statusMap: {},
	statsMap: {},
	refreshTimer: null,
	countdownTimer: null,
	nextRefreshAt: null,
	settings: {},
};

// --- Utilities ---

const catColor = (cat) => CATEGORY_COLORS[(cat ?? '').toLowerCase()] ?? '#94a3b8';

const svcId = (svc) => svc.name.toLowerCase().replace(/[^a-z0-9]/g, '-');

const fmtNum = (n) => (n == null || isNaN(n)) ? '—' : Number(n).toLocaleString();

const debounce = (fn, ms) => {
	let t;
	return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
};

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
		await timedFetch(url, { mode: 'no-cors' }, CONFIG.statusTimeout);
		return true;
	} catch {
		return false;
	}
}

// --- Data Loading ---

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
		return []; 
	}
}

// --- Rendering Logic ---

function buildCardHTML(svc) {
	const id = svcId(svc);
	const color = catColor(svc.category);
	const status = state.statusMap[id] ?? 'loading';
	const stats = state.statsMap[id] ?? [];
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
		<a href="${svc.url}" target="_blank" rel="noopener noreferrer" class="service-card" id="card-${id}" style="--card-accent:${color}">
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
				<p class="service-desc">${svc.description ?? ''}</p>
				<div class="service-stats" id="stats-${id}">${statsHTML}</div>
			</div>
			<div class="card-accent-bar"></div>
		</a>`;
}

function renderServices() {
	const grid = document.getElementById('services-grid');
	if (!grid) return;

	let filtered = state.services.filter(s => {
		const matchesCat = state.activeCategory === 'all' || (s.category ?? '').toLowerCase() === state.activeCategory;
		const matchesSearch = !state.searchQuery || 
			s.name.toLowerCase().includes(state.searchQuery) || 
			(s.category ?? '').toLowerCase().includes(state.searchQuery);
		const matchesStatus = !state.statusFilter || (state.statusMap[svcId(s)] ?? 'loading') === state.statusFilter;
		
		return matchesCat && matchesSearch && matchesStatus;
	});

	grid.innerHTML = filtered.map(s => buildCardHTML(s)).join('');
	updateCounters();
}

// --- Core Updates ---

async function updateService(svc) {
	const id = svcId(svc);
	const online = await checkStatus(svc.endpoint ?? svc.url);
	state.statusMap[id] = online ? 'online' : 'offline';

	const statusEl = document.getElementById(`status-${id}`);
	if (statusEl) {
		const s = state.statusMap[id];
		statusEl.className = `service-status ${s}`;
		statusEl.querySelector('.status-dot').className = `status-dot ${s}`;
		statusEl.querySelector('.status-text').textContent = online ? 'Online' : 'Offline';
	}

	if (online && svc.api_type && API_HANDLERS[svc.api_type]) {
		const stats = await API_HANDLERS[svc.api_type](svc, timedFetch, { fmtNum });
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

async function refreshAll() {
	const btn = document.getElementById('refresh-btn');
	btn?.classList.add('spinning');
	await Promise.allSettled(state.services.map(updateService));
	btn?.classList.remove('spinning');
	state.nextRefreshAt = Date.now() + CONFIG.refreshInterval;
}

function updateCounters() {
	const vals = Object.values(state.statusMap);
	const online = vals.filter(v => v === 'online').length;
	const offline = vals.filter(v => v === 'offline').length;

	const setEl = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
	setEl('count-online', online);
	setEl('count-offline', offline);
	setEl('count-total', state.services.length);
}

// --- Initialization ---

async function init() {
	state.services = await loadServices();
	document.getElementById('loading-overlay')?.classList.add('hidden');
	renderServices();

	await refreshAll();

	setInterval(refreshAll, CONFIG.refreshInterval);

	document.getElementById('search')?.addEventListener('input', debounce(e => {
		state.searchQuery = e.target.value.trim().toLowerCase();
		renderServices();
	}, 220));
}

document.addEventListener('DOMContentLoaded', init);