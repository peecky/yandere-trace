import MySQLdb
import cPickle as pickle

class MySQLKeyValueStore:
	def makeConnection(self, host, userName, password, dbName):
		self._connection = MySQLdb.connect(host, userName, password, dbName)

	def setConnection(self, connection):
		self._connection = connection

	def setTableName(self, tableName):
		self._tableName = tableName

	def get(self, key):
		return self.__class__.getValue(self._connection, self._tableName, key)

	def set(self, key, value, doCommit=True):
		self.__class__.setValue(self._connection, self._tableName, key, value, doCommit)

	@classmethod
	def getValue(cls, connection, tableName, key):
		cur = connection.cursor()
		cur.execute('select value from ' + tableName + ' where `key` = %s', (key,))
		values = cur.fetchall()
		if len(values) == 0:
			return None
		return pickle.loads(values[0][0])

	@classmethod
	def setValue(cls, connection, tableName, key, value, doCommit=True):
		pickledvalue = pickle.dumps(value, pickle.HIGHEST_PROTOCOL)
		cur = connection.cursor()
		cur.execute('insert into ' + tableName + ' set `key` = %s, value = %s on duplicate key update value = %s', (key, pickledvalue, pickledvalue))
		if doCommit:
			connection.commit()
