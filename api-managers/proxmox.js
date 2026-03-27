export async function api_proxmox(svc, timedFetch) {
	try {
		const b = (svc.endpoint ?? svc.url).replace(/\/$/, '');
		const headers = svc.api_key ? { 'Authorization': `PVEAPIToken=${svc.api_key}` } : {};
		const res = await timedFetch(`${b}/api2/json/cluster/resources`, { headers });
		if (!res.ok) return null;
		const { data } = await res.json();
		const vms = data.filter(r => r.type === 'vm' || r.type === 'lxc');
		const running = vms.filter(v => v.status === 'running').length;
		return [
			{ label: 'VMs/LXC', value: vms.length },
			{ label: 'Running',  value: running },
			{ label: 'Nodes',    value: data.filter(r => r.type === 'node').length },
		];
	} catch { return null; }
}