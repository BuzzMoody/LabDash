export async function api_dispatcharr(svc, timedFetch, utils) {
	try {
		const b = (svc.endpoint ?? svc.url).replace(/\/$/, '');

		// 1. Obtain a Bearer token using username + password
		const authRes = await timedFetch(`${b}/api/accounts/token/`, {
			method:  'POST',
			headers: { 'Content-Type': 'application/json' },
			body:    JSON.stringify({ username: svc.username, password: svc.password }),
		});
		if (!authRes.ok) return null;

		const { access } = await authRes.json();
		if (!access) return null;

		// 2. Fetch channel lineup using the access token
		const res = await timedFetch(`${b}/api/hdhr/lineup.json`, {
			headers: { 'Authorization': `Bearer ${access}` },
		});
		if (!res.ok) return null;

		const channels = await res.json();

		return [
			{ label: 'Channels', value: utils.fmtNum(channels.length) },
		];
	} catch (err) {
		console.error('[Dispatcharr API] Error:', err);
		return null;
	}
}
