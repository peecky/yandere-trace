<?php
$url = $_GET["url"];
if (!filter_var($url, FILTER_VALIDATE_URL)) exit();

require_once("common.php");
if (!$session["isNormalUser"]) exit();

header('Cache-Control: max-age=31556926');
header("Content-type: image/jpeg");
$context = stream_context_create();
$fp = fopen($url, 'r', false, $context);
fpassthru($fp);
fclose($fp);
?>
