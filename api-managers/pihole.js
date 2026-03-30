export async function api_pihole(svc, timedFetch, utils) {
	const args = (svc.args ?? '').split(',').map(a => a.trim().toLowerCase()).filter(Boolean);
	if (!args.length) return null;

	try {
		const b = (svc.endpoint ?? svc.url).replace(/\/$/, '');

		// 1. If we don't have a Session ID saved, log in to get one
		if (!svc._sid && svc.api_key) {
			const authRes = await timedFetch(`${b}/api/auth`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ password: svc.api_key })
			});
			
			if (!authRes.ok) {
				console.error("[Pi-hole API] Login failed. Check App Password.");
				return null;
			}
			
			const authData = await authRes.json();
			// Cache the SID so we reuse it on the next dashboard refresh
			svc._sid = authData.session?.sid || authData.sid; 
		}

		// 2. Pass the SID as a query parameter (avoids preflight CORS headers)
		const query = svc._sid ? `?sid=${encodeURIComponent(svc._sid)}` : '';
		const res = await timedFetch(`${b}/api/stats/summary${query}`);

		// 3. If the session expired, clear it so the next refresh re-authenticates
		if (res.status === 401) {
			svc._sid = null;
			return null;
		}

		if (!res.ok) return null;

		const d = await res.json();

		const total     = d.queries?.total ?? 0;
		const blocked   = d.queries?.blocked ?? 0;
		const pct       = total > 0 ? ((blocked / total) * 100).toFixed(1) : '0.0';
		const frequency = d.queries?.frequency ?? 0;

		const available = {
			total:           () => ({ label: 'Queries',   value: utils.fmtNum(total),                        emoji: '🔍' }),
			blocked:         () => ({ label: 'Blocked',   value: utils.fmtNum(blocked),                      emoji: '🛡️' }),
			percent_blocked: () => ({ label: 'Blocked %', value: `${pct}%`,                                  emoji: '🛡️' }),
			frequency:       () => ({ label: 'Freq',      value: `${parseFloat(frequency).toFixed(1)}/s`,    emoji: '📡' }),
		};

		return args.map(a => available[a]?.()).filter(Boolean);
	} catch (err) {
		console.error(`[Pi-hole v6 API] Error fetching stats:`, err);
		return null;
	}
}