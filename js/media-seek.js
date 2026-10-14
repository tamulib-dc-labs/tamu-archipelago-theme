/**
 * @file
 * Start an item's audio or video at the time in the URL: /do/{uuid}#time/273.
 *
 * Search results link transcript matches here (js/search-matches.js). The
 * fragment follows the key/value form Archipelago already uses for Mirador
 * (#search/{term}/page/{n}), so it can sit alongside those keys. Neither
 * viewer reads a time from the URL: Mirador only seeks when a transcript
 * annotation is selected, and the Clover viewer takes no URL state at all.
 *
 * A record can hold several recordings (the sides of an oral history's
 * tapes); #time/{s}/canvas/{n} names the one to play, n counting from 0 in
 * the manifest's order. The Clover viewer lists them as thumbnails
 * ([data-testid="media-thumbnail"][data-canvas="n"]); pressing one swaps
 * in a new player, which is then sought.
 *
 * The player is built by the viewer's own behavior, possibly after this one
 * runs, so this waits for the media element to appear and for its metadata
 * to load before seeking. It does not start playback.
 */
(function (Drupal) {
  'use strict';

  var WAIT_MS = 20000;
  var MEDIA = '.field-iiif video, .field-iiif audio';

  // The fragment's key/value pairs: #time/273/canvas/2 -> {time, canvas}.
  function fragment() {
    var parts = window.location.hash.replace(/^#/, '').split('/');
    var found = { time: null, canvas: null };
    for (var i = 0; i < parts.length - 1; i += 2) {
      var value = parseFloat(decodeURIComponent(parts[i + 1]));
      if ((parts[i] === 'time' || parts[i] === 'canvas') && isFinite(value) && value >= 0) {
        found[parts[i]] = parts[i] === 'canvas' ? Math.floor(value) : value;
      }
    }
    return found;
  }

  function currentMedia() {
    return document.querySelector(MEDIA) || document.querySelector('video, audio');
  }

  function seek(media, time) {
    var apply = function () {
      media.currentTime = time;
      media.scrollIntoView({ block: 'center' });
    };
    if (media.readyState >= 1) {
      apply();
    }
    else {
      media.addEventListener('loadedmetadata', apply, { once: true });
    }
  }

  // Calls back with the first value `test` returns, polling until WAIT_MS.
  function waitFor(test, done) {
    var started = Date.now();
    var look = function () {
      var value = test();
      if (value) {
        done(value);
      }
      else if (Date.now() - started < WAIT_MS) {
        window.setTimeout(look, 250);
      }
    };
    look();
  }

  function run() {
    var at = fragment();
    if (at.time === null) {
      return;
    }
    if (at.canvas === null) {
      waitFor(currentMedia, function (media) {
        seek(media, at.time);
      });
      return;
    }
    // Wait for the player and the recording's thumbnail; switch to it if
    // another recording is showing, and seek the player that replaces it.
    waitFor(function () {
      var media = currentMedia();
      var thumb = document.querySelector('[data-testid="media-thumbnail"][data-canvas="' + at.canvas + '"]');
      return media && (thumb || at.canvas === 0) ? { media: media, thumb: thumb } : null;
    }, function (found) {
      if (!found.thumb || found.thumb.getAttribute('aria-checked') === 'true') {
        seek(found.media, at.time);
        return;
      }
      var before = found.media.currentSrc || found.media.src;
      found.thumb.click();
      waitFor(function () {
        var media = currentMedia();
        return media && (media !== found.media || (media.currentSrc || media.src) !== before) ? media : null;
      }, function (media) {
        seek(media, at.time);
      });
    });
  }

  var started = false;
  Drupal.behaviors.tamuMediaSeek = {
    attach: function () {
      if (started) {
        return;
      }
      started = true;
      run();
      window.addEventListener('hashchange', run);
    }
  };
})(Drupal);
