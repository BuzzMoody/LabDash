export async function api_jellyfin(svc, timedFetch, utils) {
	try {
		const b = (svc.endpoint ?? svc.url).replace(/\/$/, '');
		const headers = svc.api_key ? { 'Authorization': `MediaBrowser Token="${svc.api_key}"` } : {};
		
		const res = await timedFetch(`${b}/Items/Counts`, { headers });
		if (!res.ok) return null;
		
		const data = await res.json();
		
		return [
			{ label: 'Movies',   value: utils.fmtNum(data.MovieCount ?? 0) },
			{ label: 'Series',   value: utils.fmtNum(data.SeriesCount ?? 0) },
			{ label: 'Episodes', value: utils.fmtNum(data.EpisodeCount ?? 0) }
		];
	} catch (err) {
		console.error(`[Jellyfin API] Error fetching stats:`, err);
		return null; 
	}
}