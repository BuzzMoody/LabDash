<?php
// ── Read services.yaml from the mounted config directory ──────────────────────
// /config/services.yaml is outside the web root — never directly web-accessible.
// Falls back to a same-directory services.yaml for local development.
$configPath = '/config/services.yaml';
if (!file_exists($configPath)) {
    $configPath = __DIR__ . '/services.yaml';
}
$yamlContent = file_exists($configPath) ? file_get_contents($configPath) : '';

header('Cache-Control: no-store, no-cache, must-revalidate');
header('Pragma: no-cache');
header('Expires: 0');
?>

<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
  <meta name="color-scheme" content="dark" />
  <title>Homelab Dashboard</title>
  <link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>⚡</text></svg>" />
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600&display=swap" rel="stylesheet" />
  <link rel="stylesheet" href="styles.css?v=<?= filemtime(__DIR__.'/styles.css') ?>" />
  <!-- Inject services.yaml content — browser never needs to fetch the file itself -->
  <script>window.__DASHBOARD_YAML__ = <?= json_encode($yamlContent) ?>;</script>
  <!-- js-yaml is bundled locally so the dashboard works without internet access -->
  <script src="js-yaml.min.js?v=<?= file_exists(__DIR__.'/js-yaml.min.js') ? filemtime(__DIR__.'/js-yaml.min.js') : '1' ?>" onerror="document.write('<script src=\'https://cdn.jsdelivr.net/npm/js-yaml@4/dist/js-yaml.min.js\'><\/script>')"></script>
</head>
<body>

  <!-- Ambient background layer -->
  <div class="bg-layer" aria-hidden="true">
    <div class="orb orb-1"></div>
    <div class="orb orb-2"></div>
    <div class="orb orb-3"></div>
    <div class="grid-dots"></div>
  </div>

  <div id="app">

    <!-- ── Sidebar ──────────────────────────────────────── -->
    <aside id="sidebar" role="navigation" aria-label="Service categories">
      <div class="sidebar-brand">
        <div class="brand-icon" aria-hidden="true">
          <svg viewBox="0 0 36 36" fill="none" xmlns="http://www.w3.org/2000/svg">
            <rect x="2" y="2" width="14" height="14" rx="3" stroke="url(#g1)" stroke-width="2"/>
            <rect x="20" y="2" width="14" height="14" rx="3" stroke="url(#g2)" stroke-width="2"/>
            <rect x="2" y="20" width="14" height="14" rx="3" stroke="url(#g2)" stroke-width="2"/>
            <rect x="20" y="20" width="14" height="14" rx="3" stroke="url(#g1)" stroke-width="2"/>
            <defs>
              <linearGradient id="g1" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stop-color="#22d3ee"/>
                <stop offset="100%" stop-color="#818cf8"/>
              </linearGradient>
              <linearGradient id="g2" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stop-color="#818cf8"/>
                <stop offset="100%" stop-color="#e879f9"/>
              </linearGradient>
            </defs>
          </svg>
        </div>
        <div class="brand-text">
          <span class="brand-title" id="dash-title">HOMELAB</span>
          <span class="brand-subtitle" id="dash-subtitle">DASHBOARD</span>
        </div>
      </div>

      <div class="sidebar-search">
        <svg class="search-icon" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true">
          <circle cx="9" cy="9" r="6"/><path d="m16 16-3.5-3.5"/>
        </svg>
        <input
          type="search"
          id="search"
          class="search-input"
          placeholder="Search services…"
          autocomplete="off"
          spellcheck="false"
          aria-label="Search services"
        />
      </div>

      <nav id="cat-nav" aria-label="Filter by category">
        <!-- Populated by JavaScript -->
      </nav>

      <div class="sidebar-footer">
        <div class="refresh-area">
          <button id="refresh-btn" class="refresh-btn" title="Refresh now" aria-label="Refresh all services">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
              <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/>
              <path d="M21 3v5h-5"/>
              <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/>
              <path d="M8 16H3v5"/>
            </svg>
          </button>
          <div class="refresh-times">
            <div class="last-updated" id="last-updated" aria-live="polite">Loading…</div>
            <div class="next-refresh" id="next-refresh" aria-live="polite">—</div>
          </div>
        </div>
        <div class="sidebar-meta">
          <span class="meta-item">v1.0.0</span>
          <span class="meta-sep">·</span>
          <a href="https://github.com/" class="meta-item meta-link" target="_blank" rel="noopener noreferrer">GitHub</a>
          <span class="meta-sep">·</span>
          <span class="meta-item">Made by Buzz</span>
        </div>
      </div>
    </aside>

    <!-- ── Main content ──────────────────────────────────── -->
    <div id="main-content">

      <header id="top-bar" role="banner">
        <div class="topbar-left">
          <button id="sidebar-toggle" class="sidebar-toggle" aria-label="Toggle sidebar" aria-expanded="true">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
              <line x1="3" y1="6" x2="21" y2="6"/>
              <line x1="3" y1="12" x2="21" y2="12"/>
              <line x1="3" y1="18" x2="21" y2="18"/>
            </svg>
          </button>
          <div class="topbar-heading" id="topbar-heading">All Services</div>
        </div>
        <div class="topbar-stats" id="topbar-stats" aria-live="polite">
          <button class="stat-pill online-pill" id="pill-online" title="Filter: online services only">
            <span class="dot dot-online"></span>
            <span id="count-online">0</span>
          </button>
          <button class="stat-pill offline-pill" id="pill-offline" title="Filter: offline services only">
            <span class="dot dot-offline"></span>
            <span id="count-offline">0</span>
          </button>
          <button class="stat-pill total-pill" id="pill-total" title="Show all services">
            <span id="count-total">0</span> total
          </button>
        </div>
        <div class="view-toggle" id="view-toggle" role="group" aria-label="View mode">
          <button class="view-btn" data-view="flat" title="List view" aria-label="List view">
            <svg viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
              <rect x="1" y="2"  width="14" height="2" rx="0.5"/>
              <rect x="1" y="6"  width="14" height="2" rx="0.5"/>
              <rect x="1" y="10" width="14" height="2" rx="0.5"/>
              <rect x="1" y="14" width="9"  height="2" rx="0.5"/>
            </svg>
          </button>
          <button class="view-btn" data-view="grouped" title="Grouped by category" aria-label="Grouped view">
            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true">
              <line x1="1" y1="3"  x2="15" y2="3"/>
              <rect x="1" y="5"  width="6" height="2" rx="0.5" fill="currentColor" stroke="none"/>
              <rect x="9" y="5"  width="6" height="2" rx="0.5" fill="currentColor" stroke="none"/>
              <line x1="1" y1="10" x2="15" y2="10"/>
              <rect x="1" y="12" width="6" height="2" rx="0.5" fill="currentColor" stroke="none"/>
              <rect x="9" y="12" width="6" height="2" rx="0.5" fill="currentColor" stroke="none"/>
            </svg>
          </button>
        </div>
        <div class="clock" id="clock" aria-live="off"></div>
      </header>

      <!-- Loading overlay -->
      <div id="loading-overlay" role="status" aria-label="Loading services">
        <div class="loader">
          <div class="loader-ring outer"></div>
          <div class="loader-ring inner"></div>
        </div>
        <p class="loader-text">Initializing dashboard…</p>
      </div>

      <!-- Services grid -->
      <div id="services-grid" role="main" aria-label="Service cards" aria-live="polite">
        <!-- Populated by JavaScript -->
      </div>

      <!-- Empty state -->
      <div id="empty-state" class="empty-state hidden" role="status">
        <div class="empty-icon" aria-hidden="true">🔍</div>
        <h3>No services found</h3>
        <p>Try adjusting your search or selecting a different category.</p>
      </div>

    </div><!-- /#main-content -->

  </div><!-- /#app -->

  <!-- Toast container -->
  <div id="sidebar-overlay"></div>
  <div id="toast-container" role="alert" aria-live="assertive" aria-atomic="true"></div>

  <script src="app.js?v=<?= filemtime(__DIR__.'/app.js') ?>"></script>
</body>
</html>
