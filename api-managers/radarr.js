export async function api_radarr(svc, timedFetch) {
	const args = (svc.args ?? '').split(',').map(a => a.trim().toLowerCase()).filter(Boolean);
	if (!args.length) return null;

	try {
		const b       = (svc.endpoint ?? svc.url).replace(/\/$/, '');
		const headers = svc.api_key ? { 'X-Api-Key': svc.api_key } : {};
		const res     = await timedFetch(`${b}/api/v3/movie`, { headers });
		if (!res.ok) return null;
		const movies = await res.json();

		const available = {
			movies:     () => ({ label: 'Movies',     value: movies.length }),
			downloaded: () => ({ label: 'Downloaded', value: movies.filter(m => m.hasFile).length }),
		};

		return args.map(a => available[a]?.()).filter(Boolean);
	} catch { return null; }
}
