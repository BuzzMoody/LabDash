export async function api_sonarr(svc, timedFetch) {
	try {
		const b = (svc.endpoint ?? svc.url).replace(/\/$/, '');
		const headers = svc.api_key ? { 'X-Api-Key': svc.api_key } : {};
		const res = await timedFetch(`${b}/api/v3/series`, { headers });
		if (!res.ok) return null;
		const series = await res.json();
		return [
			{ label: 'Series',    value: series.length },
			{ label: 'Monitored', value: series.filter(s => s.monitored).length },
		];
	} catch { return null; }
}