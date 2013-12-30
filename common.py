from defines import *
import urllib2, cookielib
import time
import logging
import httplib
import socket
import errno

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
