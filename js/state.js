'use strict';

// ── Application state ─────────────────────────────────────────────────────────
// Single shared object imported by all modules that need to read or write state.
// dashView is persisted to localStorage so the user's preferred layout survives
// a page reload.

export const state = {
	services:        [],
	activeCategory:  'all',
	searchQuery:     '',
	statusFilter:    null,
	dashView:        localStorage.getItem('dashView') ?? 'grouped',
	sortAlpha:       localStorage.getItem('sortAlpha') || null,  // null | 'asc' | 'desc'
	statusMap:       {},     // svcId → 'loading' | 'online' | 'offline'
	statsMap:        {},     // svcId → stat chip array
	svcTimers:       {},     // svcId → setInterval handle
	svcStarts:       {},     // svcId → setTimeout handle (initial stagger)
	inFlight:        new Set(),  // svcIds currently being updated (dedup guard)
	lastStatusCheck: {},     // svcId → timestamp of last individual ping
	clockTimer:      null,
	countdownTimer:  null,
	nextRefreshAt:   null,
	settings:        {},
	updateAvailable: false,
	latestVersion:   null,
};
