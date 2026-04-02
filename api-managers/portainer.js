export async function api_portainer(svc, timedFetch) {
	const args = (svc.args ?? '').split(',').map(a => a.trim().toLowerCase()).filter(Boolean);
	if (!args.length) return null;

	try {
		const res = await timedFetch(`/proxy?svc=${encodeURIComponent(svc.name)}&path=${encodeURIComponent('/api/endpoints')}`);
		if (!res.ok) return null;
		const eps = await res.json();

		let total = 0, running = 0, stacks = 0;
		eps.forEach(ep => {
			const snap = ep.Snapshots?.[0];
			if (!snap) return;
			total   += snap.ContainerCount       ?? 0;
			running += snap.RunningContainerCount ?? 0;
			stacks  += snap.StackCount            ?? 0;
		});

		const available = {
			endpoints: () => ({ label: 'Endpoints', value: eps.length,            emoji: '🔗' }),
			running:   () => ({ label: 'Running',   value: `${running}/${total}`, emoji: '🐳' }),
			stacks:    () => ({ label: 'Stacks',    value: stacks,                emoji: '🏗️' }),
		};

		return args.map(a => available[a]?.()).filter(Boolean);
	} catch { return null; }
}
