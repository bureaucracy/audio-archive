'use strict';

const Boom = require('boom');
const uuid = require('uuid');
const concat = require('concat-stream');
const trakker = require('trakker');
const marked = require('marked');

const conf = require('./conf');
const db = require('./db').register('posts');
const authenticate = require('./authenticate');

marked.setOptions({
  renderer: new marked.Renderer(),
  gfm: true,
  tables: true,
  breaks: true,
  pedantic: false,
  sanitize: true,
  smartLists: true,
  smartypants: false
});

let ctx = {
  analytics: conf.get('analytics')
};

exports.new = function (request, reply) {
  ctx.session = request.auth.isAuthenticated || false;
  reply.view('add', ctx);
};

let addPost = function (opts, next) {
  let created = Math.floor(Date.now() / 1000);

  let tracklist = opts.tracklisting.trim();

  try {
    tracklist = trakker.generate(tracklist);
  } catch (err) {
    console.log('Leave tracklist as is');
  }

  let post = {
    title: opts.title,
    artist: opts.artist,
    tracklisting: tracklist,
    notes: opts.notes,
    created: created,
    posted: opts.posted,
    pid: uuid.v4(),
    added: opts.added
  };

  let ops = [
    {
      type: 'put',
      key: 'user!' + post.posted + '!' + created,
      value: post
    },
    {
      type: 'put',
      key: 'post!' + post.pid,
      value: post
    },
    {
      type: 'put',
      key: 'feed!' + created + '!' + post.pid,
      value: post
    }
  ];

  db.batch(ops, function (err) {
    if (err) {
      return next(err);
    }

    next(null, true);
  });
};

exports.add = function (request, reply) {
  addPost({
    tracklisting: request.payload.tracklisting,
    title: request.payload.title,
    artist: request.payload.artist,
    posted: request.auth.credentials.uid,
    notes: request.payload.notes,
    added: false
  }, function (err) {
    if (err) {
      return reply(Boom.wrap(err, 400));
    }

    reply.redirect('/dashboard');
  });
};

exports.collection = function (request, reply) {
  db.get('post!' + request.params.pid, function (err, post) {
    if (err) {
      return reply(Boom.wrap(err, 400));
    }

    if (request.auth.credentials.uid === post.posted) {
      return reply.redirect('/dashboard');
    }

    addPost({
      tracklisting: post.tracklisting,
      title: post.title,
      artist: post.artist,
      posted: request.auth.credentials.uid,
      notes: post.notes,
      added: post.posted
    }, function (err) {
      if (err) {
        return reply(Boom.wrap(err, 400));
      }

      reply.redirect('/dashboard');
    });
  });
};

exports.get = function (pid, next) {
  db.get('post!' + pid, function (err, post) {
    if (err) {
      return next(err);
    }

    post.notesMarked = marked(post.notes);
    post.postedBy = '';

    authenticate.get(post.posted, function (err, profile) {
      if (profile) {
        post.postedBy = profile.name;
      }

      next(null, post);
    });
  });
};

exports.del = function (uid, created, pid, next) {
  let ops = [
    {
      type: 'del',
      key: 'user!' + uid + '!' + created
    },
    {
      type: 'del',
      key: 'post!' + pid
    },
    {
      type: 'del',
      key: 'feed!' + created + '!' + pid
    }
  ];

  db.batch(ops, function (err) {
    if (err) {
      return next(err);
    }

    next(null, true);
  });
};

exports.update = function (request, reply) {
  let created = request.payload.created;

  db.get('user!' + request.auth.credentials.uid + '!' + created, function (err, post) {
    if (err) {
      return reply(Boom.wrap(err, 404));
    }

    let tracklist = request.payload.tracklisting.trim();

    try {
      tracklist = trakker.generate(request.payload.tracklisting);
    } catch (err) {
      console.log('Leave tracklist as is');
    }

    post.title = request.payload.title;
    post.artist = request.payload.artist;
    post.tracklisting = tracklist;
    post.notes = request.payload.notes;

    let ops = [
      {
        type: 'put',
        key: 'user!' + request.auth.credentials.uid + '!' + created,
        value: post
      },
      {
        type: 'put',
        key: 'post!' + post.pid,
        value: post
      },
      {
        type: 'put',
        key: 'feed!' + created + '!' + post.pid,
        value: post
      }
    ];

    db.batch(ops, function (err) {
      if (err) {
        return reply(Boom.wrap(err, 400));
      }

      reply.redirect('/dashboard');
    });
  });
};

exports.latest = function (request, next) {
  let rs = db.createValueStream({
    gte: 'user!' + request.auth.credentials.uid,
    lte: 'user!' + request.auth.credentials.uid + '\xff',
    limit: 20,
    reverse: true
  });

  rs.pipe(concat(function (posts) {
    posts.forEach(function (post) {
      post.notesMarked = marked(post.notes);
    });

    next(null, posts);
  }));

  rs.on('error', function (err) {
    next(err);
  });
};

exports.userFeed = function (uid, next) {
  let rs = db.createValueStream({
    gte: 'user!' + uid,
    lte: 'user!' + uid + '\xff',
    limit: 20,
    reverse: true
  });

  rs.pipe(concat(function (posts) {
    posts.forEach(function (post) {
      post.notesMarked = marked(post.notes);
    });

    next(null, posts);
  }));

  rs.on('error', function (err) {
    next(err);
  });
};

exports.feed = function (next) {
  let rs = db.createValueStream({
    gte: 'feed!',
    lte: 'feed!' + '\xff',
    limit: 10,
    reverse: true
  });

  rs.pipe(concat(function (posts) {
    posts.forEach(function (post) {
      post.notesMarked = marked(post.notes);
    });

    next(null, posts);
  }));

  rs.on('error', function (err) {
    next(err);
  });
};
