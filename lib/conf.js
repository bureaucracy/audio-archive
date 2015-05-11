// Put this in a module so that it's only ever done one time.
// Otherwise, settings get overwritten each time, making testing
// harder.
const nconf = require('nconf');

nconf.argv().env().file({ file: 'local.json' });

nconf.defaults({
  port: 3000,
  cookie: 'secret'
});

module.exports = nconf;
