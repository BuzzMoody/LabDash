'use strict';

import { state }            from './state.js';
import { svcId, catColor, buildChipsHTML } from './utils.js';
import { updateCounters }   from './counters.js';
import { initAllStatsDrag } from './stats.js';

// ── Icon HTML ─────────────────────────────────────────────────────────────────
// Shows the emoji icon immediately as a fallback, then swaps in the logo image
// once it loads. If the image errors, the emoji remains.

function buildIconHTML(svc) {
	const fallback = svc.icon ?? '⚙️';
	if (!svc.logo) return fallback;
	return (
		`<span class="service-icon-emoji">${fallback}</span>` +
		`<img src="logos/${svc.logo}" alt="${svc.name}" class="service-logo-img" style="display:none"` +
		` onload="this.style.display='';this.previousElementSibling.style.display='none'"` +
		` onerror="this.remove()">`
	);
}

// ── Single service card ───────────────────────────────────────────────────────

export function buildCardHTML(svc) {
	const id          = svcId(svc);
	const color       = catColor(svc.category);
	const status      = state.statusMap[id] ?? 'loading';
	const stats       = state.statsMap[id]  ?? [];
	const statusLabel = { online: 'Online', offline: 'Offline', loading: 'Checking…' }[status] ?? '—';

	return `
		<a href="${svc.url}" target="_blank" rel="noopener noreferrer"
		   class="service-card" id="card-${id}"
		   style="--card-accent:${color}"
		   data-cat="${(svc.category ?? '').toLowerCase()}"
		   data-name="${svc.name.toLowerCase()}"
		   data-desc="${(svc.description ?? '').toLowerCase()}">
			<div class="card-stripe"></div>
			<div class="card-body">
				<div class="card-header">
					<div class="service-icon">${buildIconHTML(svc)}</div>
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
					<div class="service-stats" id="stats-${id}">${buildChipsHTML(stats)}</div>
				</div>
			</div>
			<div class="card-accent-bar"></div>
		</a>`;
}

// ── Grouped view ──────────────────────────────────────────────────────────────

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

// ── Main render ───────────────────────────────────────────────────────────────
// Filters the service list, rebuilds the grid HTML, and triggers counters and
// stats scroll initialisation. Called whenever filter state changes.

export function renderServices() {
	const grid       = document.getElementById('services-grid');
	const emptyState = document.getElementById('empty-state');
	if (!grid) return;

	let filtered = state.services;

	if (state.activeCategory !== 'all') {
		filtered = filtered.filter(s =>
			(s.category ?? '').toLowerCase() === state.activeCategory
		);
	}

	if (state.searchQuery) {
		const q = state.searchQuery;
		filtered = filtered.filter(s =>
			s.name.toLowerCase().includes(q) ||
			(s.category    ?? '').toLowerCase().includes(q) ||
			(s.description ?? '').toLowerCase().includes(q)
		);
	}

	if (state.statusFilter) {
		filtered = filtered.filter(s =>
			(state.statusMap[svcId(s)] ?? 'loading') === state.statusFilter
		);
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
	grid.innerHTML = grouped
		? renderGrouped(filtered)
		: filtered.map(s => buildCardHTML(s)).join('');

	grid.querySelectorAll('.service-card').forEach((card, i) => {
		card.style.animationDelay = `${i * 45}ms`;
	});
	grid.querySelectorAll('.service-status.online .status-text').forEach(el => {
		el.style.animationDelay = '5s';
	});

	updateCounters();
	requestAnimationFrame(initAllStatsDrag);
}
