from defines import *
from common import *
import MySQLdb
import datetime

def executeJob():
	now = datetime.datetime.now()
	inactiveDate = now - datetime.timedelta(days=30)

	con = MySQLdb.connect(DB_HOST, DB_USER_NAME, DB_PASSWORD, DB_DB_NAME)
	cur = con.cursor()

	cur.execute('delete from ' + TABLE_USER_SESSION + ' where date < %s', (inactiveDate,))
	con.commit()

if __name__ == '__main__':
	executeJob()
