export async function api_adguard(svc, timedFetch, utils) {
	const args = (svc.args ?? '').split(',').map(a => a.trim().toLowerCase()).filter(Boolean);
	if (!args.length) return null;

	try {
		const b            = (svc.endpoint ?? svc.url).replace(/\/$/, '');
		const [user, pass] = (svc.api_key ?? ':').split(':');
		const headers      = { 'Authorization': `Basic ${btoa(`${user}:${pass}`)}` };
		const res          = await timedFetch(`${b}/control/stats`, { headers });
		if (!res.ok) return null;
		const d       = await res.json();
		const total   = d.num_dns_queries ?? 0;
		const blocked = d.num_blocked_filtering ?? 0;
		const pct     = total > 0 ? ((blocked / total) * 100).toFixed(1) : '0.0';

		const available = {
			blocked: () => ({ label: 'Blocked', value: `${pct}%` }),
			queries: () => ({ label: 'Queries', value: utils.fmtNum(total) }),
		};

		return args.map(a => available[a]?.()).filter(Boolean);
	} catch { return null; }
}
