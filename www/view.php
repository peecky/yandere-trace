<?php
require_once("common.php");
require_once("function.php");

if ($session["isNormalUser"]) {
	$mysql = &getMysqlUtil();
	$userId = $session["userId"];
	$page = getGet("page", 0);
	if (!is_numeric($page) || $page < 0) $page = 0;

	$posts = $mysql->query("select p.id postId, p.filename, p.createdDate, p.prefetched, p.memo postMemo from " . TABLE_ACTIVE_ITEM . " ai, " . TABLE_POST . " p
		where ai.userId = :userId
		and ai.isRead = FALSE
		and ai.postId = p.id
		order by p.id
		limit " . PAGING_UNIT * $page . ", " . PAGING_UNIT, array(
		":userId" => $userId
	));

	if (getGet("ajax")) {
		header('Content-type: application/json');
		echo json_encode($posts);
		exit();
	}

	// paging URL
	$urlPath = parse_url($_SERVER["REQUEST_URI"], PHP_URL_PATH);
	parse_str($_SERVER["QUERY_STRING"], $urlQuery);
	$urlQuery["page"] = ($page > 0) ? $page - 1 : 0;
	$values["pagePreview"] = $urlPath . "?" . http_build_query($urlQuery);
	$urlQuery["page"] = $page + 1;
	$values["pageNext"] = $urlPath . "?" . http_build_query($urlQuery);
	$formInputs = '<input type="hidden" name="page" value="' . $page . '" />';
}
?>
<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8" />
<title><?= htmlspecialchars($values["title"]) ?></title>
<link rel="stylesheet" href="common.css" />
<script src="//code.jquery.com/jquery-2.0.0.min.js"></script>
<script src="//code.jquery.com/jquery-migrate-1.2.1.min.js"></script><?php // required by jquery.noreferrer.js ?>
<script src="jquery.noreferrer.js"></script>
</head>
<body id="top">
<h1><a href="/"><?= htmlspecialchars($values["title"]) ?></a></h1>

<section id="previews">
	<h2>Preview</h2>
	<form method="post" action="action.php">
	<ul class="thumbnail">
<?php for ($i = 0, $loops = count($posts); $i < $loops; $i++) { ?>
		<li><span class="thumbnailImage"><img src="<?= thumbmailPath($posts[$i]) ?>" alt="<?= $posts[$i]["postId"] ?>" /></span>
			<div class="postOptions">
				<span><label><input type="checkbox" name="read_<?= $posts[$i]["postId"] ?>" checked="checked" />read</label></span>
			</div>
			<div class="postInfo">
				<a href="<?= originalPostUrl($posts[$i]) ?>" rel="noreferrer" target="_blank">See Original</a>
				<span class="date"><?= $posts[$i]["createdDate"] ?></span>
			</div>
		</li>
<?php } ?>
	</ul>
		<p><input type="submit" value="Mark" id="markPostSubmit" /> checked items as read</p>
		<input type="hidden" name="action" value="markPosts" />
		<input type="hidden" name="ajax" value="" />
		<?= $formInputs ?>
	</form>
</section>

<section id="samples">
</section>

<section id="bottom">
	<a href="<?= htmlspecialchars($values["pagePreview"]) ?>">preview</a>
	<a href="<?= htmlspecialchars($values["pageNext"]) ?>">next</a>
</section>

<script>
(function() {
var THUMBNAIL_DATA_PATH = "<?= THUMBNAIL_DATA_PATH ?>";
var ORIGINAL_SERVER_BASE_ADDRESS = "<?= ORIGINAL_SERVER_BASE_ADDRESS ?>";

function thumbmailPath(postInfo) {
	return THUMBNAIL_DATA_PATH + postInfo.filename;
}

function originalPostUrl(postInfo) {
	return ORIGINAL_SERVER_BASE_ADDRESS + "/post/show/" + postInfo.postId;
}

var postMemos = {
<?php for ($i = 0, $loops = count($posts); $i < $loops; $i++) {
	if ($i > 0) echo ",\n";

	$postMemo = $posts[$i]["postMemo"];
	if (empty($postMemo)) $postMemo = "null";
	echo $posts[$i]["postId"] . ": " . $postMemo;
} ?>
};

var requestQueue = [];
var maxRequestConcurrency = 4;
var processingRequests = 0;
var oldPostIds = [];

function processRequest() {
	if (!requestQueue.length) return;
	if (processingRequests >= maxRequestConcurrency) return;

	processingRequests++;
	var postId = requestQueue.shift();
	$('<img alt="' + postId + '" />')
		.load(function() {
			$(this).data('isLoaded', true);
			processingRequests--;
			processRequest();
		})
		.click(function() {
			$(this).animate({opacity: 0}, 'fast', function() {
				var $this = $(this);
				var position = $this.position();
				if (position.top < 0) {
					var scrollTop = $this.parent().scrollTop();
					$this.parent().scrollTop(scrollTop + position.top);
				}
				var isLoaded = $this.data('isLoaded');
				$this.remove();
				if (!isLoaded) {
					processingRequests--;
					processRequest();
				}
			});
		})
		.attr("src", 'request_bridge.php?url=' + postMemos[postId].sample_url)
		.appendTo($('#samples'));

	// remove unnessasary post memos
	if (oldPostIds.length && requestQueue.length === 0) {
		for (var i = 0, l = oldPostIds.length; i < l; ++i) {
			delete postMemos[oldPostIds[i]];
		}
		oldPostIds = [];
	}
}

function onThumbnailImageClick() {
	var postId = this.alt;
	if (!postMemos[postId] || !postMemos[postId].sample_url) {
		alert("sample url not found");
		return;
	}
	requestQueue.push(postId);
	processRequest();

	$(this).css({opacity: 0.25})
		.animate({opacity: 1}, 'slow');
}

$('#previews ul.thumbnail .thumbnailImage img').click(onThumbnailImageClick);

$('#previews form').submit(function(event) {
	event.preventDefault();

	var $this = $(this)
		.find('input[name=ajax]').val(1)
		.end()
	$.post($this.attr('action'), $this.serialize(), function(data) {
		var success = false;
		try {
			success = (data.status === 0);
		}
		catch (e) {}
		if (!success) alert(data);
		else {
			$('#previews ul.thumbnail').empty();
			if (!requestQueue.length) {
				postMemos = {};
				oldPostIds = [];
			}
			oldPostIds = oldPostIds.concat(Object.keys(postMemos));

			$.getJSON(window.location.href, {ajax: 1}, function(posts) {
				for (var i = 0; i < posts.length; ++i) {
					var postId = posts[i].postId;
					var postMemo = posts[i].postMemo;
					if (postMemo) postMemos[postId] = eval('(' + postMemo + ')');
					else postMemos[postId] = null;

					$('<li><span class="thumbnailImage"><img src="' + thumbmailPath(posts[i]) + '" alt="' + posts[i].postId + '" /></span><div class="postOptions"><span><label><input type="checkbox" name="read_' + posts[i].postId + '" checked="checked" />read</label></span></div><div class="postInfo"><a href="' + originalPostUrl(posts[i]) + '" rel="noreferrer" target="_blank">See Original</a><span class="date">' + posts[i].createdDate + '</span></div></li>')
						.appendTo('#previews ul.thumbnail')
						.find('.thumbnailImage img').click(onThumbnailImageClick)
				}
			});
		}
	});
});
})();
</script>
</body>
</html>
