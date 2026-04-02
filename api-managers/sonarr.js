export async function api_sonarr(svc, timedFetch) {
	const args = (svc.args ?? '').split(',').map(a => a.trim().toLowerCase()).filter(Boolean);
	if (!args.length) return null;

	try {
		const res = await timedFetch(`/proxy?svc=${encodeURIComponent(svc.name)}&path=${encodeURIComponent('/api/v3/series')}`);
		if (!res.ok) return null;
		const series = await res.json();

		const available = {
			series:    () => ({ label: 'Series',    value: series.length,                          emoji: '📺' }),
			monitored: () => ({ label: 'Monitored', value: series.filter(s => s.monitored).length, emoji: '👁️' }),
		};

		return args.map(a => available[a]?.()).filter(Boolean);
	} catch { return null; }
}
