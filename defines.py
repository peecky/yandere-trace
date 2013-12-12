import ConfigParser
import os
import cPickle as pickle

BASE_PATH = os.path.dirname(os.path.abspath(__file__)) + '/'

config = ConfigParser.SafeConfigParser({
	'FETCH_POST': '3',
	'ENQUEUE_POSTS': '176',
	'DELETE_OLD_DATA': '1500',
	'CLEAN_INACTIVE_SESSION': '3000',
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
TABLE_USER = DB_TABLE_PREFIX + "user"
TABLE_USER_AUTH = DB_TABLE_PREFIX + "userAuth"
TABLE_USER_SESSION = DB_TABLE_PREFIX + "userSession"
TABLE_ACTIVE_ITEM = DB_TABLE_PREFIX + "activeItem"

FETCH_POST_DURATION = config.getint('background_job_duration', 'FETCH_POST')
ENQUEUE_POSTS_DURATION = config.getint('background_job_duration', 'ENQUEUE_POSTS')
DELETE_OLD_DATA_DURATION = config.getint('background_job_duration', 'DELETE_OLD_DATA')
CLEAN_INACTIVE_SESSION_DURATION = config.getint('background_job_duration', 'CLEAN_INACTIVE_SESSION')

FETCH_POST_MAX_RETRY = 5

PICKLE_PROTOCOL = max(2, pickle.HIGHEST_PROTOCOL)
