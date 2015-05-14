#!/usr/bin/env node

'use strict';

const search = require('../lib/search');
const posts = require('../lib/posts');

posts.feed(false, function (err, postItems) {
  if (err) {
    throw err;
  }

  postItems.forEach(function (post) {
    search.add(post, function (err) {
      if (err) {
        console.log('Error saving search');
      }
    });
  });
});
