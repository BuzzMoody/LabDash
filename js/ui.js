'use strict';

import { CONFIG }                from './config.js';
import { state }                 from './state.js';
import { catColor }              from './utils.js';
import { renderServices }        from './render.js';
import { updatePillActiveState } from './counters.js';

// ── Section state ─────────────────────────────────────────────────────────────
// Each collapsible sidebar section stores its open/closed state in localStorage.
// Categories default to open, links and ping default to closed (auto-expanded on
// first visit if vertical space permits).

const SECTION_KEY      = 'sbSections';
const SECTION_DEFAULTS = { categories: true, links: false, ping: false };

function loadSectionState() {
	try { return { ...SECTION_DEFAULTS, ...JSON.parse(localStorage.getItem(SECTION_KEY) || '{}') }; }
	catch { return { ...SECTION_DEFAULTS }; }
}

function saveSectionState(s) {
	localStorage.setItem(SECTION_KEY, JSON.stringify(s));
}

// ── Collapsible section HTML helpers ──────────────────────────────────────────

const caretSVG = `<svg class="sb-caret" viewBox="0 0 10 10" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 2l4 3-4 3"/></svg>`;

function sectionWrap(name, label, content, isOpen) {
	return `
		<div class="sb-section${isOpen ? ' sb-open' : ''}" data-section="${name}">
			<button class="sb-hdr" aria-expanded="${isOpen}">
				${caretSVG}
				<span class="sb-label">${label}</span>
			</button>
			<div class="sb-body"><div class="sb-inner">${content}</div></div>
		</div>
	`;
}

// ── Categories ────────────────────────────────────────────────────────────────

function buildCatContent(services) {
	const counts = { all: services.length };
	services.forEach(s => {
		const k = s.category ?? 'Other';
		counts[k] = (counts[k] ?? 0) + 1;
	});
	const categories = [...new Set(services.map(s => s.category ?? 'Other'))].sort();

	return `
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
}

// ── External links ────────────────────────────────────────────────────────────

function buildLinksContent(links) {
	const arrowSVG = `<svg class="link-arrow" viewBox="0 0 10 10" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><path d="M2 1h7v7M9 1 1 9"/></svg>`;
	const iconHTML = icon => {
		if (!icon) return '🔗';
		return /\.(svg|png|webp|jpg|jpeg|ico)$/i.test(icon)
			? `<img src="/logos/${icon}" alt="" loading="lazy" class="link-logo" />`
			: icon;
	};
	return links.map(link => `
		<a class="link-item" href="${link.url}" target="_blank" rel="noopener noreferrer">
			<span class="link-icon">${iconHTML(link.icon)}</span>
			<span class="link-label">${link.name}</span>
			${arrowSVG}
		</a>
	`).join('');
}

// ── Ping bar (2-column grid above footer) ─────────────────────────────────────

function buildPingBar(endpoints) {
	const bar = document.getElementById('ping-bar');
	if (!bar) return;
	if (!endpoints?.length) { bar.innerHTML = ''; return; }
	bar.innerHTML = endpoints.map(ep => `
		<div class="ping-item" data-ping-host="${ep.destination}" data-ping-name="${ep.name ?? ep.destination}">
			${ep.logo
				? `<img class="ping-logo" src="/logos/${ep.logo}" alt="" loading="lazy" />`
				: `<span class="ping-logo-ph"></span>`}
			<span class="ping-ms">—</span>
		</div>
	`).join('');
}

// ── Auto-expand on first visit ────────────────────────────────────────────────
// Temporarily suppresses transitions so we can measure the nav height accurately,
// then opens as many sections as fit without causing a scroll, bottom-up.

function autoExpandSections(nav, hasLinks) {
	nav.classList.add('sb-no-trans');

	const open  = name => { nav.querySelector(`[data-section="${name}"]`)?.classList.add('sb-open'); };
	const close = name => { nav.querySelector(`[data-section="${name}"]`)?.classList.remove('sb-open'); };

	if (hasLinks) open('links');

	requestAnimationFrame(() => {
		requestAnimationFrame(() => {
			if (nav.scrollHeight > nav.clientHeight) {
				if (hasLinks) close('links');
			}
			nav.classList.remove('sb-no-trans');

			// Sync final open state back to localStorage
			const s = loadSectionState();
			s.links = !!nav.querySelector('[data-section="links"]')?.classList.contains('sb-open');
			saveSectionState(s);
		});
	});
}

// ── Build entire sidebar nav ──────────────────────────────────────────────────

export function buildSidebarSections(services, settings) {
	const nav = document.getElementById('cat-nav');
	if (!nav) return;

	const firstVisit = !localStorage.getItem(SECTION_KEY);
	const sState     = loadSectionState();
	const links      = settings?.external_links  ?? [];
	const pings      = settings?.ping_endpoints  ?? [];

	nav.innerHTML = [
		sectionWrap('categories', 'Categories', buildCatContent(services),   sState.categories),
		links.length ? sectionWrap('links', 'Links', buildLinksContent(links), sState.links) : '',
	].join('');

	buildPingBar(pings);

	// Wire section toggle buttons
	nav.querySelectorAll('.sb-hdr').forEach(hdr => {
		hdr.addEventListener('click', () => {
			const section = hdr.closest('.sb-section');
			const isOpen  = section.classList.toggle('sb-open');
			hdr.setAttribute('aria-expanded', isOpen);
			const s = loadSectionState();
			s[section.dataset.section] = isOpen;
			saveSectionState(s);
		});
	});

	// Wire category item clicks
	nav.querySelectorAll('.cat-item').forEach(btn => {
		btn.addEventListener('click', () => {
			state.activeCategory = btn.dataset.cat;
			state.statusFilter   = null;
			updatePillActiveState();
			nav.querySelectorAll('.cat-item').forEach(b => b.classList.remove('active'));
			btn.classList.add('active');
			const heading  = document.getElementById('topbar-heading');
			const newLabel = state.activeCategory === 'all'
				? 'All Services'
				: btn.querySelector('.cat-label').textContent.trim();
			if (heading) {
				heading.classList.add('heading-fade-out');
				setTimeout(() => {
					heading.textContent = newLabel;
					heading.classList.remove('heading-fade-out');
				}, 150);
			}
			renderServices();
		});
	});

	// Auto-expand extras on first visit
	if (firstVisit && links.length) {
		autoExpandSections(nav, links.length > 0);
	}
}

// ── Status filter pills ───────────────────────────────────────────────────────

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

function applySortToggleState(btn) {
	btn.classList.toggle('active',    state.sortAlpha !== null);
	btn.classList.toggle('sort-desc', state.sortAlpha === 'desc');
	btn.title = state.sortAlpha === 'desc' ? 'Sort Z–A' : 'Sort A–Z';
}

export function initSortToggle() {
	const btn = document.getElementById('sort-alpha-btn');
	if (!btn) return;
	applySortToggleState(btn);
	btn.addEventListener('click', () => {
		if      (state.sortAlpha === null)  state.sortAlpha = 'asc';
		else if (state.sortAlpha === 'asc') state.sortAlpha = 'desc';
		else                                state.sortAlpha = null;
		localStorage.setItem('sortAlpha', state.sortAlpha ?? '');
		applySortToggleState(btn);
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
	state.clockTimer = setInterval(tick, 1000);
}

export function stopClock() {
	clearInterval(state.clockTimer);
	state.clockTimer = null;
}

// ── Refresh countdown ─────────────────────────────────────────────────────────

export function stopCountdown() {
	clearInterval(state.countdownTimer);
	state.countdownTimer = null;
}

export function startCountdown() {
	clearInterval(state.countdownTimer);
	state.countdownTimer = setInterval(() => {
		const el = document.getElementById('next-refresh');
		if (!el || !state.nextRefreshAt) return;
		const secs = Math.max(0, Math.ceil((state.nextRefreshAt - Date.now()) / 1000));
		el.textContent = `${secs}s`;
		if (secs === 0) state.nextRefreshAt = Date.now() + CONFIG.refreshInterval;
	}, 1000);
}
