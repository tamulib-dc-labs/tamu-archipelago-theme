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
 * The player is built by the viewer's own behavior, possibly after this one
 * runs, so this waits for the media element to appear and for its metadata
 * to load before seeking. It does not start playback.
 */
(function (Drupal) {
  'use strict';

  var WAIT_MS = 20000;

  function fragmentTime() {
    var parts = window.location.hash.replace(/^#/, '').split('/');
    for (var i = 0; i < parts.length - 1; i += 2) {
      if (parts[i] === 'time') {
        var time = parseFloat(decodeURIComponent(parts[i + 1]));
        return isFinite(time) && time >= 0 ? time : null;
      }
    }
    return null;
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

  function findMedia(time) {
    var started = Date.now();
    var look = function () {
      var media = document.querySelector('.field-iiif video, .field-iiif audio') ||
        document.querySelector('video, audio');
      if (media) {
        seek(media, time);
        return;
      }
      if (Date.now() - started < WAIT_MS) {
        window.setTimeout(look, 250);
      }
    };
    look();
  }

  function run() {
    var time = fragmentTime();
    if (time !== null) {
      findMedia(time);
    }
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
