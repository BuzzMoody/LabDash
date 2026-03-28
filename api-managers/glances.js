export async function api_glances(svc, timedFetch) {
	const args = (svc.args ?? '').split(',').map(a => a.trim().toLowerCase()).filter(Boolean);
	if (!args.length) return null;

	try {
		const b = (svc.endpoint ?? svc.url).replace(/\/$/, '');
		const r = await timedFetch(`${b}/api/4/quicklook`);
		if (!r.ok) return null;
		const d = await r.json();

		const available = {
			cpu:  () => ({ label: 'CPU',  value: `${parseFloat(d.cpu).toFixed(1)}%` }),
			ram:  () => ({ label: 'RAM',  value: `${parseFloat(d.mem).toFixed(1)}%` }),
			swap: () => d.swap != null ? { label: 'Swap', value: `${parseFloat(d.swap).toFixed(1)}%` } : null,
			load: () => d.load != null ? { label: 'Load', value: parseFloat(d.load).toFixed(1) } : null,
		};

		return args.map(a => available[a]?.()).filter(Boolean);
	} catch { return null; }
}
