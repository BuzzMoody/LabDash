export async function api_jellyfin(svc, timedFetch) {
	try {
		const b = (svc.endpoint ?? svc.url).replace(/\/$/, '');
		const infoR = await timedFetch(`${b}/System/Info/Public`);
		if (!infoR.ok) return null;
		const info = await infoR.json();
		const headers = svc.api_key ? { 'X-Emby-Authorization': `MediaBrowser Token="${svc.api_key}"` } : {};
		const sessR = await timedFetch(`${b}/Sessions`, { headers });
		const sessions = sessR.ok ? await sessR.json() : [];
		return [
			{ label: 'Version',  value: (info.Version ?? '').split('.').slice(0,2).join('.') || '—' },
			{ label: 'Sessions', value: sessions.length },
		];
	} catch { return null; }
}