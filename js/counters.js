'use strict';

import { state } from './state.js';
import { svcId } from './utils.js';

// ── Status filter pill highlight ──────────────────────────────────────────────

export function updatePillActiveState() {
	document.getElementById('pill-online') ?.classList.toggle('active', state.statusFilter === 'online');
	document.getElementById('pill-offline')?.classList.toggle('active', state.statusFilter === 'offline');
}

// ── Per-category offline badge counts ────────────────────────────────────────

export function updateCategoryOfflineCounts() {
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
		el.textContent   = count;
		el.style.display = count > 0 ? '' : 'none';
	});
}

// ── Topbar counters ───────────────────────────────────────────────────────────

export function updateCounters() {
	const vals    = Object.values(state.statusMap);
	const online  = vals.filter(v => v === 'online').length;
	const offline = vals.filter(v => v === 'offline').length;

	const setEl = (id, val) => {
		const el = document.getElementById(id);
		if (el) el.textContent = val;
	};
	setEl('count-online',  online);
	setEl('count-offline', offline);
	setEl('count-total',   state.services.length);

	updatePillActiveState();
	updateCategoryOfflineCounts();
}
