export async function api_vaultwarden(svc, timedFetch) {
	const args = (svc.args ?? '').split(',').map(a => a.trim().toLowerCase()).filter(Boolean);
	if (!args.length) return null;

	try {
		const b   = (svc.endpoint ?? svc.url).replace(/\/$/, '');
		const res = await timedFetch(`${b}/api/version`);
		if (!res.ok) return null;

		const version = await res.json();

		const available = {
			version: () => ({ label: 'Version', value: version, emoji: '🏷️' }),
		};

		return args.map(a => available[a]?.()).filter(Boolean);
	} catch (err) {
		console.error('[Vaultwarden API] Error:', err);
		return null;
	}
}
