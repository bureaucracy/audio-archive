'use strict';

const Boom = require('boom');
const Bcrypt = require('bcrypt');
const request = require('request');
const postmark = require('postmark');
const uuid = require('uuid');

const conf = require('./conf');
const db = require('./db').register('users');

let updateProfile = function (user, next) {
  let ops = [
    {
      type: 'put',
      key: 'email!' + user.email,
      value: user
    },
    {
      type: 'put',
      key: 'uid!' + user.uid,
      value: user
    }
  ];

  db.batch(ops, function (err) {
    if (err) {
      return next(err);
    }

    next(null, user.password);
  });
};

let updatePassword = function (user, password, next) {
  Bcrypt.genSalt(10, function (err, salt) {
    if (err) {
      return next(err);
    }

    Bcrypt.hash(password, salt, function (err, hash) {
      if (err) {
        return next(err);
      }

      user.password = hash;
      user.resetUID = uuid.v4();
      updateProfile(user, next);
    })
  });
};

exports.forgotPassword = function (request, reply) {
  let email = request.payload.email;
  let client = new postmark.Client(conf.get('postmark-key'));

  let resetUID = uuid.v4();

  db.get('email!' + email, function (err, user) {
    if (!err && user) {
      user.resetUID = resetUID;

      updateProfile(user, function (err) {
        if (err) {
          console.log('Could not update user with reset password key');
          reply.redirect('/resetPassword');
        }

        client.sendEmail({
          From: conf.get('postmark-email'),
          To: email,
          Subject: 'Audio Archive - Password Reset',
          TextBody: 'Click on the link below to reset your password.\n\n' +
                    conf.get('externalDomain') + '/password/reset?uid=' +
                    resetUID + '&email=' + email
        }, function (err) {
          if (err) {
            console.error('Unable to send via postmark: ' + err.message);
            return;
          }
          console.log('sent email to : ', email, conf.get('externalDomain') + '/password/reset?uid=' +
                    resetUID + '&email=' + email);
          reply.redirect('/');
        });
      });
    } else {
      reply.redirect('/resetPassword');
    }
  });
};

exports.resetPassword = function (request, reply) {
  let password1 = request.payload.password1;
  let password2 = request.payload.password2;
  let email = request.payload.email;
  let resetUID = request.payload.resetUID;

  if (password1 !== password2) {
    return reply(Boom.wrap(new Error('Passwords do not match'), 400));
  }

  db.get('email!' + email, function (err, user) {
    if (err) {
      return reply(Boom.wrap(err, 400));
    }

    if (user.resetUID !== resetUID) {
      return reply(Boom.wrap(new Error('Invalid reset key'), 400));
    }

    updatePassword(user, password1, function (err, hash) {
      if (err) {
        return reply(Boom.wrap(err, 400));
      }

      reply.redirect('/');
    });
  });
};

exports.signup = function (request, reply) {
  let email = request.payload.email;
  let password = request.payload.password;

  let user = {
    name: email.split('@')[0],
    email: email,
    uid: uuid.v4()
  };

  let addUser = function (hash) {
    user.password = hash;

    updateProfile(user, function (err) {
      if (err) {
        return reply(Boom.wrap(err, 400));
      }

      request.auth.session.set(user);
      reply.redirect('/dashboard');
    });
  };

  console.log('signing up ', request.payload.email, request.payload.password);

  // If user is found, throw an error, otherwise create a new account
  db.get('email!' + email, function (err, profile) {
    if (profile) {
      return reply(Boom.wrap(new Error('User already exists'), 400));
    }

    updatePassword(user, password, function (err, hash) {
      if (err) {
        return reply(Boom.wrap(err, 400));
      }

      addUser(hash);
    });
  });
};

exports.login = function (request, reply) {
  let email = request.payload.email;
  let password = request.payload.password;

  db.get('email!' + email, function (err, user) {
    if (err) {
      return reply(Boom.wrap(new Error('Invalid username or password'), 400));
    }

    Bcrypt.compare(password, user.password, function (err, isValid) {
      if (err || !isValid) {
        return reply(Boom.wrap(new Error('Invalid username or password'), 400));
      }

      request.auth.session.set(user);
      console.log('logging in ', user, request.auth.isAuthenticated)
      reply.redirect('/dashboard');
    });
  });
};

exports.logout = function (request, reply) {
  request.auth.session.clear();
  reply.redirect('/');
}