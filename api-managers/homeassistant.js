export async function api_homeassistant(svc, timedFetch) {
	const args = (svc.args ?? '').split(',').map(a => a.trim().toLowerCase()).filter(Boolean);
	if (!args.length) return null;

	try {
		const b       = (svc.endpoint ?? svc.url).replace(/\/$/, '');
		const headers = svc.api_key ? { 'Authorization': `Bearer ${svc.api_key}` } : {};
		const res     = await timedFetch(`${b}/api/states`, { headers });
		if (!res.ok) return null;
		const states = await res.json();

		const available = {
			entities: () => ({ label: 'Entities', value: states.length }),
			active:   () => ({ label: 'Active',   value: states.filter(s => s.state === 'on').length }),
		};

		return args.map(a => available[a]?.()).filter(Boolean);
	} catch { return null; }
}
