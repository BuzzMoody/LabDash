export async function api_pihole(svc, timedFetch, utils) {
	const args = (svc.args ?? '').split(',').map(a => a.trim().toLowerCase()).filter(Boolean);
	if (!args.length) return null;

	try {
		const b   = (svc.endpoint ?? svc.url).replace(/\/$/, '');
		const key = svc.api_key ? `&auth=${svc.api_key}` : '';
		const res = await timedFetch(`${b}/admin/api.php?summaryRaw${key}`);
		if (!res.ok) return null;
		const d = await res.json();

		const available = {
			blocked: () => ({ label: 'Blocked', value: `${parseFloat(d.ads_percentage_today).toFixed(1)}%` }),
			queries: () => ({ label: 'Queries', value: utils.fmtNum(d.dns_queries_today) }),
			status:  () => ({ label: 'Status',  value: d.status === 'enabled' ? '● ON' : '○ OFF' }),
		};

		return args.map(a => available[a]?.()).filter(Boolean);
	} catch { return null; }
}
