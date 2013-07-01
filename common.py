from defines import *
import urllib2, cookielib

def buildHTTPOpener():
	cj = cookielib.CookieJar()
	opener = urllib2.build_opener(urllib2.HTTPCookieProcessor(cj))
	opener.addheaders = [('User-Agent', USER_AGENT)]
	return opener
