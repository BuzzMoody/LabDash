async function proxyFetch(timedFetch, url, { method = 'GET', headers = {}, body = null, cookies = '' } = {}) {
	const res = await timedFetch('/proxy.php', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ url, method, headers, body, cookies }),
	});
	if (!res.ok) return null;
	return res.json();
}

export async function api_qbittorrent(svc, timedFetch) {
	try {
		const b = (svc.endpoint ?? svc.url).replace(/\/$/, '');

		let sid = '';

		// If credentials are configured, log in to get a session cookie (SID)
		if (svc.username || svc.password) {
			const loginData = await proxyFetch(timedFetch, `${b}/api/v2/auth/login`, {
				method:  'POST',
				headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
				body:    `username=${encodeURIComponent(svc.username ?? '')}&password=${encodeURIComponent(svc.password ?? '')}`,
			});
			if (!loginData || loginData.status !== 200 || loginData.body?.trim() !== 'Ok.') return null;
			sid = loginData.cookies?.find(c => c.startsWith('SID=')) ?? '';
		}

		const [trData, toData] = await Promise.all([
			proxyFetch(timedFetch, `${b}/api/v2/transfer/info`, { cookies: sid }),
			proxyFetch(timedFetch, `${b}/api/v2/torrents/info`, { cookies: sid }),
		]);
		if (!trData || !toData || trData.status !== 200 || toData.status !== 200) return null;

		const transfer = JSON.parse(trData.body);
		const torrents = JSON.parse(toData.body);
		const active   = torrents.filter(t => ['downloading', 'uploading', 'stalledDL', 'stalledUP'].includes(t.state));

		const fmtSpeed = (bps) => {
			if (!bps) return '0 B/s';
			const k = 1024, sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
			const i = Math.floor(Math.log(bps) / Math.log(k));
			return `${(bps / k ** i).toFixed(1)} ${sizes[i]}/s`;
		};

		return [
			{ label: 'Active', value: active.length },
			{ label: 'DL',     value: fmtSpeed(transfer.dl_info_speed ?? 0) },
			{ label: 'UL',     value: fmtSpeed(transfer.up_info_speed ?? 0) },
		];
	} catch { return null; }
}
