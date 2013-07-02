<?php
$setting = parse_ini_file("../config.ini");

define("WWW_DATA_PATH", $setting['WWW_DATA_PATH']);
define("WWW_LIB_PATH", $setting['WWW_LIB_PATH']);

define("THUMBNAIL_DATA_PATH", WWW_DATA_PATH . "thumbnail/");
define("ORIGINAL_SERVER_BASE_ADDRESS", $setting['SERVER_BASE_ADDRESS']);

define("DB_HOST", $setting['DB_HOST']);
define("DB_USER_NAME", $setting['DB_USER_NAME']);
define("DB_PASSWORD", $setting['DB_PASSWORD']);
define("DB_DB_NAME", $setting['DB_DB_NAME']);
define("DB_TABLE_PREFIX", $setting['DB_TABLE_PREFIX']);

define("TABLE_POST", DB_TABLE_PREFIX . "post");
define("TABLE_ACTIVE_ITEM", DB_TABLE_PREFIX . "activeItem");
define("TABLE_USER", DB_TABLE_PREFIX . "user");
define("TABLE_USER_AUTH", DB_TABLE_PREFIX . "userAuth");
define("TABLE_USER_SESSION", DB_TABLE_PREFIX . "userSession");

define("USER_AUTH_KEY_HASH_SALT", $setting['USER_AUTH_KEY_HASH_SALT']);

define("AUTH_TYPE_NONE", 0);
define("AUTH_TYPE_PERSONA", 1);

$values = array(
	"title" => $setting['WEBSITE_TITLE']
);

unset($setting);

require_once("function.php");

$session = getSessionInfo();
$unregisteredUser = $session["userId"] == 0 && !empty($session["authKey"]);

if($unregisteredUser) {
	$uriInfo = parse_url($_SERVER["REQUEST_URI"]);
	if ($uriInfo["path"] != "/signup.php") {
		header("Location: /signup.php");
	}
}
?>
