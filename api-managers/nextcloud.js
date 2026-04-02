export async function api_nextcloud(svc, timedFetch, utils) {
	const args = (svc.args ?? '').split(',').map(a => a.trim().toLowerCase()).filter(Boolean);
	if (!args.length) return null;

	try {
		const res = await timedFetch(`/proxy?svc=${encodeURIComponent(svc.name)}&path=${encodeURIComponent('/ocs/v2.php/apps/serverinfo/api/v1/info?format=json')}`);
		if (!res.ok) return null;
		const d   = await res.json();
		const nc  = d?.ocs?.data?.nextcloud;
		const sys = d?.ocs?.data?.server;

		const available = {
			files: () => ({ label: 'Files', value: utils.fmtNum(nc?.storage?.num_files), emoji: '📄' }),
			users: () => ({ label: 'Users', value: utils.fmtNum(nc?.storage?.num_users), emoji: '👤' }),
			php:   () => sys?.php?.version ? { label: 'PHP', value: sys.php.version.split('.').slice(0, 2).join('.'), emoji: '🐘' } : null,
		};

		return args.map(a => available[a]?.()).filter(Boolean);
	} catch { return null; }
}
