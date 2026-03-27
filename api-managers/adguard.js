export async function api_adguard(svc, timedFetch, utils) {
	try {
		const b = (svc.endpoint ?? svc.url).replace(/\/$/, '');
		const [user, pass] = (svc.api_key ?? ':').split(':');
		const headers = { 'Authorization': `Basic ${btoa(`${user}:${pass}`)}` };
		const res = await timedFetch(`${b}/control/stats`, { headers });
		if (!res.ok) return null;
		const d = await res.json();
		const total = d.num_dns_queries ?? 0;
		const blocked = d.num_blocked_filtering ?? 0;
		const pct = total > 0 ? ((blocked / total) * 100).toFixed(1) : '0.0';
		return [
			{ label: 'Blocked', value: `${pct}%` },
			{ label: 'Queries', value: utils.fmtNum(total) },
		];
	} catch { return null; }
}