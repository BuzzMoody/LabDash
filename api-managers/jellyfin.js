export async function api_jellyfin(svc, timedFetch, utils) {
	const args = (svc.args ?? '').split(',').map(a => a.trim().toLowerCase()).filter(Boolean);
	if (!args.length) return null;

	try {
		const res = await timedFetch(`/proxy?svc=${encodeURIComponent(svc.name)}&path=${encodeURIComponent('/Items/Counts')}`);
		if (!res.ok) return null;
		const data = await res.json();

		const available = {
			movies:   () => ({ label: 'Movies',   value: utils.fmtNum(data.MovieCount   ?? 0), emoji: '🎬' }),
			series:   () => ({ label: 'Series',   value: utils.fmtNum(data.SeriesCount  ?? 0), emoji: '📺' }),
			episodes: () => ({ label: 'Episodes', value: utils.fmtNum(data.EpisodeCount ?? 0), emoji: '🎞️' }),
		};

		return args.map(a => available[a]?.()).filter(Boolean);
	} catch (err) {
		console.error(`[Jellyfin API] Error fetching stats:`, err);
		return null;
	}
}
