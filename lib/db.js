'use strict';

const level = require('level');
const conf = require('./conf');

// Load this up once at startup.  Changing DB locations
// mid-process is not supported.
const path = conf.get('db') || './db';

let dbs = {};
let options = {};

// Usage: db('pin') returns the pin db
exports = module.exports = function db (key) {
  if (!dbs[key]) {
    throw new Error('Database not registered: ' + key);
  }
  return dbs[key];
};

exports.register = function (key, opt) {
  if (dbs[key]) {
    throw new Error('Database already registered: ' + key);
  }

  let dbPath = path + '/' + key;
  let db = level(dbPath, {
    createIfMissing: true,
    valueEncoding: 'json'
  });

  dbs[key] = db;
  options[key] = opt;

  return db;
};
