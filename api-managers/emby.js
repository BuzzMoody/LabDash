export async function api_emby(svc, timedFetch, utils) {
	try {
		const b = (svc.endpoint ?? svc.url).replace(/\/$/, '');
		
		// Use the query parameter method to bypass CORS preflight issues
		const authQuery = svc.api_key ? `?api_key=${svc.api_key}` : '';
		
		const res = await timedFetch(`${b}/Items/Counts${authQuery}`);
		if (!res.ok) return null;
		
		const data = await res.json();
		
		return [
			{ label: 'Movies',   value: utils.fmtNum(data.MovieCount ?? 0) },
			{ label: 'Series',   value: utils.fmtNum(data.SeriesCount ?? 0) },
			{ label: 'Episodes', value: utils.fmtNum(data.EpisodeCount ?? 0) }
		];
	} catch (err) {
		console.error(`[Emby API] Error fetching stats:`, err);
		return null; 
	}
}