export async function api_nginxproxymanager(svc, timedFetch, utils) {
	const args = (svc.args ?? '').split(',').map(a => a.trim().toLowerCase()).filter(Boolean);
	if (!args.length) return null;

	try {
		const b = (svc.endpoint ?? svc.url).replace(/\/$/, '');

		// 1. Obtain a Bearer token if we don't have one cached
		if (!svc._token && svc.username && svc.password) {
			const authRes = await timedFetch(`${b}/api/tokens`, {
				method:  'POST',
				headers: { 'Content-Type': 'application/json' },
				body:    JSON.stringify({ identity: svc.username, secret: svc.password }),
			});

			if (!authRes.ok) {
				console.error('[NPM API] Login failed. Check username/password.');
				return null;
			}

			const authData  = await authRes.json();
			svc._token = authData.token;
		}

		const headers = { 'Authorization': `Bearer ${svc._token}` };

		// 2. Fetch all needed endpoints in parallel
		const [hostsRes, certsRes, versionRes] = await Promise.all([
			args.some(a => ['proxy', 'redirection', 'stream', 'dead'].includes(a))
				? timedFetch(`${b}/api/reports/hosts`, { headers })
				: Promise.resolve(null),
			args.includes('certs')
				? timedFetch(`${b}/api/nginx/certificates`, { headers })
				: Promise.resolve(null),
			args.includes('version')
				? timedFetch(`${b}/api/version/check`, { headers })
				: Promise.resolve(null),
		]);

		// 3. Clear cached token and bail on 401 — next poll will re-authenticate
		if ([hostsRes, certsRes, versionRes].some(r => r?.status === 401)) {
			svc._token = null;
			return null;
		}

		const hosts   = hostsRes?.ok  ? await hostsRes.json()   : null;
		const certs   = certsRes?.ok  ? await certsRes.json()   : null;
		const version = versionRes?.ok ? await versionRes.json() : null;

		const available = {
			proxy:       () => hosts   ? { label: 'Proxy',    value: utils.fmtNum(hosts.proxy ?? 0),        emoji: '🔀' } : null,
			redirection: () => hosts   ? { label: 'Redirect', value: utils.fmtNum(hosts.redirection ?? 0),  emoji: '🔄' } : null,
			stream:      () => hosts   ? { label: 'Stream',   value: utils.fmtNum(hosts.stream ?? 0),       emoji: '🌊' } : null,
			dead:        () => hosts   ? { label: 'Dead',     value: utils.fmtNum(hosts.dead ?? 0),         emoji: '💀' } : null,
			certs:       () => certs   ? { label: 'Certs',    value: utils.fmtNum(certs.length),            emoji: '🔒' } : null,
			version:     () => version ? { label: 'Version',  value: version.update_available ? `${version.current} ↑` : version.current, emoji: '📦' } : null,
		};

		return args.map(a => available[a]?.()).filter(Boolean);
	} catch (err) {
		console.error('[NPM API] Error:', err);
		return null;
	}
}
