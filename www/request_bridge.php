<?php
$url = $_GET["url"];
if (!filter_var($url, FILTER_VALIDATE_URL)) exit();
header('Cache-Control: max-age=31556926');
header("Content-type: image/jpeg");
echo file_get_contents($url);
?>
