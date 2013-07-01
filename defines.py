import ConfigParser
import os
import cPickle as pickle

BASE_PATH = os.path.dirname(os.path.abspath(__file__)) + '/'

config = ConfigParser.SafeConfigParser({
	'FETCH_POST': '3',
	'ENQUEUE_POSTS': '180',
	'DELETE_OLD_FILES': '4',
})
config.read(BASE_PATH + 'config.ini')

SERVER_BASE_ADDRESS = config.get('server', 'SERVER_BASE_ADDRESS')
USER_AGENT = 'Opera/9.80 (X11; Linux i686) Presto/2.12.388 Version/12.15'

WWW_DATA_PATH = BASE_PATH + config.get('local_path', 'WWW_PATH') + config.get('local_path', 'WWW_DATA_PATH')
if WWW_DATA_PATH[-1] != '/':
	WWW_DATA_PATH += '/'

DB_HOST = config.get('database', 'DB_HOST')
DB_USER_NAME = config.get('database', 'DB_USER_NAME')
DB_PASSWORD = config.get('database', 'DB_PASSWORD')
DB_DB_NAME = config.get('database', 'DB_DB_NAME')
DB_TABLE_PREFIX = config.get('database', 'DB_TABLE_PREFIX')

IMAGE_DATA_PATH = WWW_DATA_PATH
THUMBNAIL_DATA_PATH = IMAGE_DATA_PATH + 'thumbnail/'

# database
TABLE_PREFETCHING_QUEUE = DB_TABLE_PREFIX + "prefetchingQueue"
TABLE_POST = DB_TABLE_PREFIX + "post"
TABLE_BACKGROUND_JOBS = DB_TABLE_PREFIX + "backgroundJob"
TABLE_KEY_VALUE_STORE = DB_TABLE_PREFIX + "keyValueStore"

FETCH_POST_DURATION = config.getint('background_job_duration', 'FETCH_POST')
ENQUEUE_POSTS_DURATION = config.getint('background_job_duration', 'ENQUEUE_POSTS')
DELETE_OLD_FILES_DURATION = config.getint('background_job_duration', 'DELETE_OLD_FILES')

FETCH_POST_MAX_RETRY = 5

PICKLE_PROTOCOL = max(2, pickle.HIGHEST_PROTOCOL)
