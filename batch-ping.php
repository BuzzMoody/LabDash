<?php
// ── Batch status-check proxy ───────────────────────────────────────────────────
// Called by app.js during refreshAll to check all services in one HTTP request.
// Uses curl_multi to fire all HEAD requests in parallel — O(1) PHP-FPM workers
// instead of O(n) for the old per-service ping approach.
//
// Usage:  GET /batch-ping.php?urls[]=<url>&urls[]=<url>...
// Returns: { "<url>": <status_code>, ... }   (0 = could not connect)

$raw = $_GET['urls'] ?? [];
if (!is_array($raw)) $raw = [$raw];

$allowed = [];
foreach ($raw as $url) {
    if (!filter_var($url, FILTER_VALIDATE_URL)) continue;
    $scheme = parse_url($url, PHP_URL_SCHEME);
    if (!in_array($scheme, ['http', 'https'], true)) continue;
    $allowed[] = $url;
}

if (empty($allowed)) {
    header('Content-Type: application/json');
    echo '{}';
    exit;
}

// ── curl_multi: all HEAD requests fire in parallel ────────────────────────────
$mh      = curl_multi_init();
$handles = [];

foreach ($allowed as $url) {
    $ch = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_NOBODY         => true,   // HEAD — never download response body
        CURLOPT_TIMEOUT        => 5,
        CURLOPT_CONNECTTIMEOUT => 3,
        CURLOPT_FOLLOWLOCATION => true,
        CURLOPT_MAXREDIRS      => 2,
        CURLOPT_SSL_VERIFYPEER => false,
        CURLOPT_SSL_VERIFYHOST => false,
        CURLOPT_USERAGENT      => 'LabDash/1.0 (status-check)',
    ]);
    curl_multi_add_handle($mh, $ch);
    $handles[$url] = $ch;
}

$active = null;
do {
    $status = curl_multi_exec($mh, $active);
    if ($active) curl_multi_select($mh, 0.5);
} while ($active && $status === CURLM_OK);

$results = [];
foreach ($handles as $url => $ch) {
    $results[$url] = (int)(curl_getinfo($ch, CURLINFO_HTTP_CODE) ?? 0);
    curl_multi_remove_handle($mh, $ch);
    curl_close($ch);
}
curl_multi_close($mh);

header('Content-Type: application/json');
echo json_encode($results);
