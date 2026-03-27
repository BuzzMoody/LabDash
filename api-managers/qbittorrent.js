export async function api_qbittorrent(svc, timedFetch) {
	try {
		const b = (svc.endpoint ?? svc.url).replace(/\/$/, '');
		const [tr, to] = await Promise.all([
			timedFetch(`${b}/api/v2/transfer/info`),
			timedFetch(`${b}/api/v2/torrents/info`),
		]);
		if (!tr.ok || !to.ok) return null;
		const transfer = await tr.json();
		const torrents = await to.json();
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
