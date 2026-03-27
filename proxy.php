<?php
// =============================================================================
//  LabDash — proxy.php
//  Server-side relay for API requests to avoid CORS issues.
//  Accepts POST with JSON body: { url, method?, headers?, body?, cookies? }
//  Returns JSON: { status, body, cookies[] }
// =============================================================================

header('Content-Type: application/json');
header('Cache-Control: no-store');

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    exit(json_encode(['error' => 'POST only']));
}

$input = json_decode(file_get_contents('php://input'), true);

if (empty($input['url']) || !preg_match('#^https?://#i', $input['url'])) {
    http_response_code(400);
    exit(json_encode(['error' => 'Invalid or missing url']));
}

$ch = curl_init($input['url']);
curl_setopt_array($ch, [
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_HEADER         => true,
    CURLOPT_FOLLOWLOCATION => true,
    CURLOPT_TIMEOUT        => 10,
    CURLOPT_SSL_VERIFYPEER => false,
    CURLOPT_SSL_VERIFYHOST => false,
]);

$method = strtoupper($input['method'] ?? 'GET');
if ($method === 'POST') {
    curl_setopt($ch, CURLOPT_POST, true);
    if (!empty($input['body'])) {
        curl_setopt($ch, CURLOPT_POSTFIELDS, $input['body']);
    }
}

if (!empty($input['headers'])) {
    $hdrs = [];
    foreach ($input['headers'] as $k => $v) $hdrs[] = "$k: $v";
    curl_setopt($ch, CURLOPT_HTTPHEADER, $hdrs);
}

if (!empty($input['cookies'])) {
    curl_setopt($ch, CURLOPT_COOKIE, $input['cookies']);
}

$raw        = curl_exec($ch);
$status     = curl_getinfo($ch, CURLINFO_HTTP_CODE);
$headerSize = curl_getinfo($ch, CURLINFO_HEADER_SIZE);
curl_close($ch);

$rawHeaders = substr($raw, 0, $headerSize);
$body       = substr($raw, $headerSize);

// Extract Set-Cookie values so the JS layer can reuse the session
$cookies = [];
foreach (explode("\r\n", $rawHeaders) as $line) {
    if (stripos($line, 'Set-Cookie:') === 0) {
        $parts     = explode(';', trim(substr($line, 11)));
        $cookies[] = trim($parts[0]);
    }
}

echo json_encode(['status' => $status, 'body' => $body, 'cookies' => $cookies]);
