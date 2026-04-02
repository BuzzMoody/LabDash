'use strict';

// ── Latency colour thresholds ─────────────────────────────────────────────────

function latencyColor(ms) {
	if (ms <  10) return '#00ff88'; // bright green
	if (ms <  30) return '#4ade80'; // dark green
	if (ms <  70) return '#fbbf24'; // yellow
	if (ms < 150) return '#f97316'; // orange
	return '#ef4444';               // red
}

// ── DOM update ────────────────────────────────────────────────────────────────

function applyResult(destination, ms) {
	const entry = document.querySelector(`.ping-entry[data-ping-host="${destination}"]`);
	if (!entry) return;
	const el = entry.querySelector('.ping-ms');
	if (!el) return;

	if (ms < 0) {
		el.textContent     = '—';
		el.style.color     = '';
	} else {
		el.textContent     = `${ms % 1 === 0 ? ms : ms.toFixed(1)}ms`;
		el.style.color     = latencyColor(ms);
	}
}

// ── Per-endpoint poll ─────────────────────────────────────────────────────────

async function pollOne(destination) {
	const ctrl  = new AbortController();
	const timer = setTimeout(() => ctrl.abort(), 8000);
	try {
		const res = await fetch(`/icmp-ping?host=${encodeURIComponent(destination)}`, { signal: ctrl.signal });
		if (!res.ok) { applyResult(destination, -1); return; }
		const { ms } = await res.json();
		applyResult(destination, ms);
	} catch {
		applyResult(destination, -1);
	} finally {
		clearTimeout(timer);
	}
}

async function pollAll(endpoints) {
	await Promise.allSettled(endpoints.map(ep => pollOne(ep.destination)));
}

// ── Public API ────────────────────────────────────────────────────────────────

let pingTimer = null;

export function startPingPolling(endpoints) {
	if (!endpoints?.length) return;

	pollAll(endpoints); // immediate first poll
	pingTimer = setInterval(() => pollAll(endpoints), 30_000);
}

export function stopPingPolling() {
	clearInterval(pingTimer);
	pingTimer = null;
}
