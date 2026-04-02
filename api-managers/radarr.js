export async function api_radarr(svc, timedFetch) {
	const args = (svc.args ?? '').split(',').map(a => a.trim().toLowerCase()).filter(Boolean);
	if (!args.length) return null;

	try {
		const res = await timedFetch(`/proxy?svc=${encodeURIComponent(svc.name)}&path=${encodeURIComponent('/api/v3/movie')}`);
		if (!res.ok) return null;
		const movies = await res.json();

		const available = {
			movies:     () => ({ label: 'Movies',     value: movies.length,                        emoji: '🎬' }),
			downloaded: () => ({ label: 'Downloaded', value: movies.filter(m => m.hasFile).length, emoji: '✅' }),
		};

		return args.map(a => available[a]?.()).filter(Boolean);
	} catch { return null; }
}
