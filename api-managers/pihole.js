export async function api_pihole(svc, timedFetch, utils) {
	const args = (svc.args ?? '').split(',').map(a => a.trim().toLowerCase()).filter(Boolean);
	if (!args.length) return null;

	try {
		// Auth (password → SID) and session caching are handled server-side by /proxy
		const res = await timedFetch(`/proxy?svc=${encodeURIComponent(svc.name)}&path=${encodeURIComponent('/api/stats/summary')}`);
		if (!res.ok) return null;

		const d         = await res.json();
		const total     = d.queries?.total ?? 0;
		const blocked   = d.queries?.blocked ?? 0;
		const pct       = total > 0 ? ((blocked / total) * 100).toFixed(1) : '0.0';
		const frequency = d.queries?.frequency ?? 0;

		const available = {
			total:           () => ({ label: 'Queries',   value: utils.fmtNum(total),                     emoji: '🔍' }),
			blocked:         () => ({ label: 'Blocked',   value: utils.fmtNum(blocked),                   emoji: '🛡️' }),
			percent_blocked: () => ({ label: 'Blocked %', value: `${pct}%`,                               emoji: '🛡️' }),
			frequency:       () => ({ label: 'Freq',      value: `${parseFloat(frequency).toFixed(1)}/s`, emoji: '📡' }),
		};

		return args.map(a => available[a]?.()).filter(Boolean);
	} catch (err) {
		console.error(`[Pi-hole v6 API] Error fetching stats:`, err);
		return null;
	}
}
