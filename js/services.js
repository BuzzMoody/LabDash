'use strict';

import { API_HANDLERS } from '../api-managers/index.js';
import { CONFIG }       from './config.js';
import { state }        from './state.js';
import { svcId, fmtNum, fmtBytes, timedFetch, checkStatus, showToast, buildChipsHTML } from './utils.js';
import { updateStatsFades } from './stats.js';
import { updateCounters }   from './counters.js';

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

// ── Chip value flash ──────────────────────────────────────────────────────────
// Updates a single stat chip value and triggers the flash animation.
// The forced reflow (offsetWidth read) is required to restart the CSS animation
// when the value changes in rapid succession.

function flashChipValue(chip, newVal) {
	if (!chip) return;
	const valueEl = chip.querySelector('.s-value');
	if (!valueEl || valueEl.textContent === newVal) return;
	valueEl.textContent = newVal;
	chip.classList.remove('stat-updated');
	void chip.offsetWidth; // force reflow to restart animation
	chip.classList.add('stat-updated');
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

		if (statusOverride !== null) {
			// Status supplied by batch ping — record timestamp and use it directly
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
				online = await checkStatus(svc.endpoint ?? svc.url);
				state.lastStatusCheck[id] = now;
			} else {
				// Reuse cached status — only refresh stats this tick
				online = prevStatus === 'online';
			}
		}

		state.statusMap[id] = online ? 'online' : 'offline';

		// Update status badge only when the state actually changes
		const statusEl = document.getElementById(`status-${id}`);
		if (statusEl && (prevStatus !== state.statusMap[id] || prevStatus === 'loading')) {
			const delayAttr = online ? ' style="animation-delay:5s"' : '';
			statusEl.className = `service-status ${online ? 'online' : 'offline'}`;
			statusEl.innerHTML =
				`<span class="status-dot ${online ? 'online' : 'offline'}"></span>` +
				`<span class="status-text"${delayAttr}>${online ? 'Online' : 'Offline'}</span>`;
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
