<?php
if (!isset($_POST["action"])) {
	header("Location: /");
	exit;
}
require_once("common.php");
require_once("function.php");

$mysql = &getMysqlUtil();
$now = time();
$cookieExpires = 2592000;	// 30 days
$userId = $session["userId"];

if ($session["isNormalUser"]) {
	$result = $mysql->query("update " . TABLE_USER_SESSION . " us, " . TABLE_USER . " u set
		us.date = FROM_UNIXTIME(:now),
		u.lastActiveDate = FROM_UNIXTIME(:now)
		where us.authKey = :authKey
		and us.userId = u.id
		and u.id = :userId", array(
		":authKey" => $session["authKey"],
		":userId" => $userId,
		":now" => $now
	));
	if (!$result) exit("error: update user's active date. " . $mysql->getLastErrorMessage());
}

switch ($_POST["action"]) {
case "signinWithPersona": {
	require_once("persona.php");
	$persona = new Persona();
	$result = $persona->verifyAssertion($_POST["assertion"]);
	if ($result->status != 'okay') {
		exit("error: persona: " . $result->reason);
	}

	$authKey1 = $result->email;
	$authKey = generateAuthKey($authKey1);
	$result = $mysql->query("select userId from " . TABLE_USER_AUTH . "
		where key1 = :authKey1
		and type = :authTypePersona", array(
		":authKey1" => $authKey1,
		":authTypePersona" => AUTH_TYPE_PERSONA
	));
	if ($result) {
		$unregisteredUser = FALSE;
		$userId = $result[0]["userId"];
		$memo = "";
	}
	else {
		// new user
		$unregisteredUser = TRUE;
		$userId = 0;
		$memo = json_encode(array("authType" => AUTH_TYPE_PERSONA, "authKey1" => $authKey1));
	}

	$result = $mysql->query("insert into " . TABLE_USER_SESSION . " set
		userId = :userId,
		authKey = :authKey,
		authType = :authTypePersona,
		date = FROM_UNIXTIME(:now),
		memo = :memo", array(
		":userId" => $userId,
		":authKey" => $authKey,
		":authTypePersona" => AUTH_TYPE_PERSONA,
		":now" => $now,
		":memo" => $memo
	));
	if (!$result) {
		exit("error: " . $mysql->getLastErrorMessage());
	}

	setcookie("userId", $userId, $now + $cookieExpires);
	setcookie("authKey", base64_encode($authKey), $now + $cookieExpires);
	if($unregisteredUser) {
		header("Location: signup.php");
	}
	else {
		header("Location: /");
	}
}
break;

case "signup": {
	if($session["userId"] != 0 || empty($session["authKey"])) {
		exit("invalid session. please sign out and sign in (or sign up) again.");
	}

	$result = $mysql->query("insert into " . TABLE_USER . " set
		lastActiveDate = FROM_UNIXTIME(:now),
		isActive = 1", array(
		":now" => $now
	));
	if (!$result) exit("error: " . $mysql->getLastErrorMessage());
	$userId = $mysql->getLastInsertId();
	if (!($userId > 0)) exit("error: fail: mysql auto_increment");
	$result = $mysql->query("insert into " . TABLE_USER_AUTH . " set
		userId = :userId,
		type = :authType,
		key1 = :authKey1", array(
		":userId" => $userId,
		":authType" => $session["authType"],
		":authKey1" => $session["authKey1"]
	));
	if (!$result) exit("error: " . $mysql->getLastErrorMessage());

	$result = $mysql->query("update " . TABLE_USER_SESSION . " set
		userId = :userId,
		memo = ''
		where userId = 0
		and authKey = :authKey", array(
		":userId" => $userId,
		":authKey" => $session["authKey"]
	));
	if (!$result) exit("error: " . $mysql->getLastErrorMessage());
	setcookie("userId", $userId, $now + $cookieExpires);
	header("Location: /");
}
break;

case "markPosts": {
	$readPostBindParam = array();
	$i = 0;
	foreach ($_POST as $key => $value) {
		if (preg_match('/read_(\d+)/', $key, $matches)) {
			if (!empty($value)) {
				$readPostBindParam[":postId_$i"] = $matches[1];
			}
		}
		$i++;
	}

	if (!empty($readPostBindParam)) {
		$readPostBindString = implode(", ", array_keys($readPostBindParam));
		$sql = "update " . TABLE_ACTIVE_ITEM . " ai, " . TABLE_POST . " p set
			ai.isRead = TRUE,
			ai.updateDate = FROM_UNIXTIME(:now),
			p.lastActiveDate = FROM_UNIXTIME(:now)
			where ai.userId = :userId
			and ai.postId in ($readPostBindString)
			and ai.postId = p.id";
		$readPostBindParam[":userId"] = $userId;
		$readPostBindParam[":now"] = $now;
		$result = $mysql->query($sql, $readPostBindParam);
		if (!$result) exit("error: set item as read, " . $mysql->getLastErrorMessage());
	}

	if (!empty($_POST["ajax"])) {
		header('Content-type: application/json');
		echo '{"status": 0}';
	}
	else {
		$page = getPost("page");
		$redirectURL = "/view.php?page=$page";
		header("Location: $redirectURL");
	}
}
break;

default: {
	exit("unkown action: " . htmlspecialchars($_POST["action"]));
}
break;

}
?>
