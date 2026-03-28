<?php
// ── Status-check proxy ────────────────────────────────────────────────────────
// Called by app.js to check whether a service is reachable.
// PHP makes the request server-side so the real HTTP status code is always
// readable — no CORS limitations, no opaque responses.
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

$ctx = stream_context_create([
    'http' => [
        'method'        => 'GET',
        'timeout'       => 4.5,
        'ignore_errors' => true,   // don't throw on 4xx / 5xx — we want the status
        'max_redirects' => 2,
        'header'        => "User-Agent: LabDash/1.0 (status-check)\r\n",
    ],
    'ssl' => [
        'verify_peer'      => false,
        'verify_peer_name' => false,
    ],
]);

@file_get_contents($url, false, $ctx);

$status = 0;
if (!empty($http_response_header) &&
    preg_match('#HTTP/\S+\s+(\d+)#', $http_response_header[0], $m)) {
    $status = (int) $m[1];
}

header('Content-Type: application/json');
echo json_encode(['status' => $status]);
