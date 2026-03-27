export async function api_immich(svc, timedFetch, utils) {
	try {
		const b = (svc.endpoint ?? svc.url).replace(/\/$/, '');
		const headers = svc.api_key ? { 'x-api-key': svc.api_key } : {};
		const res = await timedFetch(`${b}/api/server/statistics`, { headers });
		if (!res.ok) return null;
		const d = await res.json();
		return [
			{ label: 'Photos', value: utils.fmtNum(d.photos) },
			{ label: 'Videos', value: utils.fmtNum(d.videos) },
			{ label: 'Usage',  value: utils.fmtBytes(d.usage) },
		];
	} catch { return null; }
}