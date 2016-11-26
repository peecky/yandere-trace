<?php
require_once("common.php");
require_once("function.php");

if ($session["isNormalUser"]) {
	$mysql = &getMysqlUtil();

	$result = $mysql->query("select count(*) count_ from " . TABLE_ACTIVE_ITEM . "
		where userId = :userId
		and isRead = FALSE", array(
		":userId" => $session["userId"]
	));
	$values["newPostsCount"] = $result[0]["count_"];
}
?>
<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8" />
<title><?= htmlspecialchars($values["title"]) ?></title>
<link rel="stylesheet" href="persona_buttons.css" />
</head>
<body>
<h1><a href="/"><?= htmlspecialchars($values["title"]) ?></a></h1>
<?php if (!$session["isValidUser"]) { ?>
<section id="signin">
	<h2>Sign in</h2>
	<?php printPersonaSigninModule($session, TRUE); ?>
	<form action="action.php" method="POST">
		<input type="hidden" name="action" value="signinWithPassword" />
		<label>User Id: <input type="text" name="userId" /></label>
		<label>Password: <input type="password" name="password" /></label>
		<input type="submit" />
	</form>
</section>
<?php } else { ?>
<section id="userInfo">
	<h2>User Info.</h2>
	<form action="action.php" method="POST">
		<h3>Set password</h3>
		<input type="hidden" name="action" value="setPassword" />
		<label>User Id: <input type="text" name="userId" value="<?= $session["userId"] ?>" disabled="disabled" /></label>
		<label>Password: <input type="password" name="password" /></label>
		<input type="submit" />
	</form>
</section>
<section id="signout">
	<h2>Sign out</h2>
	<?php if ($session["authType"] == AUTH_TYPE_PERSONA) { printPersonaSigninModule($session, TRUE); } ?>
	<?php if ($session["authType"] == AUTH_TYPE_PASSWORD) { ?>
		<a href="logout.php">sign out</a>
	<?php } ?>
</section>
	<?php if ($session["isNormalUser"]) { ?>
<section>
	<h2>Subscriptions</h2>
	<p><a href="view.php"><?= $values["newPostsCount"] ?> new posts</a></p>
</section>
	<?php } ?>
<?php } ?>
</body>
</html>
