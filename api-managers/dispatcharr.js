export async function api_dispatcharr(svc, timedFetch, utils) {
	const args = (svc.args ?? '').split(',').map(a => a.trim().toLowerCase()).filter(Boolean);
	if (!args.length) return null;

	try {
		// Login (username + password → JWT) and token caching are handled server-side by /proxy
		const res = await timedFetch(`/proxy?svc=${encodeURIComponent(svc.name)}&path=${encodeURIComponent('/api/hdhr/lineup.json')}`);
		if (!res.ok) return null;

		const channels = await res.json();

		const available = {
			channels: () => ({ label: 'Channels', value: utils.fmtNum(channels.length), emoji: '📡' }),
		};

		return args.map(a => available[a]?.()).filter(Boolean);
	} catch (err) {
		console.error('[Dispatcharr API] Error:', err);
		return null;
	}
}
