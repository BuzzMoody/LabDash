export async function api_glances(svc, timedFetch) {
	try {
		const b = (svc.endpoint ?? svc.url).replace(/\/$/, '');
		const [cpuR, memR, loadR] = await Promise.all([
			timedFetch(`${b}/api/3/cpu`),
			timedFetch(`${b}/api/3/mem`),
			timedFetch(`${b}/api/3/load`),
		]);
		if (!cpuR.ok || !memR.ok) return null;
		const cpu = await cpuR.json();
		const mem = await memR.json();
		const load = loadR.ok ? await loadR.json() : null;
		const stats = [
			{ label: 'CPU',  value: `${parseFloat(cpu.total).toFixed(1)}%` },
			{ label: 'RAM',  value: `${parseFloat(mem.percent).toFixed(1)}%` },
		];
		if (load?.min1 != null) stats.push({ label: 'Load', value: load.min1.toFixed(2) });
		return stats;
	} catch { return null; }
}