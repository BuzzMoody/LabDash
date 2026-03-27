import { makeProxyFetch } from './proxy.js';

export async function api_qbittorrent(svc, timedFetch) {
	const fetch = makeProxyFetch(svc, timedFetch);
	try {
		let cookies = '';

		if (svc.username || svc.password) {
			const login = await fetch('/api/v2/auth/login', {
				method:  'POST',
				headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
				body:    `username=${encodeURIComponent(svc.username ?? '')}&password=${encodeURIComponent(svc.password ?? '')}`,
			});
			if (!login || login.status !== 200 || login.body?.trim() !== 'Ok.') return null;
			cookies = login.cookies?.find(c => c.startsWith('SID=')) ?? '';
		}

		const [tr, to] = await Promise.all([
			fetch('/api/v2/transfer/info', { cookies }),
			fetch('/api/v2/torrents/info', { cookies }),
		]);
		if (!tr || !to || tr.status !== 200 || to.status !== 200) return null;

		const transfer = JSON.parse(tr.body);
		const torrents = JSON.parse(to.body);
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
