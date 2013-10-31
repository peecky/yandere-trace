#!/usr/bin/python
# -*- coding: utf-8 -*-

from defines import *
from common import *
import MySQLdb
import cPickle as pickle
import datetime
import os
import json
import urllib2

def executeJob():
	now = datetime.datetime.now()
	con = MySQLdb.connect(DB_HOST, DB_USER_NAME, DB_PASSWORD, DB_DB_NAME)
	cur = con.cursor()
	opener = buildHTTPOpener()

	cur.execute('select postId, postInfo, memo, addedDate from ' + TABLE_PREFETCHING_QUEUE  + ' where addedDate <= %s order by addedDate, postId limit 8', (now, ))
	for row in cur.fetchall():
		errorReasons = []
		postId = row[0]
		postInfo = pickle.loads(row[1])
		try:
			memo = json.loads(row[2])
		except ValueError, e:
			memo = {}
		if not memo.has_key('retry'):
			memo['retry'] = 0
		addedDate = row[3]
		filename = postInfo['md5']
		createdDate = datetime.datetime.fromtimestamp(int(postInfo['created_at']))

		try:
			# download thumbnail image
			thumbnailUrl = postInfo['preview_url']
			localPath = THUMBNAIL_DATA_PATH + filename
			if not os.path.isfile(localPath) or os.path.getsize(localPath) == 0:
				r = robustHTTPRequest(opener, thumbnailUrl)
				buffer_ =  r.read()
				downloadingFile = open(localPath, 'wb')
				downloadingFile.write(buffer_)
				downloadingFile.close()

			# update DataBase
			cur.execute('insert into ' + TABLE_POST + ''' set
				id = %s, filename = %s, createdDate = %s, prefetched = %s, lastActiveDate = %s
				on duplicate key update
				filename = %s, createdDate = %s, prefetched = %s, lastActiveDate = %s''',
				(postId, filename, createdDate, True, now, filename, createdDate, True, now))
			cur.execute('insert into ' + TABLE_ACTIVE_ITEM + ''' (userId, postId, isRead, updateDate)
					(select id, %s, FALSE, %s
					from ''' + TABLE_USER + '''
					where isActive = TRUE)
				on duplicate key update
				postId = %s''',
				(postId, now, postId))
			cur.execute('delete from ' + TABLE_PREFETCHING_QUEUE + ' where postId = %s', (postId, ))
		except urllib2.HTTPError, e:
			errorReasons.append('HTTP error %d %s %s' % (e.code, e.msg, e.url))
			memo['errorReasons'] = errorReasons
			if memo['retry'] < FETCH_POST_MAX_RETRY:
				memo['retry'] += 1
				lowPriority = addedDate + datetime.timedelta(hours=1)
				cur.execute('update ' + TABLE_PREFETCHING_QUEUE + ' set addedDate = %s, memo = %s where postId = %s', (lowPriority, json.dumps(memo), postId))
			else:
				logging.debug('error while fetching the post %d %s' % (postId, str(memo)))
				cur.execute('delete from ' + TABLE_PREFETCHING_QUEUE + ' where postId = %s', (postId, ))
		con.commit()

if __name__ == '__main__':
	executeJob()
