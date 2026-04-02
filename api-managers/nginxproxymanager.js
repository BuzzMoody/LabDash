export async function api_nginxproxymanager(svc, timedFetch, utils) {
	const args = (svc.args ?? '').split(',').map(a => a.trim().toLowerCase()).filter(Boolean);
	if (!args.length) return null;

	try {
		// Login (identity + secret → JWT) and token caching are handled server-side by /proxy
		const proxy = path => timedFetch(`/proxy?svc=${encodeURIComponent(svc.name)}&path=${encodeURIComponent(path)}`);

		const [hostsRes, certsRes, versionRes] = await Promise.all([
			args.some(a => ['proxy', 'redirection', 'stream', 'dead'].includes(a))
				? proxy('/api/reports/hosts')
				: Promise.resolve(null),
			args.includes('certs')
				? proxy('/api/nginx/certificates')
				: Promise.resolve(null),
			args.includes('version')
				? proxy('/api/version/check')
				: Promise.resolve(null),
		]);

		const hosts   = hostsRes?.ok  ? await hostsRes.json()   : null;
		const certs   = certsRes?.ok  ? await certsRes.json()   : null;
		const version = versionRes?.ok ? await versionRes.json() : null;

		const available = {
			proxy:       () => hosts   ? { label: 'Proxy',    value: utils.fmtNum(hosts.proxy ?? 0),       emoji: '🎭' } : null,
			redirection: () => hosts   ? { label: 'Redirect', value: utils.fmtNum(hosts.redirection ?? 0), emoji: '🔄' } : null,
			stream:      () => hosts   ? { label: 'Stream',   value: utils.fmtNum(hosts.stream ?? 0),      emoji: '🌊' } : null,
			dead:        () => hosts   ? { label: 'Dead',     value: utils.fmtNum(hosts.dead ?? 0),        emoji: '💀' } : null,
			certs:       () => certs   ? { label: 'Certs',    value: utils.fmtNum(certs.length),           emoji: '🔒' } : null,
			version:     () => version ? { label: 'Version',  value: version.update_available ? `${version.current} ↑` : version.current, emoji: '🏷️' } : null,
		};

		return args.map(a => available[a]?.()).filter(Boolean);
	} catch (err) {
		console.error('[NPM API] Error:', err);
		return null;
	}
}
