/**
 * @file
 * Mobile navigation behaviour.
 *
 * The menu toggle lives in #tamu-top-bar and the panel it opens is positioned
 * fixed, floating over the page. That arrangement needs two things CSS alone
 * cannot provide:
 *
 * 1. The panel sits directly below the institutional bar, but that bar's
 *    height depends on the logo, which scales with the viewport. The height is
 *    measured here and published as --tamu-top-bar-h for header.css to consume.
 *
 * 2. A panel that overlays the page needs click-outside and Escape to dismiss
 *    it. A collapse that pushes content down does not, which is why the
 *    upstream markup ships without either.
 */
(function () {
  'use strict';

  var BAR_ID = 'tamu-top-bar';
  var PANEL_SELECTOR = '.to-be-collapsed';
  var TOGGLE_SELECTOR = '.tamu-top-bar__menu-toggle';

  /* ---------------------------------------------------------------
     Institutional bar height
     --------------------------------------------------------------- */

  function publishBarHeight() {
    var bar = document.getElementById(BAR_ID);
    if (!bar) {
      return;
    }
    var height = bar.offsetHeight;
    var identity = document.querySelector('.tamu-site-identity');
    if (identity) {
      height += identity.offsetHeight;
    }
    document.documentElement.style.setProperty(
      '--tamu-top-bar-h',
      height + 'px'
    );
  }

  publishBarHeight();
  // The logo is inline SVG, so layout is settled at parse time; load and
  // resize cover font swaps and orientation changes.
  window.addEventListener('load', publishBarHeight);
  window.addEventListener('resize', publishBarHeight);

  /* ---------------------------------------------------------------
     Dismissing the floating panel
     --------------------------------------------------------------- */

  function openPanels() {
    return Array.prototype.filter.call(
      document.querySelectorAll(PANEL_SELECTOR),
      function (panel) {
        return panel.classList.contains('show');
      }
    );
  }

  function close(panel) {
    var Collapse = window.bootstrap && window.bootstrap.Collapse;
    if (!Collapse) {
      return;
    }
    Collapse.getOrCreateInstance(panel, { toggle: false }).hide();
  }

  document.addEventListener('click', function (event) {
    var panels = openPanels();
    if (!panels.length) {
      return;
    }

    var target = event.target;
    if (!(target instanceof Element)) {
      return;
    }
    // The toggle runs Bootstrap's own handler; closing here too would have it
    // immediately reopen.
    if (target.closest(TOGGLE_SELECTOR)) {
      return;
    }

    panels.forEach(function (panel) {
      if (!panel.contains(target)) {
        close(panel);
      }
    });
  });

  document.addEventListener('keydown', function (event) {
    if (event.key !== 'Escape') {
      return;
    }

    var panels = openPanels();
    if (!panels.length) {
      return;
    }

    panels.forEach(close);

    var toggle = document.querySelector(TOGGLE_SELECTOR);
    if (toggle) {
      toggle.focus();
    }
  });

  /* ---------------------------------------------------------------
     Hero search placeholder
     The hero search box and the header/modal search box are two block
     placements of the *same* Views exposed-filter display, so Drupal
     builds a single form render array and reuses it for both — a
     hook_form_alter placeholder would show up in both inputs. Setting
     it here, scoped to the hero block's own DOM node, only touches the
     one input.
     --------------------------------------------------------------- */
  function setHeroSearchPlaceholder() {
    var heroSearchInput = document.querySelector(
      '.block-views-exposed-filter-blocksolr-search-content-page-1 input[type="text"]'
    );
    if (heroSearchInput && !heroSearchInput.placeholder) {
      heroSearchInput.placeholder = 'Search for images, books, videos, etc.';
    }
  }

  // This script runs mid-body, before the hero markup further down the
  // page has been parsed, so the query needs the DOM to finish first. Core's
  // autocomplete behavior also renames this input's id (it collides with the
  // header search box's) once it attaches, which happens around the same
  // time — waiting for the window 'load' event (after behaviors attach)
  // avoids a race where that rename clobbers our change.
  window.addEventListener('load', setHeroSearchPlaceholder);

  /* ---------------------------------------------------------------
     Hero background photo
     Picked client-side, not server-side: this site has Internal Page
     Cache and Dynamic Page Cache enabled, both of which cache the
     response before hook_preprocess_html() (or any other theme hook)
     runs, so a PHP-side random pick just gets baked into the cached
     page and stops varying after the first hit. Doing it in JS sidesteps
     that entirely — every visitor's browser makes its own pick.
     Add/remove IIIF image URLs here; no database or config change needed.
     --------------------------------------------------------------- */
  var HERO_IMAGES = [
    'https://digitalcollections.library.tamu.edu/iiif/2/533%2Fimage-dragon-map-12a3dc73-a180-40fb-acf3-cad43569a34d.jpg/45,38,1713,1316/full/0/default.jpg',
    'https://digitalcollections.library.tamu.edu/iiif/2/6e3%2Fimage-1654665-23030282-e311-42f3-b35b-d166a7dc11d4.jpg/full/1400,/0/default.jpg',
    'https://digitalcollections.library.tamu.edu/iiif/2/def%2Fimage-08382-f8bd5b91-8eae-4298-a224-b6d5bf7c37ae.jpg/full/1400,/0/default.jpg',
    'https://digitalcollections.library.tamu.edu/iiif/2/e01%2Fimage-stripling-f12943c6-0fc4-40b0-8596-d93ee430970f.jpg/full/1400,/0/default.jpg',
    'https://digitalcollections.library.tamu.edu/iiif/2/75e%2Fimage-poncho-70553485-7fc8-4449-a208-51e5cb5a53b5.jpg/2,49,2363,1191/full/0/default.jpg',
    'https://digitalcollections.library.tamu.edu/iiif/2/d8c%2Fimage-g5672-m4-1624-o77-86270f92-2fe7-4c25-a24a-5b2dddac02b1.jp2/485,808,7842,5362/1400,/0/default.jpg',
    'https://digitalcollections.library.tamu.edu/iiif/2/34d%2Fimage-utf-8-cmlrsc00181-eacdb2b9-d3a7-4ece-85b8-4e01c1a27170.jp2/full/1400,/0/default.jpg'
  ];
  function setRandomHeroImage() {
    // The <body class="path-frontpage ..."> tag has already been parsed by
    // the time this (mid-body) script runs, even though .tamu-hero-photo
    // itself, further down the page, has not — check the body class rather
    // than querying for the element.
    if (!document.body.classList.contains('path-frontpage')) {
      return;
    }
    var image = HERO_IMAGES[Math.floor(Math.random() * HERO_IMAGES.length)];
    document.documentElement.style.setProperty(
      '--tamu-hero-image',
      'url("' + image + '")'
    );
  }

  setRandomHeroImage();
})();
