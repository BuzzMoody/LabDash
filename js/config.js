'use strict';

// ── Timing & endpoint configuration ──────────────────────────────────────────
// CONFIG.refreshInterval can be overridden at runtime by services.yaml.

export const CONFIG = {
	yamlPath:        './services.yaml',
	refreshInterval: 30_000,   // full refresh cycle (ms)
	statusInterval:  60_000,   // minimum time between individual pings (ms)
	apiTimeout:      7_000,    // timeout for stats API calls (ms)
	statusTimeout:   5_000,    // timeout for ping/batch-ping calls (ms)
};

// ── Category accent colours ───────────────────────────────────────────────────
// Both spaced and hyphenated variants are included for services.yaml flexibility.

export const CATEGORY_COLORS = {
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
