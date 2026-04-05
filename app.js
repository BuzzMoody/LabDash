'use strict';

import { state }                 from './js/state.js';
import { svcId, debounce }       from './js/utils.js';
import { renderServices }        from './js/render.js';
import { loadServices, refreshAll, clearServiceTimers, startServiceTimers } from './js/services.js';
import { buildSidebarSections, initFilters, initViewToggle, initSortToggle, initZoomControl, initSidebarToggle, startClock, stopClock, startCountdown, stopCountdown } from './js/ui.js';
import { startPingPolling, stopPingPolling } from './js/ping.js';
import { checkForUpdate, initChangelog } from './js/updates.js';

async function init() {
	startClock();
	initSidebarToggle();
	initFilters();
	initViewToggle();
	initSortToggle();
	initZoomControl();
	initChangelog();
	checkForUpdate(); // fire-and-forget — updates UI when response arrives

	state.services = await loadServices();
	buildSidebarSections(state.services, state.settings);

	document.getElementById('loading-overlay')?.classList.add('hidden');
	state.services.forEach(s => { state.statusMap[svcId(s)] = 'loading'; });
	renderServices();

	await refreshAll();

	startCountdown();
	startServiceTimers();
	startPingPolling(state.settings?.ping_endpoints ?? []);

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

document.addEventListener('visibilitychange', () => {
	if (document.hidden) {
		document.body.classList.add('page-hidden');
		stopClock();
		stopCountdown();
		clearServiceTimers();
		stopPingPolling();
	} else {
		document.body.classList.remove('page-hidden');
		startClock();
		startCountdown();
		startServiceTimers();
		startPingPolling(state.settings?.ping_endpoints ?? []);
	}
});
