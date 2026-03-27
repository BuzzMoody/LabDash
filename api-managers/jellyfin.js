export async function api_jellyfin(svc, timedFetch, utils) {
	try {
		const b = (svc.endpoint ?? svc.url).replace(/\/$/, '');
		
		// 1. We append the API key directly to the URL instead of using headers
		const authQuery = svc.api_key ? `?api_key=${svc.api_key}` : '';
		
		// 2. Fetch without any custom headers to avoid CORS preflight blocks
		const res = await timedFetch(`${b}/Items/Counts${authQuery}`);
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