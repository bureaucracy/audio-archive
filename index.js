'use strict';

const Hapi = require('hapi');
const Boom = require('boom');
const Joi = require('joi');
const http = require('http');
const cookie = require('cookie');

const conf = require('./lib/conf');

const authenticate = require('./lib/authenticate');
const services = require('./lib/services');
const posts = require('./lib/posts');

const server = new Hapi.Server();

server.connection({
  host: conf.get('domain'),
  port: conf.get('port')
});

server.views({
  engines: {
    jade: require('jade')
  },
  isCached: process.env.node === 'production',
  path: __dirname + '/views',
  compileOptions: {
    pretty: true
  }
});

server.ext('onPreResponse', function (request, reply) {
  let response = request.response;
  if (!response.isBoom) {
    if (['/dashboard', '/post'].indexOf(request.path) > -1) {
      if (!request.auth.isAuthenticated) {
        return reply.redirect('/');
      }
    }

    return reply.continue();
  }

  let error = response;
  let ctx = {};

  let message = error.output.payload.message;
  let statusCode = error.output.statusCode || 500;
  ctx.code = statusCode;
  ctx.httpMessage = http.STATUS_CODES[statusCode].toLowerCase();

  switch (statusCode) {
    case 404:
      ctx.reason = 'page not found';
      break;
    case 403:
      ctx.reason = 'forbidden';
      break;
    case 500:
      ctx.reason = 'something went wrong';
      break;
    default:
      break;
  }

  if (process.env.npm_lifecycle_event === 'dev') {
    console.log(error.stack || error);
  }

  if (ctx.reason) {
    // Use actual message if supplied
    ctx.reason = message || ctx.reason;
    return reply.view('error', ctx).code(statusCode);
  } else {
    ctx.reason = message.replace(/\s/gi, '+');
    reply.redirect(request.path + '?err=' + ctx.reason);
  }
});

server.register({
  register: require('crumb')
}, function (err) {
  if (err) {
    throw err;
  }
});

let options = {
  cookieOptions: {
    password: conf.get('cookie'),
    isSecure: false,
    clearInvalid: true
  }
};

server.register([
  {
    register: require('hapi-cache-buster'),
    options: new Date().getTime().toString()
  }
], function (err) { });

let auth = {
  mode: 'try',
  strategy: 'session'
};

server.register(require('hapi-auth-cookie'), function (err) {
  if (err) {
    throw err;
  }

  server.auth.strategy('session', 'cookie', {
    password: conf.get('password'),
    ttl: conf.get('session-ttl'),
    cookie: conf.get('cookie'),
    keepAlive: true,
    isSecure: false
  });
});

let routes = [
  {
    method: 'GET',
    path: '/',
    handler: services.home,
    config: {
      auth: auth
    }
  },
  {
    method: 'GET',
    path: '/signup',
    handler: services.join
  },
  {
    method: 'GET',
    path: '/password/forgot',
    handler: services.forgotPassword
  },
  {
    method: 'GET',
    path: '/password/reset',
    handler: services.resetPassword
  },
  {
    method: 'POST',
    path: '/password/forgot',
    handler: authenticate.forgotPassword
  },
  {
    method: 'POST',
    path: '/password/reset',
    handler: authenticate.resetPassword
  },
  {
    method: 'POST',
    path: '/signup',
    config: {
      handler: authenticate.signup,
      validate: {
        payload: {
          email: Joi.string().email(),
          password: Joi.string().min(6).required()
        }
      }
    }
  },
  {
    method: 'GET',
    path: '/dashboard',
    handler: services.dashboard,
    config: {
      auth: auth
    }
  },
  {
    method: 'GET',
    path: '/login',
    handler: services.home
  },
  {
    method: 'POST',
    path: '/login',
    config: {
      handler: authenticate.login,
      auth: auth,
      plugins: {
        'hapi-auth-cookie': {
          redirectTo: false
        }
      },
      validate: {
        payload: {
          email: Joi.string().email(),
          password: Joi.string().min(6).required()
        }
      }
    }
  },
  {
    method: 'GET',
    path: '/post',
    handler: posts.new,
    config: {
      auth: auth
    }
  },
  {
    method: 'POST',
    path: '/post',
    config: {
      handler: posts.add,
      auth: auth,
      validate: {
        payload: {
          title: Joi.string().required(),
          artist: Joi.string().required(),
          tracklisting: Joi.string(),
          notes: Joi.string()
        }
      }
    }
  },
  {
    method: 'GET',
    path: '/post/{pid}',
    config: {
      auth: auth
    },
    handler: services.get
  },
  {
    method: 'GET',
    path: '/post/edit/{pid}',
    config: {
      auth: auth
    },
    handler: services.edit
  },
  {
    method: 'POST',
    path: '/post/edit/{pid}',
    config: {
      auth: auth
    },
    handler: posts.update
  },
  {
    method: 'POST',
    path: '/post/delete/{pid}',
    config: {
      auth: auth
    },
    handler: services.deletePost
  },
  {
    method: 'GET',
    path: '/logout',
    config: {
      auth: auth
    },
    handler: authenticate.logout
  }
];

server.route(routes);

server.route({
  path: '/{p*}',
  method: 'GET',
  handler: {
    directory: {
      path: './public',
      listing: false,
      index: false
    }
  }
});

server.start(function (err) {
  if (err) {
    console.error(err.message);
    process.exit(1);
  }
});

exports.getServer = function () {
  return server;
};
