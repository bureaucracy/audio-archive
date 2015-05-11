'use strict';

const conf = require('./conf');
const Boom = require('boom');

const posts = require('./posts');

let ctx = {
  analytics: conf.get('analytics')
};

exports.home = function (request, reply) {
  ctx.error = request.query.err || '';
  ctx.session = request.auth.isAuthenticated || false;

  posts.feed(function (err, postItems) {
    if (err) {
      return reply(Boom.wrap(err, 400));
    }

    ctx.posts = postItems;

    reply.view('index', ctx);
  });
};

exports.join = function (request, reply) {
  ctx.error = request.query.err || '';
  ctx.email = request.query.email || '';
  reply.view('join', ctx);
};

exports.dashboard = function (request, reply) {
  ctx.error = request.query.err || '';
  ctx.session = request.auth.isAuthenticated || false;

  posts.latest(request, function (err, postItems) {
    if (err) {
      return reply(Boom.wrap(err, 400));
    }

    ctx.posts = postItems;

    reply.view('dashboard', ctx);
  });
};

exports.deletePost = function (request, reply) {
  let key = request.params.pid.split('!');

  posts.del(request.auth.credentials.uid, key[0], key[1], function (err) {
    if (err) {
      return reply(Boom.wrap(err, 400));
    }

    reply.redirect('/dashboard');
  });
};

exports.edit = function (request, reply) {
  ctx.session = request.auth.isAuthenticated || false;
  ctx.error = request.query.err || '';
  posts.get(request.params.pid, function (err, post) {
    if (err) {
      return reply(Boom.wrap(err, 404));
    }

    ctx.post = post;

    reply.view('edit', ctx);
  });
};

exports.get = function (request, reply) {
  ctx.session = request.auth.isAuthenticated || false;
  ctx.error = request.query.err || '';
  posts.get(request.params.pid, function (err, post) {
    if (err) {
      return reply(Boom.wrap(err, 404));
    }

    ctx.isOwner = !!(request.auth.isAuthenticated && request.auth.credentials.uid === post.posted);
    ctx.post = post;

    reply.view('post', ctx);
  });
}

exports.forgotPassword = function (request, reply) {
  ctx.error = request.query.err || '';
  ctx.session = request.auth.isAuthenticated || false;
  reply.view('forgot_password', ctx);
};

exports.resetPassword = function (request, reply) {
  ctx.error = request.query.err || '';
  ctx.session = request.auth.isAuthenticated || false;
  ctx.email = request.query.email;
  ctx.resetUID = request.query.uid;
  reply.view('reset_password', ctx);
};


