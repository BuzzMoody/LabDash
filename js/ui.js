'use strict';

import { CONFIG }                from './config.js';
import { state }                 from './state.js';
import { catColor }              from './utils.js';
import { renderServices }        from './render.js';
import { updatePillActiveState } from './counters.js';

// ── Category navigation ───────────────────────────────────────────────────────
// Builds the sidebar category list from the loaded services array and wires up
// click handlers to filter the grid.

export function buildCategoryNav(services) {
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

// ── Status filter pills ───────────────────────────────────────────────────────
// Clicking the online/offline/total pills in the topbar filters the grid.
// Clicking the active pill again clears the filter.

export function initFilters() {
	const pills = {
		'pill-online':  'online',
		'pill-offline': 'offline',
		'pill-total':   null,
	};
	Object.entries(pills).forEach(([id, filter]) => {
		document.getElementById(id)?.addEventListener('click', () => {
			state.statusFilter = (filter !== null && state.statusFilter === filter) ? null : filter;
			updatePillActiveState();
			renderServices();
		});
	});
}

// ── View toggle (grouped / list) ──────────────────────────────────────────────

export function initViewToggle() {
	document.querySelectorAll('.view-btn[data-view]').forEach(btn => {
		btn.classList.toggle('active', btn.dataset.view === state.dashView);
		btn.addEventListener('click', () => {
			state.dashView = btn.dataset.view;
			localStorage.setItem('dashView', state.dashView);
			document.querySelectorAll('.view-btn[data-view]').forEach(b =>
				b.classList.toggle('active', b.dataset.view === state.dashView)
			);
			renderServices();
		});
	});
}

// ── Sort toggle (alphabetical) ────────────────────────────────────────────────

export function initSortToggle() {
	const btn = document.getElementById('sort-alpha-btn');
	if (!btn) return;
	btn.classList.toggle('active', state.sortAlpha);
	btn.setAttribute('aria-pressed', state.sortAlpha);
	btn.addEventListener('click', () => {
		state.sortAlpha = !state.sortAlpha;
		localStorage.setItem('sortAlpha', state.sortAlpha);
		btn.classList.toggle('active', state.sortAlpha);
		btn.setAttribute('aria-pressed', state.sortAlpha);
		renderServices();
	});
}

// ── Sidebar toggle (mobile) ───────────────────────────────────────────────────

export function initSidebarToggle() {
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

	// Close sidebar when clicking outside of it
	document.addEventListener('click', e => {
		if (sidebar.classList.contains('open') &&
			!sidebar.contains(e.target) &&
			!btn.contains(e.target)) {
			closeSidebar();
		}
	});
}

// ── Clock ─────────────────────────────────────────────────────────────────────

export function startClock() {
	const el = document.getElementById('clock');
	if (!el) return;

	const pad    = n => String(n).padStart(2, '0');
	const DAYS   = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
	const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

	function tick() {
		const d = new Date();
		el.textContent =
			`${DAYS[d.getDay()]} ${pad(d.getDate())} ${MONTHS[d.getMonth()]}` +
			`  ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
	}

	tick();
	setInterval(tick, 1000);
}

// ── Refresh countdown ─────────────────────────────────────────────────────────
// Ticks every second and displays the time until the next full refresh cycle.

export function startCountdown() {
	clearInterval(state.countdownTimer);
	state.countdownTimer = setInterval(() => {
		const el = document.getElementById('next-refresh');
		if (!el || !state.nextRefreshAt) return;
		const secs = Math.max(0, Math.ceil((state.nextRefreshAt - Date.now()) / 1000));
		el.textContent = `↺ ${secs}s`;
		if (secs === 0) state.nextRefreshAt = Date.now() + CONFIG.refreshInterval;
	}, 1000);
}
