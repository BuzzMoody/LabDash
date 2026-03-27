export async function api_nextcloud(svc, timedFetch, utils) {
	try {
		const b = (svc.endpoint ?? svc.url).replace(/\/$/, '');
		const [user, pass] = (svc.api_key ?? ':').split(':');
		const res = await timedFetch(
			`${b}/ocs/v2.php/apps/serverinfo/api/v1/info?format=json`,
			{ headers: { 'Authorization': `Basic ${btoa(`${user}:${pass}`)}`, 'OCS-APIRequest': 'true' } }
		);
		if (!res.ok) return null;
		const d = await res.json();
		const nc = d?.ocs?.data?.nextcloud;
		const sys = d?.ocs?.data?.server;
		const stats = [
			{ label: 'Files', value: utils.fmtNum(nc?.storage?.num_files) },
			{ label: 'Users', value: utils.fmtNum(nc?.storage?.num_users) },
		];
		if (sys?.php?.version) stats.push({ label: 'PHP', value: sys.php.version.split('.').slice(0,2).join('.') });
		return stats;
	} catch { return null; }
}