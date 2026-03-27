export async function api_grafana(svc, timedFetch) {
	try {
		const b = (svc.endpoint ?? svc.url).replace(/\/$/, '');
		const headers = svc.api_key ? { 'Authorization': `Bearer ${svc.api_key}` } : {};
		const [dashR, dsR] = await Promise.all([
			timedFetch(`${b}/api/search?type=dash-db&limit=500`, { headers }),
			timedFetch(`${b}/api/datasources`, { headers }),
		]);
		return [
			{ label: 'Dashboards', value: (dashR.ok ? await dashR.json() : []).length },
			{ label: 'Sources',    value: (dsR.ok ? await dsR.json() : []).length },
		];
	} catch { return null; }
}