export async function api_adguard(svc, timedFetch, utils) {
	const args = (svc.args ?? '').split(',').map(a => a.trim().toLowerCase()).filter(Boolean);
	if (!args.length) return null;

	try {
		const res = await timedFetch(`/proxy?svc=${encodeURIComponent(svc.name)}&path=${encodeURIComponent('/control/stats')}`);
		if (!res.ok) return null;
		const d       = await res.json();
		const total   = d.num_dns_queries ?? 0;
		const blocked = d.num_blocked_filtering ?? 0;
		const pct     = total > 0 ? ((blocked / total) * 100).toFixed(1) : '0.0';

		const available = {
			blocked: () => ({ label: 'Blocked', value: `${pct}%`,           emoji: '🛡️' }),
			queries: () => ({ label: 'Queries', value: utils.fmtNum(total), emoji: '🔍' }),
		};

		return args.map(a => available[a]?.()).filter(Boolean);
	} catch { return null; }
}
