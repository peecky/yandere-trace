<?php
require_once("common.php");
require_once("function.php");
?>
<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8" />
<title><?= htmlspecialchars($values["title"]) ?></title>
<link rel="stylesheet" href="persona_buttons.css" />
</head>
<body>
<?php if (!$session["isValidUser"]) { ?>
<section id="signin">
	<h2>Sign in</h2>
	<?php printPersonaSigninModule($session, TRUE); ?>
</section>
<?php } else { ?>
<section id="signout">
	<h2>Sign out</h2>
	<?php if ($session["authType"] == AUTH_TYPE_PERSONA) { printPersonaSigninModule($session, TRUE); } ?>
</section>
<?php } ?>
</body>
</html>
