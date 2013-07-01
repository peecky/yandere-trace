#!/usr/bin/python
# -*- coding: utf-8 -*-

from defines import *
from common import *
import MySQLdb
import cPickle as pickle
import mysqlKVS
import xml.etree.ElementTree as ElementTree
import datetime

def buildRequestURL(limit, page=1):
	return '%s/post.xml?limit=%d&page=%d' % (SERVER_BASE_ADDRESS, limit, page)

def executeJob():
	now = datetime.datetime.now()
	con = MySQLdb.connect(DB_HOST, DB_USER_NAME, DB_PASSWORD, DB_DB_NAME)
	cur = con.cursor()
	kvs = mysqlKVS.getInstance(con, TABLE_KEY_VALUE_STORE)
	opener = buildHTTPOpener()

	fetchInfo = kvs.get('fetchInfo')
	if fetchInfo == None:
		"first time to run"
		url = buildRequestURL(1, 1)	# start from the first post
		r = opener.open(url)
		xmlStr = r.read()
		root = ElementTree.fromstring(xmlStr)
		lastFetchedPostId = int(root[0].attrib['id'])
	else:
		lastFetchedPostId = fetchInfo['lastPostId']

	lastPostId = lastFetchedPostId
	page = 1
	noMorePosts = False
	while not noMorePosts:
		url = '%s/post.xml?limit=%d&page=%d' % (SERVER_BASE_ADDRESS, 35, page)
		r = opener.open(url)
		xmlStr = r.read()
		root = ElementTree.fromstring(xmlStr)
		for i in range(0, len(root)):
			postInfo = root[i].attrib
			postId = int(postInfo['id'])
			if postId <= lastFetchedPostId:
				noMorePosts = True
				break
			if postId > lastPostId:
				lastPostId = postId
			"add to the prefetching queue"
			cur.execute('insert into ' + TABLE_PREFETCHING_QUEUE + ' set postInfo = %s, addedDate = %s', (pickle.dumps(postInfo, PICKLE_PROTOCOL), now))
		page += 1
	con.commit()
	kvs.set('fetchInfo', fetchInfo)

if __name__ == '__main__':
	executeJob()