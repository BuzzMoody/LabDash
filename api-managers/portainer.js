export async function api_portainer(svc, timedFetch) {
	try {
		const b = (svc.endpoint ?? svc.url).replace(/\/$/, '');
		const headers = svc.api_key ? { 'X-API-Key': svc.api_key } : {};
		const [epR, cR] = await Promise.all([
			timedFetch(`${b}/api/endpoints`, { headers }),
			timedFetch(`${b}/api/containers/json?all=true`, { headers }),
		]);
		const eps = epR.ok ? await epR.json() : [];
		const ctrs = cR.ok ? await cR.json() : [];
		return [
			{ label: 'Endpoints',  value: eps.length },
			{ label: 'Containers', value: ctrs.length },
			{ label: 'Running',    value: ctrs.filter(c => c.State === 'running').length },
		];
	} catch { return null; }
}