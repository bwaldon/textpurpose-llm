<?php

$experiment_id = $_POST['experiment_id'] ?? '';
$participant_id = $_POST['participant_id'] ?? '';
$data          = $_POST['data'] ?? '';

if (empty($experiment_id) || empty($participant_id) || empty($data)) {
    http_response_code(400);
    echo json_encode(["error" => "Missing required fields"]);
    exit;
}

// only allow safe characters to prevent path traversal
if (!preg_match('/^[a-zA-Z0-9_-]+$/', $experiment_id) ||
    !preg_match('/^[a-zA-Z0-9_-]+$/', $participant_id)) {
    http_response_code(400);
    echo json_encode(["error" => "Invalid experiment_id or participant_id"]);
    exit;
}

$dir  = 'results/' . $experiment_id;
$file = $dir . '/' . $participant_id . '.json';

if (!is_dir($dir)) {
    mkdir($dir, 0755, true);
}

if (file_exists($file)) {
    echo json_encode(["error" => "Data already recorded for this participant"]);
    exit;
}

file_put_contents($file, $data);
echo json_encode(["success" => true]);
