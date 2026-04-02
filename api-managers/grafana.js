export async function api_grafana(svc, timedFetch) {
	const args = (svc.args ?? '').split(',').map(a => a.trim().toLowerCase()).filter(Boolean);
	if (!args.length) return null;

	try {
		const proxy = path => timedFetch(`/proxy?svc=${encodeURIComponent(svc.name)}&path=${encodeURIComponent(path)}`);
		const [dashR, dsR] = await Promise.all([
			proxy('/api/search?type=dash-db&limit=500'),
			proxy('/api/datasources'),
		]);

		const [dashboards, sources] = await Promise.all([
			dashR.ok ? dashR.json() : Promise.resolve([]),
			dsR.ok   ? dsR.json()   : Promise.resolve([]),
		]);

		const available = {
			dashboards: () => ({ label: 'Dashboards', value: dashboards.length, emoji: '📊' }),
			sources:    () => ({ label: 'Sources',    value: sources.length,    emoji: '🔌' }),
		};

		return args.map(a => available[a]?.()).filter(Boolean);
	} catch { return null; }
}
