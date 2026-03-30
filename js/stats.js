'use strict';

// ── Stats scroll — fade indicators ───────────────────────────────────────────
// Evaluates whether the chip strip overflows and starts/stops the infinite
// scroll animation accordingly. Called after every stats update.

export function updateStatsFades(statsEl) {
	const wrapper = statsEl?.parentElement;
	if (!wrapper) return;

	// While the CSS animation is running, scrollWidth === clientWidth
	// (width: max-content), so the normal overflow check is meaningless.
	// Keep both fades visible and bail out early.
	if (statsEl.classList.contains('is-auto-scrolling')) return;

	const canScroll    = statsEl.scrollWidth > statsEl.clientWidth + 2;
	const cloneRunning = statsEl.querySelector('[data-scroll-clone]') !== null;

	statsEl.classList.toggle('can-scroll', canScroll);

	if (canScroll && !cloneRunning)       wrapper._startScroll?.();
	else if (!canScroll && cloneRunning)  wrapper._stopScroll?.();
}

// ── Stats scroll — infinite CSS animation ────────────────────────────────────
// Clones chips to form a seamless double-length strip, then drives it with a
// CSS @keyframes animation so the browser runs it on the compositor thread
// regardless of main-thread activity or mouse state.
//
// Start/stop are exposed as wrapper._startScroll / wrapper._stopScroll so
// updateStatsFades can trigger them automatically when overflow changes.

export function initStatsDrag(wrapper) {
	const statsEl = wrapper.querySelector('.service-stats');
	if (!statsEl) return;

	const SCROLL_SPEED = 30; // px per second

	function stopScroll() {
		// Capture the current translated position BEFORE removing the animation
		// class — getComputedStyle returns 'none' the moment the class is removed,
		// so we read and stash it first so startScroll can resume from the same pixel.
		if (statsEl.classList.contains('is-auto-scrolling')) {
			const matrix = new DOMMatrix(getComputedStyle(statsEl).transform);
			wrapper._resumeOffset = Math.abs(matrix.m41);
		}
		statsEl.classList.remove('is-auto-scrolling');
		statsEl.style.animationDuration = '';
		statsEl.style.animationDelay    = '';
		statsEl.style.removeProperty('--scroll-loop-w');
		statsEl.querySelectorAll('[data-scroll-clone]').forEach(el => el.remove());
	}

	function startScroll() {
		stopScroll(); // captures current offset into wrapper._resumeOffset
		if (!statsEl.classList.contains('can-scroll')) return;

		const resumeOffset = wrapper._resumeOffset ?? 0;

		// Clone original chips to create a seamless double-length strip
		statsEl.querySelectorAll('.stat-chip:not([data-scroll-clone])').forEach(chip => {
			const clone = chip.cloneNode(true);
			clone.setAttribute('data-scroll-clone', '');
			clone.setAttribute('aria-hidden', 'true');
			statsEl.appendChild(clone);
		});

		// Apply the animating class (sets width: max-content), then force a
		// synchronous reflow so offsetLeft is accurate before we measure the loop width
		statsEl.classList.add('is-auto-scrolling');
		void statsEl.offsetWidth;

		// Measure the exact start of the first clone for a pixel-perfect seamless loop
		const firstClone = statsEl.querySelector('[data-scroll-clone]');
		const loopW      = firstClone ? firstClone.offsetLeft : statsEl.scrollWidth / 2;
		const duration   = loopW / SCROLL_SPEED;

		// A negative animation-delay seeks to the matching pixel position,
		// allowing the scroll to resume without jumping
		const delay = -((resumeOffset % loopW) / loopW) * duration;

		statsEl.style.setProperty('--scroll-loop-w', `${loopW}px`);
		statsEl.style.animationDuration = `${duration}s`;
		statsEl.style.animationDelay    = `${delay}s`;
	}

	wrapper._startScroll = startScroll;
	wrapper._stopScroll  = stopScroll;

	// Evaluate initial scroll state once layout is complete
	requestAnimationFrame(() => updateStatsFades(statsEl));
}

// ── Initialise all stats wrappers on the page ─────────────────────────────────

export function initAllStatsDrag() {
	document.querySelectorAll('.stats-scroll-wrapper').forEach(initStatsDrag);
}
