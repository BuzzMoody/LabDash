// Shared server-side proxy helper.
// Returns a fetch(path, opts?) function scoped to the service's base URL,
// mirroring the this.fetch(path) pattern used in other dashboard frameworks.
export function makeProxyFetch(svc, timedFetch) {
	const base = (svc.endpoint ?? svc.url).replace(/\/$/, '');
	return (path, { method = 'GET', headers = {}, body = null, cookies = '' } = {}) =>
		timedFetch('/proxy.php', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ url: `${base}${path}`, method, headers, body, cookies }),
		}).then(r => r.ok ? r.json() : null);
}
