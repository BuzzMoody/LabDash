export async function api_pihole(svc, timedFetch, utils) {
	try {
		const b = (svc.endpoint ?? svc.url).replace(/\/$/, '');
		const key = svc.api_key ? `&auth=${svc.api_key}` : '';
		const res = await timedFetch(`${b}/admin/api.php?summaryRaw${key}`);
		if (!res.ok) return null;
		const d = await res.json();
		return [
			{ label: 'Blocked',  value: `${parseFloat(d.ads_percentage_today).toFixed(1)}%` },
			{ label: 'Queries',  value: utils.fmtNum(d.dns_queries_today) },
			{ label: 'Status',   value: d.status === 'enabled' ? '● ON' : '○ OFF' },
		];
	} catch { return null; }
}