'use strict';

import { state }     from './state.js';
import { showToast } from './utils.js';

// ── Minimal Markdown renderer ─────────────────────────────────────────────────
// Supports ## headings, - list items, --- horizontal rules, **bold**,
// [text](url) links, and bare https:// URLs. Used only for the changelog modal.

function simpleMarkdown(md) {
	const escape = s => s
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;');

	const inline = s => {
		const re   = /(\*\*[^*]+\*\*|\[[^\]]+\]\([^)]+\)|https?:\/\/[^\s<>"]+)/g;
		const out  = [];
		let last   = 0;
		let m;
		while ((m = re.exec(s)) !== null) {
			out.push(escape(s.slice(last, m.index)));
			const bold    = m[0].match(/^\*\*(.+)\*\*$/);
			const link    = m[0].match(/^\[(.+?)\]\((.+?)\)$/);
			const bareUrl = m[0].match(/^https?:\/\//);
			if (bold)         out.push(`<strong>${escape(bold[1])}</strong>`);
			else if (link)    out.push(`<a href="${link[2]}" target="_blank" rel="noopener noreferrer">${escape(link[1])}</a>`);
			else if (bareUrl) out.push(`<a href="${m[0]}" target="_blank" rel="noopener noreferrer">${escape(m[0])}</a>`);
			last = m.index + m[0].length;
		}
		out.push(escape(s.slice(last)));
		return out.join('');
	};

	const lines  = md.split('\n');
	const parts  = [];
	let inList   = false;

	for (const line of lines) {
		const h2 = line.match(/^## (.+)/);
		const li = line.match(/^- (.+)/);
		const hr = /^---/.test(line.trim());

		if (h2) {
			if (inList) { parts.push('</ul>'); inList = false; }
			parts.push(`<h2>${inline(h2[1])}</h2>`);
		} else if (li) {
			if (!inList) { parts.push('<ul>'); inList = true; }
			parts.push(`<li>${inline(li[1])}</li>`);
		} else if (hr) {
			if (inList) { parts.push('</ul>'); inList = false; }
			parts.push('<hr>');
		} else if (line.trim()) {
			if (inList) { parts.push('</ul>'); inList = false; }
			parts.push(`<p>${inline(line)}</p>`);
		}
	}

	if (inList) parts.push('</ul>');
	return parts.join('');
}

// ── Semver comparison ─────────────────────────────────────────────────────────

function parseSemver(v) {
	return (v ?? '').replace(/^v/, '').split('.').map(n => parseInt(n, 10) || 0);
}

function isNewerVersion(current, latest) {
	const [ca, cb, cc] = parseSemver(current);
	const [la, lb, lc] = parseSemver(latest);
	if (la !== ca) return la > ca;
	if (lb !== cb) return lb > cb;
	return lc > cc;
}

// ── Update checker ────────────────────────────────────────────────────────────
// Fetches the latest GitHub release tag and compares it to the running version.
// If a newer release exists, adds a pulsing dot to the version button and stores
// the latest version in state so initChangelog can show the update notice.
// Fails silently when offline or GitHub is rate-limited.

export async function checkForUpdate() {
	try {
		const btn     = document.getElementById('version-btn');
		const current = btn?.textContent?.trim() ?? '';
		if (!current) return;

		const res = await fetch(
			'https://api.github.com/repos/BuzzMoody/LabDash/releases/latest',
			{ cache: 'no-store' }
		);
		if (!res.ok) return;

		const { tag_name: latest } = await res.json();
		if (!latest || !isNewerVersion(current, latest)) return;

		state.updateAvailable = true;
		state.latestVersion   = latest;

		if (!btn.querySelector('.update-dot')) {
			const dot = document.createElement('span');
			dot.className = 'update-dot';
			dot.title     = `Update available: ${latest}`;
			btn.appendChild(dot);
			btn.classList.add('has-update');
		}
	} catch {
		// Silently fail — no internet or GitHub rate-limited
	}
}

// ── Changelog modal ───────────────────────────────────────────────────────────
// Wires up the version button to open the changelog overlay. If an update is
// available, an update notice with docker pull instructions is prepended.

export function initChangelog() {
	const modal    = document.getElementById('changelog-modal');
	const bodyEl   = document.getElementById('changelog-body');
	const btn      = document.getElementById('version-btn');
	const closeBtn = modal?.querySelector('.changelog-close');
	const backdrop = modal?.querySelector('.changelog-backdrop');
	if (!modal || !btn) return;

	const md = (typeof window.__CHANGELOG__ === 'string') ? window.__CHANGELOG__.trim() : '';

	const ICON_COPY = `<svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="2" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>`;
	const ICON_CHECK = `<svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`;

	function cmdBlock(command) {
		return `<div class="update-cmd-wrapper">
			<pre class="update-cmd">${command}</pre>
			<button class="copy-cmd-btn" title="Copy to clipboard" aria-label="Copy to clipboard">${ICON_COPY}</button>
		</div>`;
	}

	function openModal() {
		let html = '';

		if (state.updateAvailable && state.latestVersion) {
			html += `<div class="update-notice">
				<div class="update-notice-title">🚀 Update available &mdash; ${state.latestVersion}</div>
				<p>A newer version of LabDash is available. To update, run:</p>
				${cmdBlock('docker compose pull &amp;&amp; docker compose up -d')}
				<p>Or if using a standalone <code>docker run</code>:</p>
				${cmdBlock('docker pull buzzmoody/homelab-dash:latest')}
			</div>`;
		}

		html += md ? simpleMarkdown(md) : '<p>No release notes available.</p>';
		bodyEl.innerHTML = html;

		// Wire up copy buttons
		bodyEl.querySelectorAll('.copy-cmd-btn').forEach(copyBtn => {
			copyBtn.addEventListener('click', async () => {
				const text = copyBtn.closest('.update-cmd-wrapper')
					.querySelector('.update-cmd')
					.textContent.trim()
					// Decode the HTML entity we used in the template
					.replace(/&amp;/g, '&');
				try {
					await navigator.clipboard.writeText(text);
					copyBtn.innerHTML = ICON_CHECK;
					copyBtn.classList.add('copied');
					showToast('Command copied to clipboard', 'success');
					setTimeout(() => {
						copyBtn.innerHTML = ICON_COPY;
						copyBtn.classList.remove('copied');
					}, 2000);
				} catch {
					showToast('Could not access clipboard', 'error');
				}
			});
		});

		modal.classList.remove('hidden');
		document.body.style.overflow = 'hidden';
	}

	function closeModal() {
		modal.classList.add('hidden');
		document.body.style.overflow = '';
	}

	btn.addEventListener('click', openModal);
	closeBtn?.addEventListener('click', closeModal);
	backdrop?.addEventListener('click', closeModal);
	document.addEventListener('keydown', e => {
		if (e.key === 'Escape' && !modal.classList.contains('hidden')) closeModal();
	});
}
