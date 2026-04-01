'use strict';

import { state }                 from './js/state.js';
import { svcId, debounce }       from './js/utils.js';
import { renderServices }        from './js/render.js';
import { loadServices, refreshAll, clearServiceTimers, startServiceTimers } from './js/services.js';
import { buildCategoryNav, initFilters, initViewToggle, initSortToggle, initSidebarToggle, startClock, startCountdown } from './js/ui.js';
import { checkForUpdate, initChangelog } from './js/updates.js';

async function init() {
	startClock();
	initSidebarToggle();
	initFilters();
	initViewToggle();
	initSortToggle();
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
