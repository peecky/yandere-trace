<?php
require_once("common.php");
require_once("function.php");

if(isset($_COOKIE["userId"]) && isset($_COOKIE["authKey"])) {
	$mysql = &getMysqlUtil();
	$mysql->query("delete from " . TABLE_USER_SESSION . "
		where userId = :userId
		and authKey = :authKey", array(
		":userId" => $_COOKIE["userId"],
		":authKey" => base64_decode($_COOKIE["authKey"], TRUE)
	));
}
$now = time();
// unset cookies by past time
setcookie("userId", "", $now - 3600);
setcookie("authKey", "", $now - 3600);

header("Location: /");
?>
