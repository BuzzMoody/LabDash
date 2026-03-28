export async function api_proxmox(svc, timedFetch) {
	const args = (svc.args ?? '').split(',').map(a => a.trim().toLowerCase()).filter(Boolean);
	if (!args.length) return null;

	try {
		const b       = (svc.endpoint ?? svc.url).replace(/\/$/, '');
		const headers = { 'Authorization': `PVEAPIToken=${svc.api_key}` };

		const res = await timedFetch(`${b}/api2/json/cluster/resources`, { headers });
		if (!res.ok) return null;

		const { data } = await res.json();
		const vms  = data.filter(r => r.type === 'qemu');
		const lxcs = data.filter(r => r.type === 'lxc');

		const available = {
			vms:  () => ({ label: 'VMs',  value: `${vms.filter(v => v.status === 'running').length}/${vms.length}` }),
			lxcs: () => ({ label: 'LXCs', value: `${lxcs.filter(l => l.status === 'running').length}/${lxcs.length}` }),
		};

		return args.map(a => available[a]?.()).filter(Boolean);
	} catch (err) {
		console.error('[Proxmox API] Error:', err);
		return null;
	}
}
