export async function api_pihole(svc, timedFetch, utils) {
	try {
		const b = (svc.endpoint ?? svc.url).replace(/\/$/, '');
		
		// Pi-hole v6 uses standard Bearer tokens (App Passwords)
		const headers = svc.api_key ? { 'Authorization': `Bearer ${svc.api_key}` } : {};
		
		// The new v6 endpoint
		const res = await timedFetch(`${b}/api/stats/summary`, { headers });
		if (!res.ok) return null;
		
		const d = await res.json();
		
		// v6 nests its data differently than v5
		const total = d.queries?.total ?? 0;
		const blocked = d.queries?.blocked ?? 0;
		const pct = total > 0 ? ((blocked / total) * 100).toFixed(1) : '0.0';

		return [
			{ label: 'Blocked',  value: `${pct}%` },
			{ label: 'Queries',  value: utils.fmtNum(total) },
		];
	} catch (err) {
		console.error(`[Pi-hole v6 API] Error fetching stats:`, err);
		return null; 
	}
}