export async function api_pihole(svc, timedFetch, utils) {
	const args = (svc.args ?? '').split(',').map(a => a.trim().toLowerCase()).filter(Boolean);
	if (!args.length) return null;

	try {
		const b = (svc.endpoint ?? svc.url).replace(/\/$/, '');

		// Pi-hole v6 uses standard Bearer tokens (App Passwords)
		const headers = svc.api_key ? { 'Authorization': `Bearer ${svc.api_key}` } : {};

		const res = await timedFetch(`${b}/api/stats/summary`, { headers });
		if (!res.ok) return null;

		const d = await res.json();

		const total     = d.queries?.total ?? 0;
		const blocked   = d.queries?.blocked ?? 0;
		const pct       = total > 0 ? ((blocked / total) * 100).toFixed(1) : '0.0';
		const frequency = d.queries?.frequency ?? 0;

		const available = {
			total:           () => ({ label: 'Queries',   value: utils.fmtNum(total) }),
			blocked:         () => ({ label: 'Blocked',   value: utils.fmtNum(blocked) }),
			percent_blocked: () => ({ label: 'Blocked %', value: `${pct}%` }),
			frequency:       () => ({ label: 'Freq',      value: `${parseFloat(frequency).toFixed(1)}/s` }),
		};

		return args.map(a => available[a]?.()).filter(Boolean);
	} catch (err) {
		console.error(`[Pi-hole v6 API] Error fetching stats:`, err);
		return null;
	}
}
