<?php
require_once("common.php");
require_once("function.php");

?>
<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8" />
</head>
<body>
<?php if ($session["authType"] == AUTH_TYPE_PERSONA) printPersonaSigninModule($session);  ?>
<h2>Sign Up</h2>
<h3>Terms of Service</h3>
<p>blah blah</p>
<?php if ($unregisteredUser) { ?>
<form action="action.php" method="POST">
	<input type="hidden" name="action" value="signup" />
	<input type="submit" value="Accept" />
	<?php if ($session["authType"] == AUTH_TYPE_PERSONA) { ?>
	<a href="javascript:navigator.id.logout()">Deny</a>
	<?php } else { ?>
	<a href="/">Deny</a>
	<?php } ?>
</form>
<?php } ?>
</body>
</html>
