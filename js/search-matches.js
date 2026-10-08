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
 * Every hit links to its place on the item page, from both its chip and its
 * highlighted words:
 *
 * - Pages: /do/{uuid}#search/{term}/page/{n} opens Mirador on that page
 *   with the term highlighted (see PAGE_LINKS_WITH_SEARCH for the viewer
 *   setting this depends on). Maps open in the Clover viewer, which cannot
 *   be pointed at a page or a word, so their hits link to the map itself.
 * - Times: /do/{uuid}#time/{seconds}, picked up by js/media-seek.js.
 * - Untimed transcript: the item, where the Clover viewer lists the
 *   transcript in its information panel (the A/V display's Clover
 *   formatter, with the panel's About and Annotations tabs on).
 * - Metadata: /do/{uuid}#field/{label}/q/{term}, the field's row with the
 *   words marked (js/match-focus.js); #q/{term} for "Details".
 * - Collections and series have no player and, for collections, no
 *   viewer: their transcript and full-text hits are in a member item
 *   (the side of an album, an interview in a collection). Which one is
 *   looked up when the reader first points at or focuses the link, by a
 *   phrase search for the hit's words among the members, and the link
 *   then goes to that item at that time. Until then, or if none is found,
 *   it goes to the collection or series page, which lists its members.
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

  // Types whose transcript and full text are their members' (see the file
  // comment): those hits link to the member they are found in.
  var PARENT_TYPES = ['collection', 'creativeworkseries'];

  // A result's metadata region, here and in fetched search pages.
  var REGION = '.view-id-solr_search_content.view-display-id-page_1 .layout--twocol > .layout__region--second';

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
      field: source ? source.field : '',
      label: source ? source.label : Drupal.t('Details'),
      runs: hitRuns
    };
  }

  function runsText(hitRuns) {
    return norm(hitRuns.map(function (run) { return run.text; }).join(''));
  }

  // The field sharing the most words with a hit, for text that runs field
  // labels and values together ("Title Charting Texas Abstract This
  // exhibition …", a collection's own canvas). Title is left out, as it is
  // for metadata hits; null when no field shares three words.
  function bestField(fields, hitRuns) {
    var words = runsText(hitRuns).split(' ').filter(function (word) {
      return word.length > 2;
    });
    var best = null;
    fields.forEach(function (field) {
      if (field.field === 'title') {
        return;
      }
      var own = ' ' + field.text + ' ';
      var shared = words.filter(function (word) {
        return own.indexOf(' ' + word + ' ') !== -1;
      }).length;
      if (shared >= 3 && (!best || shared > best.shared)) {
        best = { field: field, shared: shared };
      }
    });
    return best ? best.field : null;
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
          field: nodes[i].getAttribute('data-field'),
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
        // The file's header, when the hit is in its first cue.
        .replace(/^\s*WEBVTT\b/, ' ')
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
        // On the collection's own canvas: its description, on its page.
        hit.own = !!canvas;
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

  // The words searched for: the term in the item's #search link, else the
  // search box.
  function searchTerm(href) {
    var match = /#search\/([^/]+)/.exec(href || '');
    if (match) {
      try {
        return decodeURIComponent(match[1]);
      }
      catch (e) {
        return match[1];
      }
    }
    return searchWords().join(' ');
  }

  // The item's own page: its #search link without the fragment, or the
  // card's title link when the excerpt has no link (metadata matches).
  function itemUrl(region, href) {
    if (href) {
      return href.split('#')[0];
    }
    var card = region.closest('.layout--twocol') || region;
    var link = card.querySelector('a[href*="/do/"]');
    return link ? link.getAttribute('href').split('#')[0] : '';
  }

  // Where a hit's chip and highlight link to, on the item `ctx` describes:
  // {item, href (its #search link, if any), term, type}.
  function hitHref(hit, ctx) {
    var item = ctx.item;
    var parts = (ctx.href || '').split('#');
    var q = ctx.term ? 'q/' + encodeURIComponent(ctx.term) : '';
    if (!item) {
      return ctx.href || '';
    }
    if (hit.kind === 'meta' || hit.own) {
      // A "Details" chip, or a collection's own text, names no field: the
      // item page finds the words.
      var at = hit.field ? 'field/' + encodeURIComponent(hit.label) + (q ? '/' + q : '') : q;
      return at ? item + '#' + at : item;
    }
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
    if (AV_TYPES.indexOf(ctx.type) !== -1) {
      // Nothing on an A/V page reads #search; the viewer shows the
      // transcript.
      return item;
    }
    return ctx.href || item;
  }

  /* ---------------------------------------------------------------
     Members of collections and series
     --------------------------------------------------------------- */

  // A few words around a hit's first highlight, for a phrase search: up to
  // four either side, as Search API indexes them (no punctuation).
  function phrases(hitRuns) {
    var first = -1;
    hitRuns.some(function (run, i) {
      if (run.hl) {
        first = i;
      }
      return run.hl;
    });
    if (first < 0) {
      return [];
    }
    var words = function (list) {
      return norm(list.map(function (run) { return run.text; }).join('')).split(' ').filter(Boolean);
    };
    var before = words(hitRuns.slice(0, first)).slice(-4);
    var hl = words([hitRuns[first]]);
    var after = words(hitRuns.slice(first + 1)).slice(0, 4);
    // A transcript's indexed text has cue timings between its lines, which
    // the hit's words no longer show: a phrase across two lines finds
    // nothing, so shorter ones are tried after it.
    var out = [before.concat(hl, after), hl.concat(after), before.concat(hl), hl]
      .map(function (list) { return list.join(' '); })
      .filter(Boolean);
    return out.filter(function (text, i) {
      return out.indexOf(text) === i;
    });
  }

  // The members a series lists on its own page; a collection's are found
  // with the search page's collection filter instead.
  var childrenOf = {};
  function seriesChildren(item) {
    if (!childrenOf[item]) {
      childrenOf[item] = fetch(item, { credentials: 'same-origin' })
        .then(function (response) {
          return response.ok ? response.text() : '';
        })
        .then(function (html) {
          var doc = new DOMParser().parseFromString(html, 'text/html');
          return Array.prototype.map.call(
            doc.querySelectorAll('.view-id-creative_work_series_children a[href*="/do/"]'),
            function (link) {
              return link.getAttribute('href').split('#')[0].replace(/^https?:\/\/[^/]+/, '');
            }
          );
        })
        .catch(function () {
          return [];
        });
    }
    return childrenOf[item];
  }

  // Search results for a phrase among the members, parsed as on this page.
  function memberResults(text, ctx) {
    var url = '/search?search_api_fulltext=' + encodeURIComponent('"' + text + '"');
    if (ctx.type === 'collection' && ctx.title) {
      url += '&' + encodeURIComponent('f[0]') + '=' +
        encodeURIComponent('is_member_of_content_title:' + ctx.title);
    }
    return fetch(url, { credentials: 'same-origin' })
      .then(function (response) {
        return response.ok ? response.text() : '';
      })
      .then(function (html) {
        var doc = new DOMParser().parseFromString(html, 'text/html');
        return Array.prototype.map.call(doc.querySelectorAll(REGION), parse)
          .filter(function (result) {
            return result && result.item && result.item !== ctx.item;
          });
      });
  }

  // The member a parent's hit is in. A timed hit takes the member whose own
  // transcript has a hit nearest that time; anything else the first member
  // the phrase finds.
  function pickMember(results, hit) {
    if (hit.kind !== 'time') {
      return results[0] || null;
    }
    var best = null;
    results.forEach(function (result) {
      if (!hasCues(result.text)) {
        return;
      }
      transcriptHits(result.text, result.fields, result.type, []).forEach(function (own) {
        if (own.time === null) {
          return;
        }
        var off = Math.abs(own.time - hit.time);
        if (!best || off < best.off) {
          best = { result: result, off: off };
        }
      });
    });
    return best ? best.result : (results[0] || null);
  }

  // Where a parent's hit is in a member: {href, title}, or null if no
  // member is found.
  function memberHref(hit, ctx) {
    var tries = phrases(hit.runs);
    var allowed = ctx.type === 'creativeworkseries' ? seriesChildren(ctx.item) : Promise.resolve(null);
    return allowed.then(function (children) {
      var attempt = function (i) {
        if (i >= tries.length) {
          return null;
        }
        return memberResults(tries[i], ctx).then(function (results) {
          if (children && children.length) {
            results = results.filter(function (result) {
              return children.indexOf(result.item.replace(/^https?:\/\/[^/]+/, '')) !== -1;
            });
          }
          var member = pickMember(results, hit);
          if (!member) {
            return attempt(i + 1);
          }
          return {
            title: member.title,
            href: hitHref(hit, {
              item: member.item,
              // Its own #search link carries the phrase, not what was searched.
              href: ctx.term ? member.item + '#search/' + encodeURIComponent(ctx.term) : '',
              term: ctx.term,
              type: member.type
            })
          };
        });
      };
      return attempt(0);
    });
  }

  // Member lookups run two at a time, so a page of collection results does
  // not send every search at once.
  var LOOKUPS = 2;
  var running = 0;
  var queued = [];
  function queue(task) {
    return new Promise(function (resolve) {
      queued.push(function () {
        running++;
        task().then(resolve, function () {
          resolve(null);
        }).then(function () {
          running--;
          if (queued.length) {
            queued.shift()();
          }
        });
      });
      if (running < LOOKUPS) {
        queued.shift()();
      }
    });
  }

  // A parent's hit, pointed at its member once that is known: the links
  // change to the member, the snippet is headed by the member's title (as
  // a collection's page hits are, see nameItem) and a full-text chip says
  // "Item". Looked up as soon as the result is shown; a click before then
  // waits for it. Until then, and if no member is found, the links go to
  // the collection or series page, which lists its members.
  function linkToMember(hit, ctx, chip, snippetNode) {
    var links = [chip].concat(Array.prototype.slice.call(snippetNode.querySelectorAll('a')));
    var done = false;
    var pending = queue(function () {
      return memberHref(hit, ctx);
    }).then(function (member) {
      done = true;
      links.forEach(function (link) {
        link.classList.remove('is-resolving');
      });
      if (member) {
        links.forEach(function (link) {
          link.href = member.href;
        });
        if (member.title) {
          snippetNode.insertBefore(el('span', 'search-match__context', member.title), snippetNode.firstChild);
        }
        if (hit.kind === 'text') {
          chip.textContent = Drupal.t('Item');
        }
      }
      return member;
    });
    links.forEach(function (link) {
      link.addEventListener('click', function (event) {
        // Modifier clicks open a new tab, which cannot wait.
        if (done || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) {
          return;
        }
        event.preventDefault();
        links.forEach(function (each) {
          each.classList.add('is-resolving');
        });
        pending.then(function (member) {
          window.location.href = member ? member.href : link.href;
        });
      });
    });
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

  // A list of hits, chip then snippet, each linking to its place (see
  // hitHref). A chip only stays a plain label if the item has no link.
  function hitList(hits, ctx) {
    var list = el('ul', 'search-match__hits');
    hits.forEach(function (hit) {
      var target = hitHref(hit, ctx);
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
      if (target && !hit.own && PARENT_TYPES.indexOf(ctx.type) !== -1 &&
        (hit.kind === 'time' || hit.kind === 'text')) {
        linkToMember(hit, ctx, chip, text);
      }
      list.appendChild(item);
    });
    return list;
  }

  function showHits(block, excerpt, hits, ctx, kind, limit) {
    block.classList.remove('search-match--fulltext');
    block.classList.add('search-match--' + kind);
    block.replaceChild(hitList(hits.slice(0, limit), ctx), excerpt);
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
  function loadPageHits(block, excerpt, ctx, limit, fallback) {
    var type = ctx.type;
    var match = /\/do\/([0-9a-f-]{36})#search\/(.+)$/.exec(ctx.href);
    if (!match || !window.fetch) {
      showHits(block, excerpt, fallback, ctx, 'fulltext', limit);
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
          showHits(block, excerpt, fallback, ctx, 'fulltext', limit);
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
        // A collection's own text is named by the field it is in.
        places.forEach(function (hit) {
          var field = hit.own ? bestField(ctx.fields, hit.runs) : null;
          if (field) {
            hit.field = field.field;
            hit.label = field.label;
          }
        });
        showHits(block, excerpt, places, ctx, places[0].kind === 'item' ? 'items' : 'pages', limit);
      })
      .catch(function () {
        showHits(block, excerpt, fallback, ctx, 'fulltext', limit);
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

  // A result's excerpt, read without changing the page: the nodes after
  // the metadata field, its metadata hits, its full text and its link.
  // Also used on search pages fetched to find a collection's member.
  function parse(region) {
    var field = region.querySelector(':scope > .field');
    if (!field) {
      return null;
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
    return {
      nodes: nodes,
      fields: fields,
      type: type,
      fullNodes: fullNodes,
      metaHits: metaHits,
      href: href,
      item: itemUrl(region, href),
      title: cardTitle(region),
      text: unquote(flatten(fullNodes)).trim()
    };
  }

  // The result's title, which the collection filter matches on.
  function cardTitle(region) {
    var card = region.closest('.layout--twocol') || region;
    var title = card.querySelector('.layout__region--top h2, h2');
    return title ? title.textContent.replace(/\s+/g, ' ').trim() : '';
  }

  function build(region) {
    var result = parse(region);
    if (!result) {
      return;
    }
    var fields = result.fields;
    var type = result.type;
    var fullNodes = result.fullNodes;
    var metaHits = result.metaHits;
    var href = result.href;
    var text = result.text;
    var ctx = {
      item: result.item,
      href: href,
      term: searchTerm(href),
      type: type,
      title: result.title,
      fields: fields
    };

    // The Match block replaces the excerpt, including a title-only one.
    result.nodes.forEach(function (n) {
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
      block.appendChild(hitList(metaShown, ctx));
    }
    var limit = MAX_HITS - metaShown.length;
    if (mode === 'transcript') {
      showHits(block, excerpt, hits, ctx, 'transcript', limit);
    }
    else if (mode === 'whole') {
      showHits(block, excerpt, whole, ctx, 'fulltext', limit);
    }
    else if (mode === 'pages') {
      loadPageHits(block, excerpt, ctx, limit, whole);
    }
  }

  Drupal.behaviors.tamuSearchMatches = {
    attach: function (context) {
      once('tamu-search-match', REGION, context).forEach(build);
    }
  };
})(Drupal, once);
