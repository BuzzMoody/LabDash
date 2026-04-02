export async function api_immich(svc, timedFetch, utils) {
	const args = (svc.args ?? '').split(',').map(a => a.trim().toLowerCase()).filter(Boolean);
	if (!args.length) return null;

	try {
		const res = await timedFetch(`/proxy?svc=${encodeURIComponent(svc.name)}&path=${encodeURIComponent('/api/server/statistics')}`);
		if (!res.ok) return null;
		const d = await res.json();

		const available = {
			photos: () => ({ label: 'Photos', value: utils.fmtNum(d.photos),  emoji: '📸' }),
			videos: () => ({ label: 'Videos', value: utils.fmtNum(d.videos),  emoji: '🎬' }),
			usage:  () => ({ label: 'Usage',  value: utils.fmtBytes(d.usage), emoji: '💽' }),
		};

		return args.map(a => available[a]?.()).filter(Boolean);
	} catch { return null; }
}
