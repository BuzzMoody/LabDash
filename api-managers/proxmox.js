export async function api_proxmox(svc, timedFetch) {
	try {
		const baseUrl = (svc.endpoint ?? svc.url).replace(/\/$/, '');
		const headers = { 'Authorization': `PVEAPIToken=${svc.api_key}` };

		const res = await timedFetch(`${baseUrl}/api2/json/cluster/resources`, { headers });
		if (!res.ok) return null;

		const { data } = await res.json();

		// Filter and breakdown
		const vms = data.filter(r => r.type === 'qemu');
		const lxcs = data.filter(r => r.type === 'lxc');

		const runningVMs = vms.filter(v => v.status === 'running').length;
		const runningLXCs = lxcs.filter(l => l.status === 'running').length;

		return [
			{ label: 'VMs',  value: `${runningVMs}/${vms.length}` },
			{ label: 'LXCs', value: `${runningLXCs}/${lxcs.length}` }
		];
	} catch (err) {
		console.error("Proxmox API Error:", err);
		return null;
	}
}