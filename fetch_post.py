#!/usr/bin/python
# -*- coding: utf-8 -*-

from defines import *
from common import *
import MySQLdb
import cPickle as pickle
import datetime
import os

def executeJob():
	now = datetime.datetime.now()
	con = MySQLdb.connect(DB_HOST, DB_USER_NAME, DB_PASSWORD, DB_DB_NAME)
	cur = con.cursor()
	opener = buildHTTPOpener()

	cur.execute('select postId, postInfo from ' + TABLE_PREFETCHING_QUEUE  + ' order by addedDate, postId limit 8')
	for row in cur.fetchall():
		postId = row[0]
		postInfo = pickle.loads(row[1])
		filename = postInfo['md5']
		createdDate = datetime.datetime.fromtimestamp(int(postInfo['created_at']))

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
		con.commit()

if __name__ == '__main__':
	executeJob()
