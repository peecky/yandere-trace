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

	cur.execute('select postInfo from ' +TABLE_PREFETCHING_QUEUE  + ' order by addedDate limit 8')
	for row in cur.fetchall():
		postInfo = pickle.loads(row[0])
		postId = int(postInfo['id'])
		filename = postInfo['md5']

		# download thumbnail image
		thumbnailUrl = postInfo['preview_url']
		localPath = THUMBNAIL_DATA_PATH + filename
		if not os.path.isfile(localPath) or os.path.getsize(localPath) == 0:
			r = opener.open(thumbnailUrl)
			buffer_ =  r.read()
			downloadingFile = open(localPath, 'wb')
			downloadingFile.write(buffer_)
			downloadingFile.close()

		# update DataBase
		cur.execute('insert into ' + TABLE_POST + ''' set
			id = %s, filename = %s, prefetched = %s, lastActiveDate = %s
			on duplicate key update
			filename = %s, prefetched = %s, lastActiveDate = %s''',
			(postId, filename, True, now, filename, True, now))
		cur.execute('insert into ' + TABLE_ACTIVE_ITEM + ''' (userId, postId, isRead, updateDate)
				(select id, %s, FALSE, %s
				from ''' + TABLE_USER + '''
				where isActive = TRUE)
			on duplicate key update
			postId = %s''',
			(postId, now, postId))
		con.commit()

if __name__ == '__main__':
	executeJob()
