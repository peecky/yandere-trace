<?php
require_once("common.php");

function generateAuthKey($userAuthKeyOrSomething) {
	$input = USER_AUTH_KEY_HASH_SALT . time() . $userAuthKeyOrSomething;
	return sha1($input, TRUE);
}

function &getMysqlUtil() {
	static $mysql = FALSE;
	if (!$mysql) {
		require_once(WWW_LIB_PATH . "database/mysqlutil.php");
		$mysql = new MysqlUtil(array(
			"server_address" => DB_HOST,
			"user_name" => DB_USER_NAME,
			"user_password" => DB_PASSWORD,
			"db_name" => DB_DB_NAME
		));
	}
	return $mysql;
}

function getSessionInfo($cookie = FALSE) {
	if($cookie === FALSE) $cookie = &$_COOKIE;
	$userId = getInput($cookie, "userId", -1);
	$authKey = getInput($cookie, "authKey", "");
	$ret = FALSE;

	if($userId >= 0 && !empty($authKey)) {
		$mysql = &getMysqlUtil();
		$result = $mysql->query("select s.userId, s.authKey, s.authType, s.memo, a.key1 authKey1 from " . TABLE_USER_SESSION . " s
			left join " . TABLE_USER_AUTH . " a
				on s.userId = a.userId
				and s.authType = a.type
			where s.userId = :userId
			and s.authKey = :authKey", array(
			":userId" => $userId,
			":authKey" => base64_decode($authKey, TRUE)
		));
		if($result) {
			$ret = $result[0];
			$memo = json_decode($result[0]["memo"], TRUE);
			if (empty($ret["authKey1"]) && !empty($memo["authKey1"])) {
				$ret["authKey1"] = $memo["authKey1"];
			}
			//$ret["memo"] = json_decode($result[0]["memo"], TRUE);
			$ret["isValidUser"] = TRUE;
			$ret["isNormalUser"] = ($ret["userId"] > 0);
			$ret["isAdmin"] = ($ret["userId"] == 1);
		}
		else {
			// invalid (or expired) authKey
			$userId = -1;
			$authKey = "";
		}
	}

	return $ret ? $ret : array(
		"userId" => $userId,
		"authKey" => $authKey,
		"authKey1" => "",
		"authType" => AUTH_TYPE_NONE,
		//"memo" => array(),
		"isValidUser" => FALSE,
		"isNormalUser" => FALSE,
		"isAdmin" => FALSE
	);
}

function getInput(&$inputs, $key, $defaultValue = FALSE) {
	return isset($inputs[$key]) ? $inputs[$key] : $defaultValue;
}

function getPost($key, $defaultValue = FALSE) {
	return getInput($_POST, $key, $defaultValue);
}

function getGet($key, $defaultValue = FALSE) {
	return getInput($_GET, $key, $defaultValue);
}

function printPersonaSigninModule(&$session, $lazyLoading = FALSE) { ?>
<script>
function afterLoadPersonaJS() {
	navigator.id.watch({
		loggedInUser: <?= !empty($session["authKey1"]) ? "'" . addcslashes($session['authKey1'], "'") . "'" : 'null' ?>,
		onlogin: function (assertion) {
			var assertionField = document.getElementById("personaAssertionField");
			assertionField.value = assertion;
			var loginForm = document.getElementById("personaLoginForm");
			loginForm.submit()
		},
		onlogout: function () {
			window.location = 'logout.php';
		}
	});
}
</script>
<?php if ($lazyLoading) { ?>
<script>
window.addEventListener('DOMContentLoaded', function() {
	var personaJs = document.createElement("script");
	personaJs.onreadystatechange = afterLoadPersonaJS;
	personaJs.onload = afterLoadPersonaJS;
	personaJs.type = "text/javascript";
	personaJs.src = "https://login.persona.org/include.js";
	document.body.appendChild(personaJs);
});
</script>
<?php } else { ?>
<script src="https://login.persona.org/include.js"></script>
<script>afterLoadPersonaJS();</script>
<?php }
	if (!$session["isValidUser"]) { ?>
	<form id="personaLoginForm" method="POST" action="action.php">
		<input type="hidden" name="action" value="signinWithPersona" />
		<input id="personaAssertionField" type="hidden" name="assertion" value="" />
	</form>
	<a href="javascript:navigator.id.request()" class="persona-button dark"><span>Sign in with your Email</span></a>
<?php } else { ?>
	<a href="javascript:navigator.id.logout()">sign out</a>
<?php }
}

function thumbmailPath($postInfo) {
	return THUMBNAIL_DATA_PATH . $postInfo["filename"];
}

function originalPostUrl($postInfo) {
	return ORIGINAL_SERVER_BASE_ADDRESS . "/post/show/" . $postInfo["postId"];
}
?>
