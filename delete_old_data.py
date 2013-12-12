from defines import *
from common import *
import MySQLdb
import datetime
import os

def executeJob():
	now = datetime.datetime.now()
	fileLimitDate = now - datetime.timedelta(days=100)
	postLimitDate = now - datetime.timedelta(days=365)
	fileDeletionLimit = 100

	con = MySQLdb.connect(DB_HOST, DB_USER_NAME, DB_PASSWORD, DB_DB_NAME)
	cur = con.cursor()

	postIdsToDeleteFile = []
	cur.execute('select id, filename from ' + TABLE_POST + ' where prefetched = TRUE and lastActiveDate < %s limit %s', (fileLimitDate, fileDeletionLimit))
	for row in cur.fetchall():
		postIdsToDeleteFile.append(row[0])
		localPath = THUMBNAIL_DATA_PATH + row[1]
		if os.path.isfile(localPath):
			os.unlink(localPath)
	if len(postIdsToDeleteFile) > 0:
		placeholders = ', '.join('%s' for unused in postIdsToDeleteFile)
		cur.execute('update ' + TABLE_POST + ' set prefetched = FALSE where id in (' + placeholders + ')', postIdsToDeleteFile)
		con.commit()

	postIdsToDeleteTableRow = []
	cur.execute('select id from ' + TABLE_POST + ' where prefetched = FALSE and lastActiveDate < %s', (postLimitDate, ))
	for row in cur.fetchall():
		postIdsToDeleteTableRow.append(row[0])
	if len(postIdsToDeleteTableRow) > 0:
		placeholders = ', '.join('%s' for unused in postIdsToDeleteTableRow)
		cur.execute('delete from ' + TABLE_POST + ' where id in (' + placeholders + ')', postIdsToDeleteTableRow)
		cur.execute('delete from ' + TABLE_ACTIVE_ITEM + ' where postId in (' + placeholders + ')', postIdsToDeleteTableRow)
		con.commit()

if __name__ == '__main__':
	executeJob()
