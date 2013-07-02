<?php
require_once("common.php");
require_once("function.php");

if ($session["isNormalUser"]) {
	$mysql = &getMysqlUtil();
	$userId = $session["userId"];

	$posts = $mysql->query("select p.id postId, p.filename, p.prefetched from " . TABLE_ACTIVE_ITEM . " ai, " . TABLE_POST . " p
		where ai.userId = :userId
		and ai.isRead = FALSE
		and ai.postId = p.id
		order by p.id", array(
		":userId" => $userId
	));
}
?>
<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8" />
<title><?= htmlspecialchars($values["title"]) ?></title>
</head>
<body id="top">
<h1><a href="/"><?= htmlspecialchars($values["title"]) ?></a></h1>

<section id="previews">
	<h2>Preview</h2>
	<ul class="thumbnail">
<?php for ($i = 0, $loops = count($posts); $i < $loops; $i++) { ?>
		<li><a href="<?= originalPostUrl($posts[$i]) ?>"><img src="<?= thumbmailPath($posts[$i]) ?>" alt="<?= $posts[$i]["postId"] ?>" /></a></li>
<?php } ?>
	</ul>
</section>
</body>
</html>
