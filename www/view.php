<?php
require_once("common.php");
require_once("function.php");

$posts = Array();
$formInputs = '';
$values["pageNext"] = '';
$values["pagePreview"] = '';
$page = intval(getGet("page", 0));
$pagingUnit = intval(getGet("pagingUnit", PAGING_UNIT));
if (!is_numeric($page)) $page = 0;
if ($session["isNormalUser"]) {
	$mysql = &getMysqlUtil();
	$userId = $session["userId"];

	$queryParams = array(":userId" => $userId);
	if ($page >= 0) {
		$queryParams[":isRead"] = FALSE;
		$orderBy = 'p.id';
		$limitPage = $page;
	}
	else {
		$queryParams[":isRead"] = TRUE;
		$orderBy = 'ai.updateDate desc';
		$limitPage = $page * -1 - 1;
	}
	$posts = $mysql->query("select p.id postId, p.filename, p.createdDate, p.prefetched, p.memo postMemo from " . TABLE_ACTIVE_ITEM . " ai, " . TABLE_POST . " p
		where ai.userId = :userId
		and ai.isRead = :isRead
		and ai.postId = p.id
		order by $orderBy
		limit " . $pagingUnit * $limitPage . ", " . $pagingUnit, $queryParams);

	if (getGet("ajax")) {
		header('Content-type: application/json');
		echo json_encode($posts);
		exit();
	}

	// paging URL
	$urlPath = parse_url($_SERVER["REQUEST_URI"], PHP_URL_PATH);
	parse_str($_SERVER["QUERY_STRING"], $urlQuery);
	$urlQuery["page"] = $page - 1;
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
<meta name="referrer" content="same-origin" />
<title><?= htmlspecialchars($values["title"]) ?></title>
<link rel="stylesheet" href="common.css" />
<script src="//code.jquery.com/jquery-2.2.0.min.js"></script>
</head>
<body id="top">
<h1><a href="/"><?= htmlspecialchars($values["title"]) ?></a></h1>

<section id="previews">
	<h2>Preview</h2>
	<form method="post" action="action.php">
	<label><input type="checkbox" name="autoView" />auto view</label>
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
		<p class="readAction"><input type="submit" value="Mark" id="markPostSubmit" /> checked items as read (<span class="readPages">0</span> page read)</p>
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
var page = <?= $page ?>;

function thumbmailPath(postMemo) {
	return THUMBNAIL_DATA_PATH + postMemo.filename;
}

function originalPostUrl(postMemo) {
	return ORIGINAL_SERVER_BASE_ADDRESS + "/post/show/" + postMemo.postId;
}

var postMemos = {
<?php for ($i = 0, $loops = count($posts); $i < $loops; $i++) {
	if ($i > 0) echo ",\n";

	$postMemo = $posts[$i]["postMemo"];
	if (empty($postMemo)) $postMemo = "null";
	echo $posts[$i]["postId"] . ": " . $postMemo;
} ?>
};

var needToScrollToImage = false;

function setScrollToImage($img) {
	var position = $img.position();
	if (position.top < 0) {
		var $parent = $img.parent(), scrollTop = $parent.scrollTop();
		$parent.scrollTop(scrollTop + position.top);
	}
	else if (position.left === 0) {
		$('body').scrollTop(position.top);
	}
}

var requestQueue = [];
var maxRequestConcurrency = 3;
var processingRequests = 0;
var oldPostIds = [];

function processRequest() {
	if (!requestQueue.length) {
		if (needToScrollToImage) {
			needToScrollToImage = false;
			var $img = $('#samples img:first');
			if ($img.length > 0) setScrollToImage($img);
		}
		return;
	}
	if (processingRequests >= maxRequestConcurrency) return;

	processingRequests++;
	var requestOption = requestQueue.shift();
	var postId = requestOption.postId;
	var $img = $('<img alt="' + postId + '" />')
		.load(function() {
			$(this).data('isLoaded', true);
			processingRequests--;
			processRequest();
		})
		.click(onSampleImageClick)
		.attr("src", 'request_bridge.php?url=' + postMemos[postId].sample_url.replace(/%/g, '%25'))
		.appendTo($('#samples'));
	if (requestOption.byAutoView) $img.addClass('byAutoView');

	// remove unnessasary post memos
	if (oldPostIds.length && requestQueue.length === 0) {
		for (var i = 0, l = oldPostIds.length; i < l; ++i) {
			delete postMemos[oldPostIds[i]];
		}
		oldPostIds = [];
	}
}

function onSampleImageClick() {
	var $this = $(this);
	if ($this.data('isRemoving')) return;
	$this.data('isRemoving', true);
	$this.animate({opacity: 0}, 'fast', function() {
		setScrollToImage($this);
		var isLoaded = $this.data('isLoaded');
		$this.remove();
		if (!isLoaded) {
			processingRequests--;
			processRequest();
		}
	});
}

function onThumbnailImageClick() {
	var $this = $(this);
	if ($this.css('opacity') < 0.9) return; // prevent double click
	var postId = this.alt;
	if (!postMemos[postId] || !postMemos[postId].sample_url) {
		alert("sample url not found");
		return;
	}
	var requestOption = { postId: postId };
	if ($this.data('byAutoView')) {
		requestOption.byAutoView = true;
		$this.removeData('byAutoView');
	}
	requestQueue.push(requestOption);
	processRequest();

	$this.css({opacity: 0.25})
		.animate({opacity: 1}, 'slow');
}

function autoView() {
	$('#previews ul.thumbnail .thumbnailImage img')
		.each(function() { $(this).data('byAutoView', true); })
		.each(onThumbnailImageClick);
	needToScrollToImage = true;
}

function removeAutoViewedImages() {
	$('#samples img.byAutoView').each(onSampleImageClick);
}

var $autoView = $('#previews form input[name="autoView"]').change(function(event) {
	localStorage.setItem('autoView', JSON.stringify(this.checked));
	if (this.checked) autoView();
	else removeAutoViewedImages();
});
if (JSON.parse(localStorage.getItem('autoView') || 'false')) $autoView.prop('checked', true);
if ($autoView.prop('checked')) autoView();

$('#previews ul.thumbnail .thumbnailImage img').click(onThumbnailImageClick);

$('#previews form').submit(function(event) {
	event.preventDefault();

	if (page < 0) return;	// skip already read posts

	$('#previews ul.thumbnail .thumbnailImage img').css({ opacity: 0.5 }); // let user know submit button clicked

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
			var readingPages = <?= $pagingUnit / PAGING_UNIT ?>;
			var readPages = (Number(sessionStorage.readPages) || 0) + readingPages;
			sessionStorage.readPages = readPages;
			$('#previews form .readAction .readPages').text(readPages);

			$('#previews ul.thumbnail').empty();
			if (!requestQueue.length) {
				postMemos = {};
				oldPostIds = [];
			}
			oldPostIds = oldPostIds.concat(Object.keys(postMemos));

			$.getJSON(window.location.href, {ajax: 1, pagingUnit: <?= $pagingUnit ?>}, function(posts) {
				for (var i = 0; i < posts.length; ++i) {
					var postId = posts[i].postId;
					var postMemo = posts[i].postMemo;
					if (postMemo) postMemos[postId] = JSON.parse(postMemo);
					else postMemos[postId] = null;

					$('<li><span class="thumbnailImage"><img src="' + thumbmailPath(posts[i]) + '" alt="' + posts[i].postId + '" /></span><div class="postOptions"><span><label><input type="checkbox" name="read_' + posts[i].postId + '" checked="checked" />read</label></span></div><div class="postInfo"><a href="' + originalPostUrl(posts[i]) + '" rel="noreferrer" target="_blank">See Original</a><span class="date">' + posts[i].createdDate + '</span></div></li>')
						.appendTo('#previews ul.thumbnail')
						.find('.thumbnailImage img').click(onThumbnailImageClick)
				}
				if ($autoView.prop('checked')) autoView();
			});
		}
	});
});

if (page < 0) $('#previews form .readAction').hide();
})();

$('#previews form .readAction .readPages').text(sessionStorage.readPages || 0);
</script>
</body>
</html>
