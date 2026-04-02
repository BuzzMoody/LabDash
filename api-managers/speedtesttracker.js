export async function api_speedtesttracker(svc, timedFetch, utils) {
	const args = (svc.args ?? '').split(',').map(a => a.trim().toLowerCase()).filter(Boolean);
	if (!args.length) return null;

	try {
		const res = await timedFetch(`/proxy?svc=${encodeURIComponent(svc.name)}&path=${encodeURIComponent('/api/speedtest/latest')}`);
		if (!res.ok) return null;

		const { data } = await res.json();
		if (!data || data.failed) return null;

		const available = {
			ping:     () => ({ label: 'Ping', value: `${parseFloat(data.ping).toFixed(1)} ms`,      emoji: '🏓' }),
			download: () => ({ label: 'DL',   value: `${parseFloat(data.download).toFixed(1)} Mbps`, emoji: '⬇️' }),
			upload:   () => ({ label: 'UL',   value: `${parseFloat(data.upload).toFixed(1)} Mbps`,   emoji: '⬆️' }),
		};

		return args.map(a => available[a]?.()).filter(Boolean);
	} catch (err) {
		console.error('[Speedtest Tracker API] Error:', err);
		return null;
	}
}
