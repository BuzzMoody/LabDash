export async function api_sonarr(svc, timedFetch) {
	const args = (svc.args ?? '').split(',').map(a => a.trim().toLowerCase()).filter(Boolean);
	if (!args.length) return null;

	try {
		const b       = (svc.endpoint ?? svc.url).replace(/\/$/, '');
		const headers = svc.api_key ? { 'X-Api-Key': svc.api_key } : {};
		const res     = await timedFetch(`${b}/api/v3/series`, { headers });
		if (!res.ok) return null;
		const series = await res.json();

		const available = {
			series:    () => ({ label: 'Series',    value: series.length }),
			monitored: () => ({ label: 'Monitored', value: series.filter(s => s.monitored).length }),
		};

		return args.map(a => available[a]?.()).filter(Boolean);
	} catch { return null; }
}
