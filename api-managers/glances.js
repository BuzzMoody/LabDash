export async function api_glances(svc, timedFetch) {
	try {
		const b = (svc.endpoint ?? svc.url).replace(/\/$/, '');
		const r = await timedFetch(`${b}/api/4/quicklook`);
		if (!r.ok) return null;
		const d = await r.json();
		const stats = [
			{ label: 'CPU',  value: `${parseFloat(d.cpu).toFixed(1)}%` },
			{ label: 'RAM',  value: `${parseFloat(d.mem).toFixed(1)}%` },
		];
		if (d.swap != null) stats.push({ label: 'Swap', value: `${parseFloat(d.swap).toFixed(1)}%` });
		if (d.load != null) stats.push({ label: 'Load', value: parseFloat(d.load).toFixed(1) });
		return stats;
	} catch { return null; }
}
