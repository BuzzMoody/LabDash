export async function api_homeassistant(svc, timedFetch) {
	try {
		const b = (svc.endpoint ?? svc.url).replace(/\/$/, '');
		const headers = svc.api_key ? { 'Authorization': `Bearer ${svc.api_key}` } : {};
		const res = await timedFetch(`${b}/api/states`, { headers });
		if (!res.ok) return null;
		const states = await res.json();
		return [
			{ label: 'Entities', value: states.length },
			{ label: 'Active',   value: states.filter(s => s.state === 'on').length },
		];
	} catch { return null; }
}