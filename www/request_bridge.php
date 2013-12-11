<?php
header('Cache-Control: max-age=31556926');
header("Content-type: image/jpeg");
echo file_get_contents($_GET["url"]);
?>
