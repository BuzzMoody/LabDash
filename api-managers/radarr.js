export async function api_radarr(svc, timedFetch) {
	try {
		const b = (svc.endpoint ?? svc.url).replace(/\/$/, '');
		const headers = svc.api_key ? { 'X-Api-Key': svc.api_key } : {};
		const res = await timedFetch(`${b}/api/v3/movie`, { headers });
		if (!res.ok) return null;
		const movies = await res.json();
		return [
			{ label: 'Movies',     value: movies.length },
			{ label: 'Downloaded', value: movies.filter(m => m.hasFile).length },
		];
	} catch { return null; }
}