export async function api_portainer(svc, timedFetch) {
	try {
		const b       = (svc.endpoint ?? svc.url).replace(/\/$/, '');
		const headers = svc.api_key ? { 'x-api-key': svc.api_key } : {};

		const res = await timedFetch(`${b}/api/endpoints`, { headers });
		if (!res.ok) return null;
		const eps = await res.json();

		// Aggregate container counts across all endpoints via snapshot data
		let total = 0, running = 0, stacks = 0;
		eps.forEach(ep => {
			const snap = ep.Snapshots?.[0];
			if (!snap) return;
			total   += snap.ContainerCount        ?? 0;
			running += snap.RunningContainerCount  ?? 0;
			stacks  += snap.StackCount             ?? 0;
		});

		return [
			{ label: 'Endpoints',  value: eps.length },
			{ label: 'Running',    value: `${running}/${total}` },
			{ label: 'Stacks',     value: stacks },
		];
	} catch { return null; }
}
