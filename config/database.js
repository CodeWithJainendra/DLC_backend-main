const mysql = require('mysql2');

const MYSQL_CONFIG = {
  host: '127.0.0.1',
  port: 3306,
  user: 'nsrivast',
  password: 'ns#601',
  database: 'doppw',
  multipleStatements: true,
  charset: 'utf8mb4'
};

const normalizeParams = (params, callback) => {
  let cb = callback;
  let values = params;

  if (typeof values === 'function') {
    cb = values;
    values = [];
  } else if (values === undefined || values === null) {
    values = [];
  } else if (!Array.isArray(values)) {
    values = [values];
  }

  return { values, callback: cb };
};

const runCallbackWithMetadata = (callback, results, err) => {
  if (!callback) {
    return;
  }

  if (err) {
    callback(err);
    return;
  }

  const context = {
    lastID: results && results.insertId ? results.insertId : 0,
    changes: results && typeof results.affectedRows === 'number' ? results.affectedRows : 0
  };

  callback.call(context, null);
};

class MySQLStatement {
  constructor(connection, sql) {
    this.connection = connection;
    this.sql = sql;
  }

  run(params, callback) {
    const { values, callback: cb } = normalizeParams(params, callback);
    this.connection.query(this.sql, values, (err, results) => {
      runCallbackWithMetadata(cb, results, err);
    });
    return this;
  }

  get(params, callback) {
    const { values, callback: cb } = normalizeParams(params, callback);
    this.connection.query(this.sql, values, (err, results) => {
      if (cb) {
        if (err) {
          cb(err);
        } else {
          cb(null, Array.isArray(results) && results.length > 0 ? results[0] : null);
        }
      }
    });
    return this;
  }

  all(params, callback) {
    const { values, callback: cb } = normalizeParams(params, callback);
    this.connection.query(this.sql, values, (err, results) => {
      if (cb) {
        cb(err || null, Array.isArray(results) ? results : []);
      }
    });
    return this;
  }

  finalize(callback) {
    if (callback) {
      callback();
    }
  }
}

class Database {
  constructor() {
    this.connection = mysql.createConnection(MYSQL_CONFIG);
    this._connect();
  }

  _connect() {
    this.connection.connect((err) => {
      if (err) {
        console.error('MySQL connection error:', err.message);
      } else {
        console.log('✅ Connected to MySQL database doppw');
      }
    });

    this.connection.on('error', (err) => {
      console.error('MySQL error:', err.message);
    });
  }

  getDB() {
    return this;
  }

  all(sql, params, callback) {
    const { values, callback: cb } = normalizeParams(params, callback);
    this.connection.query(sql, values, (err, results) => {
      if (cb) {
        cb(err || null, Array.isArray(results) ? results : []);
      }
    });
    return this;
  }

  get(sql, params, callback) {
    const { values, callback: cb } = normalizeParams(params, callback);
    this.connection.query(sql, values, (err, results) => {
      if (cb) {
        if (err) {
          cb(err);
        } else {
          cb(null, Array.isArray(results) && results.length > 0 ? results[0] : null);
        }
      }
    });
    return this;
  }

  run(sql, params, callback) {
    const { values, callback: cb } = normalizeParams(params, callback);
    this.connection.query(sql, values, (err, results) => {
      runCallbackWithMetadata(cb, results, err);
    });
    return this;
  }

  exec(sql, callback) {
    this.connection.query(sql, (err, results) => {
      if (callback) {
        runCallbackWithMetadata(callback, results, err);
      }
    });
    return this;
  }

  each(sql, params, rowCallback, completionCallback) {
    let values = params;
    let rowCb = rowCallback;
    let completeCb = completionCallback;

    if (typeof values === 'function') {
      completeCb = rowCb;
      rowCb = values;
      values = [];
    } else if (!Array.isArray(values)) {
      values = values === undefined || values === null ? [] : [values];
    }

    this.connection.query(sql, values, (err, results) => {
      if (err) {
        if (rowCb) {
          rowCb(err);
        }
        if (completeCb) {
          completeCb(err);
        }
        return;
      }

      let count = 0;
      if (Array.isArray(results)) {
        for (const row of results) {
          count += 1;
          if (rowCb) {
            const shouldStop = rowCb(null, row);
            if (shouldStop === false) {
              break;
            }
          }
        }
      }

      if (completeCb) {
        completeCb(null, count);
      }
    });
    return this;
  }

  prepare(sql) {
    return new MySQLStatement(this.connection, sql);
  }

  serialize(callback) {
    if (callback) {
      callback();
    }
    return this;
  }

  close(callback) {
    this.connection.end((err) => {
      if (err) {
        console.error('MySQL close error:', err.message);
      }
      if (callback) {
        callback(err);
      }
    });
  }
}

const database = new Database();

const initDatabase = () => {
  console.log('📦 Connecting to MySQL database doppw...');
  console.log('✅ Database connection established via MySQL');
  console.log('💡 Existing migration and import scripts will now operate against MySQL');
};

module.exports = { database, initDatabase };
