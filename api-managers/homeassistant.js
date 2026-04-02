export async function api_homeassistant(svc, timedFetch) {
	const args = (svc.args ?? '').split(',').map(a => a.trim().toLowerCase()).filter(Boolean);
	if (!args.length) return null;

	try {
		const res = await timedFetch(`/proxy?svc=${encodeURIComponent(svc.name)}&path=${encodeURIComponent('/api/states')}`);
		if (!res.ok) return null;
		const states = await res.json();

		const available = {
			entities: () => ({ label: 'Entities', value: states.length,                               emoji: '🏠' }),
			active:   () => ({ label: 'Active',   value: states.filter(s => s.state === 'on').length, emoji: '✅' }),
		};

		return args.map(a => available[a]?.()).filter(Boolean);
	} catch { return null; }
}
