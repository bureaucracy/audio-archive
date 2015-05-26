'use strict';

const concat = require('concat-stream');
const trakker = require('trakker');

const db = require('./db').register('search');
const posts = require('./posts');

exports.find = function (keyword, next) {
  keyword = keyword.toLowerCase();

  let rs = db.createReadStream({
    gte: 'keyword!' + keyword,
    lte: 'keyword!' + keyword + '\xff',
    limit: 20
  });

  rs.pipe(concat(function (postItems) {
    let results = [];

    postItems.forEach(function (post) {
      posts.get(post.value, function (err, p) {
        if (!err) {
          results.push(p);
        }
      });
    });

    next(null, results);
  }));

  rs.on('error', function (err) {
    next(err);
  });
};

exports.add = function (post, next) {
  let ops = [
    {
      type: 'put',
      key: 'keyword!' + post.title.trim() + '!' + post.pid,
      value: post.pid
    },
    {
      type: 'put',
      key: 'pid!' + post.pid + '!' + post.title.trim(),
      value: 'keyword!' + post.title.trim() + '!' + post.pid
    },
    {
      type: 'put',
      key: 'keyword!' + post.artist.trim() + '!' + post.pid,
      value: post.pid
    },
    {
      type: 'put',
      key: 'pid!' + post.pid + '!' + post.artist.trim(),
      value: 'keyword!' + post.artist.trim() + '!' + post.pid
    }
  ];

  let tracklisting = post.tracklisting;

  if (post.tracklisting && typeof tracklisting !== 'object') {
    tracklisting = trakker.generate(post.tracklisting);
  }

  tracklisting.forEach(function (track) {
    let title = false;

    if (track.title) {
      title = track.title.trim();
    } else if (track) {
      title = track;
    }

    if (title) {
      ops.push({
        type: 'put',
        key: 'keyword!' + title + '!' + post.pid,
        value: post.pid
      });

      ops.push({
        type: 'put',
        key: 'pid!' + post.pid + '!' + title,
        value: 'keyword!' + title + '!' + post.pid
      });
    }
  });

  db.batch(ops, function (err) {
    if (err) {
      return next(err);
    }

    next(null, true);
  });
};

exports.del = function (pid, next) {
  let ops = [];

  let rs = db.createReadStream({
    gte: 'pid!' + pid,
    lte: 'pid!' + pid + '\xff'
  });

  rs.pipe(concat(function (posts) {
    posts.forEach(function (post) {
      ops.push({
        type: 'del',
        key: post.value
      });

      ops.push({
        type: 'del',
        key: post.key
      });
    });

    db.batch(ops, function (err) {
      if (err) {
        return next(err);
      }

      next(null, true);
    });
  }));

  rs.on('error', function (err) {
    next(err);
  });
};
