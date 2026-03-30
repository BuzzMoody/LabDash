'use strict';

import { CONFIG, CATEGORY_COLORS } from './config.js';

// ── Category colour ───────────────────────────────────────────────────────────

export const catColor = (cat) =>
	CATEGORY_COLORS[(cat ?? '').toLowerCase()] ?? '#94a3b8';

// ── Service ID ────────────────────────────────────────────────────────────────
// Stable, DOM-safe identifier derived from the service name.

export const svcId = (svc) =>
	svc.name.toLowerCase().replace(/[^a-z0-9]/g, '-');

// ── Number formatters ─────────────────────────────────────────────────────────

export const fmtNum = (n) =>
	(n == null || isNaN(n)) ? '—' : Number(n).toLocaleString();

export const fmtBytes = (b) => {
	if (b == null || isNaN(b)) return '—';
	const units = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];
	let i = 0;
	while (b >= 1024 && i < units.length - 1) { b /= 1024; i++; }
	return `${b.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
};

// ── Stat chip HTML ────────────────────────────────────────────────────────────
// Shared by render.js (initial card build) and services.js (stats rebuild).

export const buildChipsHTML = (stats) =>
	stats.map(s => `
		<div class="stat-chip">
			<span class="s-label">${s.label}</span>
			<span class="s-value">${s.value}</span>
		</div>`).join('');

// ── Debounce ──────────────────────────────────────────────────────────────────

export function debounce(fn, ms) {
	let timer;
	return (...args) => {
		clearTimeout(timer);
		timer = setTimeout(() => fn(...args), ms);
	};
}

// ── Fetch with timeout ────────────────────────────────────────────────────────

export async function timedFetch(url, opts = {}, timeout = CONFIG.apiTimeout) {
	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), timeout);
	try {
		return await fetch(url, { ...opts, signal: controller.signal });
	} finally {
		clearTimeout(timer);
	}
}

// ── Server-side status check ──────────────────────────────────────────────────
// Proxied through the Go backend to avoid CORS and get real HTTP status codes.

export async function checkStatus(url) {
	try {
		const res  = await timedFetch(`/ping?url=${encodeURIComponent(url)}`, {}, CONFIG.statusTimeout);
		const data = await res.json();
		// status 0 means the server couldn't reach the host at all
		if (!data.status || data.status === 502 || data.status === 503 || data.status === 504) {
			return false;
		}
		return true;
	} catch {
		return false;
	}
}

// ── Toast notifications ───────────────────────────────────────────────────────

export function showToast(message, type = 'info') {
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
