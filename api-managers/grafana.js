export async function api_grafana(svc, timedFetch) {
	const args = (svc.args ?? '').split(',').map(a => a.trim().toLowerCase()).filter(Boolean);
	if (!args.length) return null;

	try {
		const b       = (svc.endpoint ?? svc.url).replace(/\/$/, '');
		const headers = svc.api_key ? { 'Authorization': `Bearer ${svc.api_key}` } : {};
		const [dashR, dsR] = await Promise.all([
			timedFetch(`${b}/api/search?type=dash-db&limit=500`, { headers }),
			timedFetch(`${b}/api/datasources`, { headers }),
		]);

		const [dashboards, sources] = await Promise.all([
			dashR.ok ? dashR.json() : Promise.resolve([]),
			dsR.ok   ? dsR.json()   : Promise.resolve([]),
		]);

		const available = {
			dashboards: () => ({ label: 'Dashboards', value: dashboards.length }),
			sources:    () => ({ label: 'Sources',    value: sources.length }),
		};

		return args.map(a => available[a]?.()).filter(Boolean);
	} catch { return null; }
}
