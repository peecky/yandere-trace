from defines import *
import urllib2, cookielib
import time
import logging
import httplib
import socket
import errno
import sqlite3

# http://stackoverflow.com/questions/23683886/python-how-to-successfully-inherit-sqlite3-cursor-and-add-my-customized-method
class MySQLiteConnection(sqlite3.Connection):
    def cursor(self):
        return super(MySQLiteConnection, self).cursor(MySQLiteCursor)

class MySQLiteCursor(sqlite3.Cursor):
    def execute(self, sql, parameters=()):
        sql = sql.replace('%s', '?')

#        if parameters is None:
#            return super(MySQLiteCursor, self).execute(sql)
#        else:
        return super(MySQLiteCursor, self).execute(sql, parameters)

def getDBConnection():
    if getDBConnection.con is None:
        if DB_ENGINE.lower() == 'mysql':
            import MySQLdb
            getDBConnection.con = MySQLdb.connect(DB_HOST, DB_USER_NAME, DB_PASSWORD, DB_DB_NAME)
        else:
            getDBConnection.con = sqlite3.connect(DB_FILE_PATH, detect_types=sqlite3.PARSE_DECLTYPES, factory=MySQLiteConnection)
    return getDBConnection.con
getDBConnection.con = None

def buildHTTPOpener():
	cj = cookielib.CookieJar()
	opener = urllib2.build_opener(urllib2.HTTPCookieProcessor(cj))
	opener.addheaders = [('User-Agent', USER_AGENT)]
	return opener

def robustHTTPRequest(opener, url):
	MAX_RETRY = 6
	retry = 0
	lastException = None
	while (retry < MAX_RETRY):
		try:
			return opener.open(url)
		except httplib.BadStatusLine, e:
			lastException = e
			time.sleep(1 + retry * 2)
			retry += 1
		except socket.error, e:
			lastException = e
			time.sleep(1 + retry * 2)
			retry += 1
		except urllib2.HTTPError, e:
			lastException = e
			raise e
		except urllib2.URLError, e:
			lastException = e
			if (hasattr(e.reason, 'errno') and
				(e.reason.errno == errno.ECONNREFUSED	# Connection refused
				or e.reason.errno == errno.ENETUNREACH)):	# Network is unreachable
				time.sleep(30 * (retry+1))
				retry += 1
			else:
				# unpredicted errors
				raise e
	logging.debug('Too many retry on robustHTTPRequest with the URL: %s' % (url,))
	if lastException != None:
		raise lastException
	return False

def getLastActiveDateOfUsers(cur):
	cur.execute('select max(lastActiveDate) from ' + TABLE_USER)
	row = cur.fetchone()
	return row[0]

logging.basicConfig(level=logging.DEBUG, format='[%(asctime)s] {%(levelname)s} %(message)s')
