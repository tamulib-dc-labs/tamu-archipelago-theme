/**
 * @file
 * Search result "Match" block (/search list display).
 *
 * On a keyword search Search API appends an excerpt to each result as bare
 * text after the metadata field. It comes in two shapes, and neither says
 * where in the object the match is:
 *
 * - Metadata: "… herding <strong>cattle</strong> …"
 * - Full text: wrapped in “ … ”, with the first hit linked into the viewer
 *   as /do/{uuid}#search/{term}. This covers OCR, WebVTT transcripts and
 *   archived web pages, including text that lives in an object's children
 *   (the pages of a multi-part book, the sides of an album), which
 *   Archipelago joins onto the parent.
 *
 * This wraps the excerpt in a labelled block and works out where each hit
 * is, using the ADO type the metadata display puts on the type tag
 * (search-result__type--{type}):
 *
 * - Audio, StreamingVideo, Video: the excerpt still carries the WebVTT cue
 *   timings ("04:33.237 --> 04:37.803 tuition's not …"), so each hit is
 *   timed from its cue: "▶ 4:34", a few seconds early so the word is not
 *   missed. Untimed text is labelled by the field it came from, or
 *   "Transcript".
 * - Book, Manuscript, Map, Image, Collection and series (albums,
 *   box/folders): the object's IIIF Content Search service returns each
 *   hit with its canvas, /canvas/p{n} being position n in the object.
 *   Single objects use the "iiifmanifest" display, multi-part ones
 *   "iiifmanifest3cws_multiple". That gives "Page 452", "Sheet 3" for map
 *   sets, "On map" / "In image" for single images, and for a collection
 *   the member item the hit is in.
 * - Web archives (WebPage) and anything not located: the excerpt, with a
 *   chip saying what kind of text it is ("Web archive", "Full text").
 * - Metadata matches (the part of the excerpt before Archipelago's <br>):
 *   under a chip naming the field, found by looking the text up in the
 *   hidden .search-result__fields list the metadata display adds
 *   ("Abstract", "Subject", "Note", …), or "Details" when no field holds
 *   it. A match only in the title is left out: the title is right there.
 * - No excerpt at all (Solr returns none for some records): if the search
 *   words are in the abstract or description, that is shown instead.
 *
 * A result shows at most MAX_HITS lines in all; the rest are left to the
 * item's own viewer.
 *
 * Each located hit links straight to its place in the viewer, from both its
 * chip and its highlighted words: /do/{uuid}#search/{term}/page/{n} opens
 * Mirador on that page with the term highlighted (see
 * PAGE_LINKS_WITH_SEARCH for the viewer setting this depends on), and
 * /do/{uuid}#time/{seconds} is picked up by js/media-seek.js on the item
 * page. Maps open in the Clover viewer, which cannot be pointed at a page
 * or a word, so their hits link to the map itself.
 *
 * Anything that cannot be located keeps the original excerpt, so a result
 * never shows less than before.
 */
(function (Drupal, once) {
  'use strict';

  // Lines shown per result; the rest are left to the item's own viewer.
  var MAX_HITS = 3;

  // Time chips start this many seconds before the cue, so playback does
  // not begin just after the word.
  var TIME_LEAD = 3;

  // Page links as #search/{term}/page/{n}, so Mirador opens the page with
  // the term highlighted. Relies on every Mirador formatter's viewer
  // overrides setting "window": {"switchCanvasOnSearch": false} (Book
  // Reader, Creative Work Series, Oral History with Multiple Media and Full
  // View displays); with it on, the search sends the viewer to the first hit
  // instead of the page. Set to false to fall back to #page/{n}.
  var PAGE_LINKS_WITH_SEARCH = true;
  var SEARCH_SERVICE =
    '/iiifcontentsearch/v1/do/{uuid}/metadatadisplayexposed/{display}/mode/advanced/page/0';

  // ADO types (the "type" key; lower-cased on the type tag's class).
  var AV_TYPES = ['audioobject', 'streamingvideo', 'videoobject'];

  // Types shown in the Clover viewer, which reads no page or search from
  // the URL: their hits link to the object itself.
  var PLAIN_LINK_TYPES = ['map'];

  // Which manifest's search service to ask, in order. Book and Manuscript
  // can be a single object or a multi-part one; the type alone does not
  // say which, so both are tried.
  function searchDisplays(type) {
    if (type === 'creativeworkseries' || type === 'journal') {
      return ['iiifmanifest3cws_multiple'];
    }
    if (type === 'book' || type === 'manuscript') {
      return ['iiifmanifest', 'iiifmanifest3cws_multiple'];
    }
    return ['iiifmanifest'];
  }

  // What to call text that could not be placed on a page or a time.
  function textLabel(type) {
    if (type === 'webpage') {
      return Drupal.t('Web archive');
    }
    if (AV_TYPES.indexOf(type) !== -1) {
      return Drupal.t('Transcript');
    }
    return Drupal.t('Full text');
  }

  // Highlight markers used while the excerpt is handled as a string.
  var HL_START = '\u0001';
  var HL_END = '\u0002';

  // A WebVTT cue timing, "04:33.237 --> 04:37.803". Either side may be
  // cut short where Search API trimmed the fragment (":33.237 --> 04:37.803",
  // "13:49.800 --> 13"), and a start time can appear on its own when the
  // fragment ends or the arrow falls outside it ("15:00.467 Oh, that was").
  var CUE = /([\d:.]*\d)?\s*-->\s*([\d:.]*\d)?|((?:\d+:)?\d{1,2}:\d{2}\.\d{3})/g;
  var FULL_TIME = /^(?:(\d+):)?(\d{1,2}):(\d{2})\.\d{3}$/;

  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) {
      node.className = className;
    }
    if (text) {
      node.textContent = text;
    }
    return node;
  }

  function seconds(stamp) {
    var parts = FULL_TIME.exec(stamp || '');
    if (!parts) {
      return null;
    }
    return (parseInt(parts[1] || '0', 10) * 3600) +
      (parseInt(parts[2], 10) * 60) + parseInt(parts[3], 10);
  }

  function formatTime(total) {
    var h = Math.floor(total / 3600);
    var m = Math.floor((total % 3600) / 60);
    var s = ('0' + (total % 60)).slice(-2);
    return h ? h + ':' + ('0' + m).slice(-2) + ':' + s : m + ':' + s;
  }

  // The ADO type from the metadata display's type tag, e.g. "audioobject".
  function cardType(region) {
    var tag = region.querySelector('.search-result__type');
    var match = tag && /search-result__type--([\w-]+)/.exec(tag.className);
    return match ? match[1] : '';
  }

  // Excerpt nodes -> one string, highlights wrapped in markers. Search API
  // pads highlights with spaces, leaving "tuition 's" and "tuition ."; the
  // space before punctuation goes.
  function flatten(nodes) {
    return nodes.map(function (node) {
      if (node.nodeType === 1 && node.tagName === 'STRONG') {
        return HL_START + node.textContent + HL_END;
      }
      return node.textContent;
    }).join('').replace(/\u0002\s+(?=[.,;:!?'\u2019)])/g, HL_END);
  }

  // Archipelago wraps each full-text excerpt in “ … ”, and a result can
  // carry a metadata excerpt and a full-text one back to back. The label
  // already says what this is, so those quotes go; quotation marks inside
  // the text are not next to an ellipsis and stay. Where two excerpts meet,
  // their ellipses collapse into one.
  function unquote(text) {
    return text
      .replace(/“\s*(?=…)/g, '')
      .replace(/(…)\s*”/g, '$1')
      .replace(/…(\s*…)+/g, '…');
  }

  // Marker string -> [{text, hl}] runs.
  function runs(text) {
    var out = [];
    var hl = false;
    text.split(/([\u0001\u0002])/).forEach(function (piece) {
      if (piece === HL_START) {
        hl = true;
      }
      else if (piece === HL_END) {
        hl = false;
      }
      else if (piece) {
        out.push({ text: piece, hl: hl });
      }
    });
    return out;
  }

  /* ---------------------------------------------------------------
     Metadata fields
     --------------------------------------------------------------- */

  // Lower-case letters and digits only, so spacing and punctuation that
  // Search API changes do not stop a match.
  function norm(text) {
    return text.toLowerCase().replace(/[^a-z0-9À-ɏ]+/g, ' ').trim();
  }

  // The record's searchable fields, from the hidden list the metadata
  // display adds: [{field, label, text}].
  function recordFields(region) {
    return Array.prototype.map.call(
      region.querySelectorAll('.search-result__fields [data-field]'),
      function (node) {
        return {
          field: node.getAttribute('data-field'),
          label: node.getAttribute('data-label') || node.getAttribute('data-field'),
          text: norm(node.textContent)
        };
      }
    );
  }

  // The field a piece of excerpt came from: the first whose text holds the
  // longest "…"-separated fragment that has a highlight. Null when none.
  function sourceOf(fields, hitRuns) {
    var marked = hitRuns.map(function (run) {
      return run.hl ? HL_START + run.text + HL_END : run.text;
    }).join('');
    var pieces = marked.split('…').filter(function (piece) {
      return piece.indexOf(HL_START) !== -1;
    }).map(function (piece) {
      return norm(piece.replace(/[\u0001\u0002]/g, ''));
    }).filter(Boolean).sort(function (a, b) {
      return b.length - a.length;
    });
    if (!pieces.length) {
      return null;
    }
    for (var i = 0; i < fields.length; i++) {
      if (fields[i].text.indexOf(pieces[0]) !== -1) {
        return fields[i];
      }
    }
    return null;
  }

  // A metadata hit labelled by its field. Title matches give null: the
  // title is already on the card.
  function metadataHit(fields, hitRuns) {
    var source = sourceOf(fields, hitRuns);
    if (source && source.field === 'title') {
      return null;
    }
    return {
      kind: 'meta',
      label: source ? source.label : Drupal.t('Details'),
      runs: hitRuns
    };
  }

  function runsText(hitRuns) {
    return norm(hitRuns.map(function (run) { return run.text; }).join(''));
  }

  // One hit per label: further text from the same field joins the first,
  // unless it is already there (Archipelago indexes the description with
  // the transcript too, so the same sentence can come twice).
  function mergeByLabel(hits) {
    var byLabel = {};
    return hits.filter(function (hit) {
      var first = byLabel[hit.label];
      if (first) {
        var had = runsText(first.runs);
        var text = runsText(hit.runs);
        if (had.indexOf(text) === -1 && text.indexOf(had) === -1) {
          first.runs = first.runs.concat([{ text: ' … ', hl: false }], hit.runs);
        }
        return false;
      }
      byLabel[hit.label] = hit;
      return true;
    });
  }

  // The search words, from the exposed fulltext filter.
  function searchWords() {
    var params = new URLSearchParams(window.location.search);
    return (params.get('search_api_fulltext') || '')
      .replace(/["()+\-~*]/g, ' ')
      .split(/\s+/)
      .filter(function (word) {
        return word.length > 1 && !/^(AND|OR|NOT)$/.test(word);
      });
  }

  // For records Solr gave no excerpt: the first search word found at the
  // start of a word in the abstract or description, as a metadata hit.
  function fieldMatch(region) {
    var words = searchWords();
    if (!words.length) {
      return null;
    }
    var escaped = words.map(function (word) {
      return word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    });
    var pattern = new RegExp('(^|[^\\w])(' + escaped.join('|') + ')', 'i');
    var nodes = region.querySelectorAll(
      '.search-result__fields [data-field="abstract"], .search-result__fields [data-field="description"]'
    );
    for (var i = 0; i < nodes.length; i++) {
      var text = nodes[i].textContent;
      var found = pattern.exec(text);
      if (found) {
        var at = found.index + found[1].length;
        return {
          kind: 'meta',
          label: nodes[i].getAttribute('data-label'),
          runs: [
            { text: text.slice(0, at), hl: false },
            { text: found[2], hl: true },
            { text: text.slice(at + found[2].length), hl: false }
          ]
        };
      }
    }
    return null;
  }

  /* ---------------------------------------------------------------
     Transcripts
     --------------------------------------------------------------- */

  function hasCues(text) {
    return /\d\.\d{3}\s*-->|\d:\d{2}\.\d{3}/.test(text);
  }

  // One hit per "…"-separated fragment that holds a highlight. The time is
  // the start of the cue the highlight sits in; when the fragment opens
  // mid-cue, the next cue's start is used, a few seconds late at most, and
  // every time is moved TIME_LEAD seconds earlier to make up for that.
  // A fragment with no timing can be metadata Archipelago indexes alongside
  // the transcript: if a field holds it, it goes to metaHits under that
  // field's name; otherwise it is untimed transcript and comes last.
  function transcriptHits(text, fields, type, metaHits) {
    var hits = [];
    text.split('…').forEach(function (fragment) {
      var at = fragment.indexOf(HL_START);
      if (at < 0) {
        return;
      }
      var before = null;
      var after = null;
      var cue;
      CUE.lastIndex = 0;
      while ((cue = CUE.exec(fragment)) !== null) {
        var start = seconds(cue[3] || cue[1]);
        if (start === null) {
          start = seconds(cue[2]);
        }
        if (start === null) {
          continue;
        }
        if (cue.index < at) {
          before = start;
        }
        else if (after === null) {
          after = start;
        }
      }
      var time = before !== null ? before : after;
      if (time !== null) {
        time = Math.max(0, time - TIME_LEAD);
      }
      var clean = fragment
        .replace(CUE, ' ')
        // A timing cut off at the end of the fragment, before its arrow:
        // "… tuition. 04" or "… $25. 06:13.457".
        .replace(/\s+(?:\d{1,2}|[\d:.]*[:.][\d:.]*\d)\s*$/, '')
        .replace(/\s+/g, ' ')
        .trim();
      var hitRuns = runs(clean);
      if (time === null && sourceOf(fields, hitRuns)) {
        var meta = metadataHit(fields, hitRuns);
        if (meta) {
          metaHits.push(meta);
        }
        return;
      }
      hits.push({
        kind: time === null ? 'text' : 'time',
        time: time,
        label: time === null ? textLabel(type) : formatTime(time),
        runs: hitRuns
      });
    });
    // Untimed transcript becomes one hit rather than a chip each, without
    // the sentences a timed hit already shows.
    var timed = hits.filter(function (hit) { return hit.time !== null; });
    var timedText = timed.map(function (hit) { return runsText(hit.runs); });
    var untimed = hits.filter(function (hit) {
      var text = runsText(hit.runs);
      return hit.time === null && !timedText.some(function (shown) {
        return shown.indexOf(text) !== -1 || text.indexOf(shown) !== -1;
      });
    });
    timed.sort(function (a, b) { return a.time - b.time; });
    return timed.concat(mergeByLabel(untimed));
  }

  /* ---------------------------------------------------------------
     Pages, sheets and member items (IIIF Content Search)
     --------------------------------------------------------------- */

  // Hit snippets arrive as HTML with the match in <em> (page OCR) or
  // <strong> (hits on page titles, already cut with "…"). Only their text
  // is kept, so nothing else from the response reaches the page.
  function emRuns(chars) {
    var body = new DOMParser().parseFromString(chars, 'text/html').body;
    return Array.prototype.map.call(body.childNodes, function (node) {
      return {
        text: node.textContent,
        hl: node.nodeType === 1 && (node.tagName === 'EM' || node.tagName === 'STRONG')
      };
    });
  }

  // How to name a canvas position for this type of object.
  function placeLabel(type, n) {
    if (type === 'map') {
      return n > 1 ? Drupal.t('Sheet @n', { '@n': n }) : Drupal.t('On map');
    }
    if (type === 'image') {
      return n > 1 ? Drupal.t('Image @n', { '@n': n }) : Drupal.t('In image');
    }
    return Drupal.t('Page @n', { '@n': n });
  }

  // Content Search v1 (AnnotationList.resources) and v2
  // (AnnotationPage.items) carry the same two things: text and target. The
  // target is /do/{owner}/iiif/canvas/p{n}: for a collection the owner is
  // the member item the hit is in, otherwise n is the position in the
  // object (a multi-part book's own manifest numbers across its pages).
  // A collection's own canvas holds its description, not a page.
  //
  // Hits on attached HTML or text files (a map's description sheet) come
  // back as markup and file names, "target=\"_blank\">", "UTF-8''x.jp2";
  // those are left out.
  var MARKUP = /[<>]|="|UTF-8''/;

  function pageHits(json, type, uuid) {
    var raw = json.resources || json.items || [];
    return raw.map(function (anno) {
      var body = anno.resource || anno.body || {};
      var on = anno.on || anno.target || '';
      on = typeof on === 'string' ? on : (on.id || on['@id'] || '');
      var canvas = /\/do\/([0-9a-f-]{36})\/iiif\/(?:[^/]+\/)?canvas\/p(\d+)/.exec(on);
      var hit = { runs: emRuns(body.chars || body.value || '') };
      if (!canvas || (type === 'collection' && canvas[1] === uuid)) {
        hit.kind = 'text';
        hit.label = textLabel(type);
      }
      else if (type === 'collection') {
        hit.kind = 'item';
        hit.item = canvas[1];
        hit.label = Drupal.t('Item');
      }
      else {
        hit.kind = 'page';
        hit.page = parseInt(canvas[2], 10);
        hit.label = placeLabel(type, hit.page);
        hit.plain = PLAIN_LINK_TYPES.indexOf(type) !== -1;
      }
      return hit;
    }).filter(function (hit) {
      return hit.runs.length && !MARKUP.test(hit.runs.map(function (run) {
        return run.text;
      }).join(''));
    });
  }

  /* ---------------------------------------------------------------
     Rendering
     --------------------------------------------------------------- */

  // Content search snippets are whole OCR blocks with the match anywhere in
  // them; keep a window around the first highlight so the clamped two
  // lines show it. Phone lines hold ~35 characters, so the window starts
  // closer to the word there.
  var LEAD = 40;
  var LEAD_NARROW = 12;
  var LENGTH = 220;
  var narrow = window.matchMedia ? window.matchMedia('(max-width: 575.98px)') : null;

  function around(hitRuns) {
    var leadMax = narrow && narrow.matches ? LEAD_NARROW : LEAD;
    var first = -1;
    hitRuns.some(function (run, i) {
      if (run.hl) {
        first = i;
      }
      return run.hl;
    });
    if (first < 0) {
      return hitRuns;
    }
    var lead = hitRuns.slice(0, first).map(function (run) { return run.text; }).join('');
    if (lead.length > leadMax) {
      lead = lead.slice(-leadMax).replace(/^\S*\s/, '');
    }
    var out = [{ text: lead, hl: false }];
    var used = lead.length;
    for (var i = first; i < hitRuns.length && used < LENGTH; i++) {
      var text = hitRuns[i].text;
      if (!hitRuns[i].hl && used + text.length > LENGTH) {
        text = text.slice(0, LENGTH - used).replace(/\s\S*$/, '');
      }
      out.push({ text: text, hl: hitRuns[i].hl });
      used += text.length;
    }
    return out;
  }

  // Where a hit's chip and highlight link to. Hits that could not be
  // located keep the item's own #search link.
  function hitHref(hit, href) {
    var parts = href.split('#');
    var item = parts[0];
    if (hit.kind === 'page' && hit.plain) {
      return item;
    }
    if (hit.kind === 'page') {
      return PAGE_LINKS_WITH_SEARCH && parts[1] ?
        item + '#' + parts[1] + '/page/' + hit.page :
        item + '#page/' + hit.page;
    }
    if (hit.kind === 'time') {
      return item + '#time/' + hit.time;
    }
    if (hit.kind === 'item') {
      return '/do/' + hit.item + (parts[1] ? '#' + parts[1] : '');
    }
    return href;
  }

  function snippet(hitRuns, href) {
    var out = el('span', 'search-match__text');
    out.appendChild(document.createTextNode('… '));
    // The snippet gets its own ellipses; drop any the source text already
    // starts or ends with, so it never reads "… …".
    var runs = around(hitRuns).map(function (run) {
      return { text: run.text, hl: run.hl };
    });
    if (runs.length && !runs[0].hl) {
      runs[0].text = runs[0].text.replace(/^[\s…]+/, '');
    }
    if (runs.length && !runs[runs.length - 1].hl) {
      runs[runs.length - 1].text = runs[runs.length - 1].text.replace(/[\s…]+$/, '');
    }
    runs.forEach(function (run) {
      if (run.hl && !href) {
        out.appendChild(el('strong', null, run.text));
      }
      else if (run.hl) {
        var strong = el('strong');
        var link = el('a', null, run.text);
        link.href = href;
        strong.appendChild(link);
        out.appendChild(strong);
      }
      else {
        out.appendChild(document.createTextNode(run.text));
      }
    });
    out.appendChild(document.createTextNode(' …'));
    return out;
  }

  // A collection hit names the member item it was found in.
  function nameItem(hit, snippetNode) {
    if (!window.fetch) {
      return;
    }
    fetch('/do/' + hit.item + '?_format=json', { credentials: 'same-origin' })
      .then(function (response) {
        return response.ok ? response.json() : null;
      })
      .then(function (json) {
        var title = json && json.title && json.title[0] && json.title[0].value;
        if (title) {
          snippetNode.insertBefore(el('span', 'search-match__context', title), snippetNode.firstChild);
        }
      })
      .catch(function () {
        // The chip still links to the item.
      });
  }

  // A list of hits, chip then snippet. Metadata hits have nowhere to link
  // to: their chip is a plain label.
  function hitList(hits, href) {
    var list = el('ul', 'search-match__hits');
    hits.forEach(function (hit) {
      var target = hit.kind === 'meta' ? '' : hitHref(hit, href);
      var item = el('li', 'search-match__hit search-match__hit--' + hit.kind);
      var chip;
      if (target) {
        chip = el('a', 'search-match__where', hit.label);
        chip.href = target;
      }
      else {
        chip = el('span', 'search-match__where search-match__where--static', hit.label);
      }
      item.appendChild(chip);
      var text = snippet(hit.runs, target);
      item.appendChild(text);
      if (hit.kind === 'item') {
        nameItem(hit, text);
      }
      list.appendChild(item);
    });
    return list;
  }

  function showHits(block, excerpt, hits, href, kind, limit) {
    block.classList.remove('search-match--fulltext');
    block.classList.add('search-match--' + kind);
    block.replaceChild(hitList(hits.slice(0, limit), href), excerpt);
  }

  function search(uuid, display, term) {
    var url = SEARCH_SERVICE.replace('{uuid}', uuid).replace('{display}', display) +
      '?q=' + encodeURIComponent(term);
    return fetch(url, { credentials: 'same-origin', headers: { Accept: 'application/json' } })
      .then(function (response) {
        if (!response.ok) {
          throw new Error(response.status);
        }
        return response.json();
      });
  }

  // Locates the full-text hits on pages, sheets or member items; anything
  // that cannot be located is shown as the `fallback` hits instead.
  function loadPageHits(block, excerpt, href, type, limit, fallback) {
    var match = /\/do\/([0-9a-f-]{36})#search\/(.+)$/.exec(href);
    if (!match || !window.fetch) {
      showHits(block, excerpt, fallback, href, 'fulltext', limit);
      return;
    }
    var uuid = match[1];
    var term = decodeURIComponent(match[2]);
    var displays = searchDisplays(type);

    block.classList.add('is-loading');
    // Ask each display in turn until one returns hits.
    var attempt = function (i) {
      if (i >= displays.length) {
        return Promise.resolve([]);
      }
      return search(uuid, displays[i], term)
        .then(function (json) {
          var hits = pageHits(json, type, uuid);
          return hits.length ? hits : attempt(i + 1);
        }, function () {
          return attempt(i + 1);
        });
    };
    attempt(0)
      .then(function (hits) {
        if (!hits.length) {
          showHits(block, excerpt, fallback, href, 'fulltext', limit);
          return;
        }
        // The service ranks by relevance; read in page order instead.
        hits.sort(function (a, b) {
          var pa = a.page === undefined ? null : a.page;
          var pb = b.page === undefined ? null : b.page;
          if (pa === pb) {
            return 0;
          }
          return pa === null ? 1 : (pb === null ? -1 : pa - pb);
        });
        // One chip per place: further hits on the same page (or in the
        // same member item) are dropped instead of repeating
        // "On map, On map".
        var seen = {};
        var places = hits.filter(function (hit) {
          var key = hit.kind + ':' + (hit.page || hit.item || '');
          if (hit.kind === 'text' || !seen[key]) {
            seen[key] = true;
            return true;
          }
          return false;
        });
        showHits(block, excerpt, places, href, places[0].kind === 'item' ? 'items' : 'pages', limit);
      })
      .catch(function () {
        showHits(block, excerpt, fallback, href, 'fulltext', limit);
      })
      .then(function () {
        block.classList.remove('is-loading');
      });
  }

  // The excerpt nodes, split at Archipelago's <br>: metadata excerpts, then
  // the full-text one (wrapped in \u201c \u2026 \u201d and holding the #search link).
  function segments(nodes) {
    var parts = [[]];
    nodes.forEach(function (node) {
      if (node.nodeType === 1 && node.tagName === 'BR') {
        parts.push([]);
      }
      else {
        parts[parts.length - 1].push(node);
      }
    });
    return parts.filter(function (part) {
      return unquote(flatten(part)).trim();
    });
  }

  function isFullText(part) {
    return /^\s*\u201c/.test(flatten(part)) || part.some(function (node) {
      return node.nodeType === 1 && node.querySelector('a[href*="#search/"]');
    });
  }

  function build(region) {
    var field = region.querySelector(':scope > .field');
    if (!field) {
      return;
    }
    // Everything after the metadata field is the excerpt.
    var nodes = [];
    for (var node = field.nextSibling; node; node = node.nextSibling) {
      nodes.push(node);
    }
    var fields = recordFields(region);
    var type = cardType(region);
    var fullNodes = [];
    var metaHits = [];
    segments(nodes).forEach(function (part) {
      if (isFullText(part)) {
        fullNodes = fullNodes.concat(part);
        return;
      }
      var hit = metadataHit(fields, runs(unquote(flatten(part)).trim()));
      if (hit) {
        metaHits.push(hit);
      }
    });
    var link = region.querySelector(':scope > strong a[href*="#search/"]');
    var href = link ? link.getAttribute('href') : '';
    var text = unquote(flatten(fullNodes)).trim();

    // The Match block replaces the excerpt, including a title-only one.
    nodes.forEach(function (n) {
      region.removeChild(n);
    });
    if (!text && !metaHits.length) {
      var found = fieldMatch(region);
      if (!found) {
        return;
      }
      metaHits.push(found);
    }

    var block = el('div', 'search-match search-match--' + (text ? 'fulltext' : 'metadata'));
    if (type) {
      block.classList.add('search-match--type-' + type);
    }
    block.appendChild(el('p', 'search-match__label', Drupal.t('Match:')));
    region.appendChild(block);

    // Full text, as one hit until it is located on pages or times.
    var excerpt = el('p', 'search-match__excerpt');
    var whole = [{ kind: 'text', label: textLabel(type), runs: runs(text) }];
    var mode = '';
    var hits = [];
    if (text) {
      fullNodes.forEach(function (n) {
        excerpt.appendChild(n);
      });
      block.appendChild(excerpt);
      if (hasCues(text)) {
        hits = transcriptHits(text, fields, type, metaHits);
        mode = hits.length ? 'transcript' : 'whole';
      }
      else if (!href || type === 'webpage' || AV_TYPES.indexOf(type) !== -1 || !window.DOMParser) {
        // No pages to find: archived web text, or a transcript without cues.
        mode = 'whole';
      }
      else {
        mode = 'pages';
      }
    }

    // Metadata goes last, one line of it beside full text.
    metaHits = mergeByLabel(metaHits);
    var metaShown = metaHits.slice(0, text ? 1 : MAX_HITS);
    if (metaShown.length) {
      block.appendChild(hitList(metaShown, href));
    }
    var limit = MAX_HITS - metaShown.length;
    if (mode === 'transcript') {
      showHits(block, excerpt, hits, href, 'transcript', limit);
    }
    else if (mode === 'whole') {
      showHits(block, excerpt, whole, href, 'fulltext', limit);
    }
    else if (mode === 'pages') {
      loadPageHits(block, excerpt, href, type, limit, whole);
    }
  }

  Drupal.behaviors.tamuSearchMatches = {
    attach: function (context) {
      once(
        'tamu-search-match',
        '.view-id-solr_search_content.view-display-id-page_1 .layout--twocol > .layout__region--second',
        context
      ).forEach(build);
    }
  };
})(Drupal, once);
