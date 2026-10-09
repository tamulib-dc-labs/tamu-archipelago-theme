/**
 * @file
 * Open an item at the metadata field a search match came from:
 * /do/{uuid}#field/{label}/q/{words}.
 *
 * Search results link metadata matches here (js/search-matches.js): the
 * chip names the field ("Abstract", "Note") and the words are the search.
 * The search card and the item page do not always use the same label for a
 * field ("Place" on the card, "Geographic Subject" here), so the label only
 * breaks ties: the row is the first whose label is the same, else the first
 * whose value holds a search word, preferring one whose label shares a word
 * with the chip's. #q/{words} alone (a "Details" chip) takes the first row
 * holding a word.
 *
 * The row's tab is shown, the row scrolled to and the words in it marked.
 * The fragment is read when the page loads, before Mirador rewrites it to
 * its own #page/{n} once the viewer is up.
 */
(function (Drupal) {
  'use strict';

  // Keys of other item links (js/media-seek.js), which are not about a
  // field.
  var MEDIA_KEYS = ['time'];

  // Search card labels that the item page names differently.
  var ALIASES = {
    place: ['geographic subject'],
    creator: ['creators and contributors'],
    contributor: ['creators and contributors'],
    publisher: ['digital publisher', 'original publisher'],
    collection: ['part of collection']
  };

  function fragment() {
    var parts = window.location.hash.replace(/^#/, '').split('/');
    var out = {};
    for (var i = 0; i < parts.length - 1; i += 2) {
      try {
        out[parts[i]] = decodeURIComponent(parts[i + 1].replace(/\+/g, ' '));
      }
      catch (e) {
        out[parts[i]] = parts[i + 1];
      }
    }
    return out;
  }

  function norm(text) {
    return text.toLowerCase().replace(/[^a-z0-9À-ɏ]+/g, ' ').trim();
  }

  function terms(q) {
    return (q || '')
      .replace(/["()+\-~*]/g, ' ')
      .split(/\s+/)
      .filter(function (word) {
        return word.length > 1 && !/^(AND|OR|NOT)$/.test(word);
      });
  }

  // Search words at the start of a word, running on to its end, so "book"
  // marks "books" and "Bookman" the way Solr's stemming matched them.
  function pattern(words) {
    if (!words.length) {
      return null;
    }
    var escaped = words.map(function (word) {
      return word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    });
    return new RegExp('(^|[^\\p{L}\\p{N}])((?:' + escaped.join('|') + ')[\\p{L}\\p{N}]*)', 'giu');
  }

  function holds(node, re) {
    re.lastIndex = 0;
    return re.test(node.textContent);
  }

  // The metadata rows: dt with the dd right after it.
  function rows() {
    return Array.prototype.filter.call(document.querySelectorAll('dl > dt'), function (dt) {
      var dd = dt.nextElementSibling;
      return dd && dd.tagName === 'DD';
    });
  }

  // The row for a chip's label and the search words: one with that label
  // holding a word, else one with that label (the page can show less of a
  // field than was searched: only the first of several notes), else one
  // sharing a word with the label holding one, else any holding one. An
  // item can have several rows of one label (Note). The title comes last:
  // the search page leaves title matches out, so the chip is about another
  // field.
  function findRow(label, re) {
    var all = rows();
    var wanted = norm(label || '');
    var labelWords = wanted.split(' ').filter(Boolean);
    var names = wanted ? [wanted].concat(ALIASES[wanted] || []) : [];
    var same = function (dt) {
      return names.indexOf(norm(dt.textContent)) !== -1;
    };
    var near = function (dt) {
      return norm(dt.textContent).split(' ').some(function (word) {
        return labelWords.indexOf(word) !== -1;
      });
    };
    var holding = re ? all.filter(function (dt) {
      return holds(dt.nextElementSibling, re);
    }) : [];
    var notTitle = holding.filter(function (dt) {
      return norm(dt.textContent) !== 'title';
    });
    return notTitle.filter(same)[0] ||
      all.filter(same)[0] ||
      notTitle.filter(near)[0] ||
      notTitle[0] ||
      holding[0] ||
      null;
  }

  // Wrap each hit in the row's text in <mark>.
  function mark(root, re) {
    var walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    var texts = [];
    while (walker.nextNode()) {
      texts.push(walker.currentNode);
    }
    texts.forEach(function (node) {
      var text = node.nodeValue;
      var out = document.createDocumentFragment();
      var last = 0;
      var found;
      re.lastIndex = 0;
      while ((found = re.exec(text)) !== null) {
        var at = found.index + found[1].length;
        out.appendChild(document.createTextNode(text.slice(last, at)));
        var hit = document.createElement('mark');
        hit.className = 'tamu-hit';
        hit.textContent = found[2];
        out.appendChild(hit);
        last = at + found[2].length;
      }
      if (last) {
        out.appendChild(document.createTextNode(text.slice(last)));
        node.parentNode.replaceChild(out, node);
      }
    });
  }

  // The row may sit in a tab that is not showing (another language).
  function showPane(node) {
    var pane = node.closest('.tab-pane');
    if (!pane || pane.classList.contains('active') || !pane.id) {
      return;
    }
    var trigger = document.querySelector(
      '[data-bs-target="#' + pane.id + '"], [href="#' + pane.id + '"]'
    );
    if (trigger && window.bootstrap && window.bootstrap.Tab) {
      window.bootstrap.Tab.getOrCreateInstance(trigger).show();
    }
  }

  function focusRow(dt, re) {
    var dd = dt.nextElementSibling;
    showPane(dt);
    if (re) {
      mark(dd, re);
    }
    dt.classList.add('tamu-field-hit');
    dd.classList.add('tamu-field-hit');
    var go = function () {
      dt.scrollIntoView({ block: 'center' });
    };
    go();
    // The viewer above the metadata can still be growing; land again once
    // the page has loaded, unless the reader has scrolled away since.
    var moved = false;
    var onScroll = function () {
      moved = true;
    };
    window.addEventListener('wheel', onScroll, { once: true, passive: true });
    window.addEventListener('touchmove', onScroll, { once: true, passive: true });
    window.addEventListener('keydown', onScroll, { once: true });
    window.addEventListener('load', function () {
      window.setTimeout(function () {
        if (!moved) {
          go();
        }
      }, 300);
    }, { once: true });
  }

  function run() {
    var frag = fragment();
    var media = MEDIA_KEYS.some(function (key) {
      return key in frag;
    });
    if (!('field' in frag) && !('q' in frag && !media)) {
      return;
    }
    var re = pattern(terms(frag.q));
    var dt = findRow(frag.field, re);
    if (dt) {
      focusRow(dt, re);
    }
  }

  var started = false;
  Drupal.behaviors.tamuMatchFocus = {
    attach: function () {
      if (started) {
        return;
      }
      started = true;
      run();
    }
  };
})(Drupal);
