<?php
// ── Status-check proxy (single URL) ───────────────────────────────────────────
// Called by app.js as a fallback when batch-ping.php is unavailable.
// Uses a HEAD request via curl — no response body downloaded, much lighter
// than the old file_get_contents approach.
//
// Usage:  GET /ping.php?url=<encoded-url>
// Returns: { "status": <int> }   (0 = could not connect)

$url = $_GET['url'] ?? '';

if (!$url || !filter_var($url, FILTER_VALIDATE_URL)) {
    http_response_code(400);
    exit;
}

$scheme = parse_url($url, PHP_URL_SCHEME);
if (!in_array($scheme, ['http', 'https'], true)) {
    http_response_code(400);
    exit;
}

// ── File-based cache (5 s TTL) — shared across all PHP-FPM workers ────────────
$cacheFile = sys_get_temp_dir() . '/lbd_' . md5($url) . '.json';
if (file_exists($cacheFile) && (time() - filemtime($cacheFile)) < 5) {
    header('Content-Type: application/json');
    readfile($cacheFile);
    exit;
}

// ── HEAD request via curl — only fetches headers, never the body ──────────────
$ch = curl_init($url);
curl_setopt_array($ch, [
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_NOBODY         => true,
    CURLOPT_TIMEOUT        => 5,
    CURLOPT_CONNECTTIMEOUT => 3,
    CURLOPT_FOLLOWLOCATION => true,
    CURLOPT_MAXREDIRS      => 2,
    CURLOPT_SSL_VERIFYPEER => false,
    CURLOPT_SSL_VERIFYHOST => false,
    CURLOPT_USERAGENT      => 'LabDash/1.0 (status-check)',
]);
curl_exec($ch);
$status = (int)(curl_getinfo($ch, CURLINFO_HTTP_CODE) ?? 0);
curl_close($ch);

$json = json_encode(['status' => $status]);
file_put_contents($cacheFile, $json);

header('Content-Type: application/json');
echo $json;
