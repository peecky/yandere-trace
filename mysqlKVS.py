import MySQLdb
import cPickle as pickle

class MySQLKeyValueStore(object):
	def __init__(self, connection=None, tableName=None):
		if connection != None:
			self._connection = connection
		if tableName != None:
			self._tableName = tableName

	def makeConnection(self, host, userName, password, dbName):
		self._connection = MySQLdb.connect(host, userName, password, dbName)

	@property
	def connection(self):
		return self._connection

	@connection.setter
	def connection(self, value):
		self._connection = value

	@property
	def tableName(self):
		return self._tableName

	@tableName.setter
	def tableName(self, value):
		self._tableName = value

	def get(self, key, defalutValue=None):
		return self.__class__.getValue(self._connection, self._tableName, key, defalutValue)

	def set(self, key, value, doCommit=True):
		self.__class__.setValue(self._connection, self._tableName, key, value, doCommit)

	@staticmethod
	def getValue(connection, tableName, key, defalutValue=None):
		cur = connection.cursor()
		cur.execute('select value from ' + tableName + ' where `key` = %s', (key,))
		values = cur.fetchall()
		if len(values) == 0:
			return defalutValue
		return pickle.loads(values[0][0])

	@staticmethod
	def setValue(connection, tableName, key, value, doCommit=True):
		pickledvalue = pickle.dumps(value, pickle.HIGHEST_PROTOCOL)
		cur = connection.cursor()
		cur.execute('insert into ' + tableName + ' set `key` = %s, value = %s on duplicate key update value = %s', (key, pickledvalue, pickledvalue))
		if doCommit:
			connection.commit()

def getInstance(connection=None, tableName=None):
	return MySQLKeyValueStore(connection, tableName)
