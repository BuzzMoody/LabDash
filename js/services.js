'use strict';

import { API_HANDLERS } from '../api-managers/index.js';
import { CONFIG }       from './config.js';
import { state }        from './state.js';
import { svcId, fmtNum, fmtBytes, timedFetch, checkStatus, showToast, buildChipsHTML } from './utils.js';
import { updateStatsFades } from './stats.js';
import { updateCounters }   from './counters.js';

// ── Recovery timers ───────────────────────────────────────────────────────────
// Tracks services currently in the offline → loading → online transition so
// pending timers can be cancelled if the service changes state again.

const recoveringTimers  = {};
const loadingStartedAt  = {}; // svcId → timestamp when Checking… was first shown

// ── Status element helper ──────────────────────────────────────────────────────
// Updates status classes and text in-place rather than replacing innerHTML,
// so CSS transitions on the parent element fire correctly.

const STATUS_LABELS = { online: 'Online', offline: 'Offline', loading: 'Checking…' };

function setStatusEl(statusEl, status) {
	if (!statusEl) return;
	const dot  = statusEl.querySelector('.status-dot');
	const text = statusEl.querySelector('.status-text');
	statusEl.className = `service-status ${status}`;
	if (dot)  dot.className = `status-dot ${status}`;
	if (text) text.textContent = STATUS_LABELS[status] ?? '—';
}

// ── Demo services ─────────────────────────────────────────────────────────────
// Displayed when services.yaml cannot be loaded, so the dashboard isn't blank.

function getDemoServices() {
	return [
		{ name: 'Jellyfin',       url: 'http://localhost:8096',  category: 'Media',          icon: '🎦', description: 'Open-source media server',   api_type: 'jellyfin' },
		{ name: 'Sonarr',         url: 'http://localhost:8989',  category: 'Media',          icon: '📺', description: 'TV show management',          api_type: 'sonarr' },
		{ name: 'Radarr',         url: 'http://localhost:7878',  category: 'Media',          icon: '🎥', description: 'Movie management',             api_type: 'radarr' },
		{ name: 'qBittorrent',    url: 'http://localhost:8080',  category: 'Downloads',      icon: '⬇️', description: 'Torrent client',              api_type: 'qbittorrent' },
		{ name: 'Proxmox',        url: 'https://localhost:8006', category: 'Infrastructure', icon: '🖥️', description: 'Virtualization platform',     api_type: 'proxmox' },
		{ name: 'Portainer',      url: 'http://localhost:9000',  category: 'Infrastructure', icon: '🐳', description: 'Container management',         api_type: 'portainer' },
		{ name: 'Glances',        url: 'http://localhost:61208', category: 'Infrastructure', icon: '📊', description: 'System monitor',               api_type: 'glances' },
		{ name: 'Grafana',        url: 'http://localhost:3000',  category: 'Monitoring',     icon: '📈', description: 'Metrics & dashboards',         api_type: 'grafana' },
		{ name: 'Immich',         url: 'http://localhost:2283',  category: 'Storage',        icon: '📸', description: 'Photo backup',                 api_type: 'immich' },
		{ name: 'Nextcloud',      url: 'http://localhost:8081',  category: 'Storage',        icon: '☁️', description: 'File sync',                   api_type: 'nextcloud' },
		{ name: 'Pi-hole',        url: 'http://localhost',       category: 'Network',        icon: '🛡️', description: 'DNS ad blocker',              api_type: 'pihole' },
		{ name: 'AdGuard',        url: 'http://localhost:3001',  category: 'Network',        icon: '🔒', description: 'DNS tracker blocker',          api_type: 'adguard' },
		{ name: 'Home Assistant', url: 'http://localhost:8123',  category: 'Smart Home',     icon: '🏠', description: 'Home automation',              api_type: 'homeassistant' },
		{ name: 'Vaultwarden',    url: 'http://localhost:8222',  category: 'Security',       icon: '🔐', description: 'Password vault' },
	];
}

// ── Load services.yaml and apply settings ─────────────────────────────────────

export async function loadServices() {
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
			if (subtitle) {
				document.getElementById('dash-subtitle').textContent = subtitle.toUpperCase();
			}
			if (refresh_interval) {
				CONFIG.refreshInterval = refresh_interval * 1000;
			}

			document.body.classList.toggle('icons-only-mode',       !!config.settings.icons_only);
			document.body.classList.toggle('hide-descriptions-mode', !!config.settings.hide_descriptions);
		}

		return (config?.services ?? []).filter(s => s?.name && s?.url);
	} catch (err) {
		console.warn('[Dashboard] Could not load services.yaml:', err);
		showToast('Could not load services.yaml — showing demo services.', 'error');
		return getDemoServices();
	}
}

// ── Chip value flash + number ticker ─────────────────────────────────────────
// Updates a stat chip value. If both old and new values are numeric (with an
// optional matching suffix e.g. "GB", "%"), the value ticks smoothly from old
// to new using a 600 ms ease-out animation. Non-numeric values fall back to an
// instant swap with the existing flash highlight.
// The forced reflow (offsetWidth read) restarts the CSS animation when the
// value changes in rapid succession.

// Matches: optional leading number (with commas/decimals) + optional suffix.
// e.g. "1,234.5 GB" → ["1,234.5", "GB"]  |  "99%" → ["99", "%"]
const NUM_RE = /^([\d,]+\.?\d*)\s*(.*)$/;

function flashChipValue(chip, newVal) {
	if (!chip) return;
	const valueEl = chip.querySelector('.s-value');
	if (!valueEl || valueEl.textContent === newVal) return;

	const oldMatch = valueEl.textContent.match(NUM_RE);
	const newMatch = newVal.match(NUM_RE);

	// Trigger the flash highlight animation on the chip
	chip.classList.remove('stat-updated');
	void chip.offsetWidth; // force reflow to restart animation
	chip.classList.add('stat-updated');

	if (oldMatch && newMatch && oldMatch[2] === newMatch[2]) {
		const from     = parseFloat(oldMatch[1].replace(/,/g, ''));
		const to       = parseFloat(newMatch[1].replace(/,/g, ''));
		const suffix   = newMatch[2];
		const decimals = newMatch[1].includes('.') ? newMatch[1].split('.')[1].length : 0;
		const useCommas = oldMatch[1].includes(',') || newMatch[1].includes(',');

		if (!isNaN(from) && !isNaN(to) && from !== to) {
			const DURATION = 600;
			const startTime = performance.now();

			function tick(now) {
				const progress = Math.min((now - startTime) / DURATION, 1);
				const eased    = 1 - Math.pow(1 - progress, 3); // ease-out cubic
				const current  = from + (to - from) * eased;
				let formatted  = current.toFixed(decimals);
				if (useCommas) formatted = formatted.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
				valueEl.textContent = suffix ? `${formatted} ${suffix}` : formatted;
				if (progress < 1) requestAnimationFrame(tick);
				else valueEl.textContent = newVal; // snap to exact final value
			}

			requestAnimationFrame(tick);
			return;
		}
	}

	// Fallback: non-numeric or mismatched suffix — instant swap
	valueEl.textContent = newVal;
}

// ── Update status + stats for one service ─────────────────────────────────────
// statusOverride: boolean supplied by batch ping, or null to do an individual
// ping if the status interval has elapsed.

export async function updateService(svc, statusOverride = null) {
	const id = svcId(svc);

	// Skip if an update is already in flight for this service
	if (state.inFlight.has(id)) return;
	state.inFlight.add(id);

	try {
		const prevStatus = state.statusMap[id];
		let online;

		// Track whether Checking… was already showing before we got the result
		// (set here by a prior refreshAll pre-show, or below for individual pings)
		let preShowedLoading = !!loadingStartedAt[id];

		if (statusOverride !== null) {
			// Status supplied by batch ping — result already known
			online = statusOverride;
			state.lastStatusCheck[id] = Date.now();
		} else {
			const now       = Date.now();
			const lastCheck = state.lastStatusCheck[id] ?? 0;
			// Always re-ping offline services — never cache a down state
			const pingDue   = now - lastCheck >= CONFIG.statusInterval
				|| prevStatus === 'loading'
				|| prevStatus === 'offline';

			if (pingDue) {
				// For offline services, show Checking… immediately while the ping runs
				if (prevStatus === 'offline' && !loadingStartedAt[id]) {
					loadingStartedAt[id] = now;
					setStatusEl(document.getElementById(`status-${id}`), 'loading');
					preShowedLoading = true;
				}
				online = await checkStatus(svc.endpoint ?? svc.url);
				state.lastStatusCheck[id] = now;
			} else {
				// Reuse cached status — only refresh stats this tick
				online = prevStatus === 'online';
			}
		}

		const newStatus = online ? 'online' : 'offline';
		state.statusMap[id] = newStatus;

		// Update badge when status changes, or when we pre-showed loading and need
		// to resolve it (even if status is unchanged, e.g. offline → still offline)
		const statusEl    = document.getElementById(`status-${id}`);
		const needsUpdate = prevStatus !== newStatus || prevStatus === 'loading' || preShowedLoading;
		if (statusEl && needsUpdate) {
			clearTimeout(recoveringTimers[id]);
			delete recoveringTimers[id];

			if (prevStatus === 'offline' && newStatus === 'online') {
				// Ensure Checking… is visible for at least 2 seconds total —
				// subtract however long it was already showing before the result came in
				const elapsed = Date.now() - (loadingStartedAt[id] ?? Date.now());
				delete loadingStartedAt[id];
				const waitMs  = Math.max(0, 2000 - elapsed);

				state.statusMap[id] = 'loading';
				setStatusEl(statusEl, 'loading');
				recoveringTimers[id] = setTimeout(() => {
					delete recoveringTimers[id];
					if (state.statusMap[id] === 'loading') {
						state.statusMap[id] = 'online';
						setStatusEl(statusEl, 'online');
						updateCounters();
					}
				}, waitMs);
			} else {
				// Covers: offline→offline (loading→offline transition), online→offline, etc.
				delete loadingStartedAt[id];
				setStatusEl(statusEl, newStatus);
			}
		}

		if (online && svc.api_type && API_HANDLERS[svc.api_type]) {
			const stats = await API_HANDLERS[svc.api_type](svc, timedFetch, { fmtNum, fmtBytes });
			if (stats) {
				const prevStats  = state.statsMap[id];
				state.statsMap[id] = stats;
				const statsEl    = document.getElementById(`stats-${id}`);
				if (statsEl) {
					const emojiMode  = !!(svc.emoji_stats ?? state.settings?.emoji_stats);
					const prevLabels = (prevStats ?? []).map(s => s.label).join(',');
					const newLabels  = stats.map(s => s.label).join(',');

					if (prevLabels !== newLabels) {
						// Structure changed — stop scroll, rebuild all chips, restart scroll
						statsEl.parentElement?._stopScroll?.();
						statsEl.innerHTML = buildChipsHTML(stats, emojiMode);
						requestAnimationFrame(() => updateStatsFades(statsEl));
					} else {
						// Same structure — update originals and clones in place so the
						// scroll animation never needs to stop and restart
						const origChips  = statsEl.querySelectorAll('.stat-chip:not([data-scroll-clone])');
						const cloneChips = statsEl.querySelectorAll('.stat-chip[data-scroll-clone]');
						stats.forEach((s, i) => {
							const newVal = String(s.value);
							flashChipValue(origChips[i], newVal);
							const cloneValueEl = cloneChips[i]?.querySelector('.s-value');
							if (cloneValueEl) cloneValueEl.textContent = newVal;
						});
					}
				}
			}
		}

		updateCounters();
	} finally {
		state.inFlight.delete(id);
	}
}

// ── Batch status check ────────────────────────────────────────────────────────
// Sends all service URLs in a single request to the Go /batch-ping handler.
// Falls back gracefully — if the request fails, updateService does individual
// pings for each service.

export async function batchCheckStatuses(services) {
	try {
		const params = new URLSearchParams();
		services.forEach(svc => params.append('urls[]', svc.endpoint ?? svc.url));
		const res = await timedFetch(`/batch-ping?${params}`, {}, CONFIG.statusTimeout + 3000);
		return await res.json();
	} catch {
		return {};
	}
}

// ── Full refresh cycle ────────────────────────────────────────────────────────
// One batch ping replaces N individual /ping calls, then updateService is called
// for each service in parallel with the pre-fetched status.

export async function refreshAll() {
	const btn = document.getElementById('refresh-btn');
	btn?.classList.add('spinning');

	// Pre-show Checking… on offline services before the batch ping fires so the
	// user gets immediate visual feedback. Record the timestamp so the 2s minimum
	// in updateService accounts for time already spent showing the loading state.
	const now = Date.now();
	state.services.forEach(svc => {
		const id = svcId(svc);
		if (state.statusMap[id] === 'offline') {
			loadingStartedAt[id] = loadingStartedAt[id] ?? now;
			setStatusEl(document.getElementById(`status-${id}`), 'loading');
		}
	});

	const batchResults = await batchCheckStatuses(state.services);

	await Promise.allSettled(state.services.map(svc => {
		const url  = svc.endpoint ?? svc.url;
		const code = batchResults[url];
		// code 0 means HEAD not supported or no response — treat as unknown
		// so updateService falls back to an individual GET ping
		const online = (code == null || code === 0)
			? null
			: (code !== 502 && code !== 503 && code !== 504);
		return updateService(svc, online);
	}));

	btn?.classList.remove('spinning');
	setLastUpdated();
}

// ── Last updated timestamp ────────────────────────────────────────────────────

export function setLastUpdated() {
	const el = document.getElementById('last-updated');
	if (!el) return;
	const pad = n => String(n).padStart(2, '0');
	const now = new Date();
	el.textContent = `Updated ${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
}

// ── Per-service refresh timers ────────────────────────────────────────────────
// Services are staggered across the interval to avoid a thundering herd on
// the Go backend. The first tick for service i is delayed by ((i+1)/n)*interval,
// spreading all services evenly before the recurring interval takes over.

export function clearServiceTimers() {
	Object.values(state.svcTimers).forEach(clearInterval);
	Object.values(state.svcStarts).forEach(clearTimeout);
	state.svcTimers = {};
	state.svcStarts = {};
}

export function startServiceTimers() {
	clearServiceTimers();
	const n = state.services.length;
	state.services.forEach((svc, i) => {
		const ms         = svc.refresh != null ? svc.refresh * 1000 : CONFIG.refreshInterval;
		const firstDelay = n > 1 ? Math.round(((i + 1) / n) * ms) : ms;
		state.svcStarts[svcId(svc)] = setTimeout(() => {
			updateService(svc);
			state.svcTimers[svcId(svc)] = setInterval(() => updateService(svc), ms);
		}, firstDelay);
	});
	state.nextRefreshAt = Date.now() + CONFIG.refreshInterval;
}
