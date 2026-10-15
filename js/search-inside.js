/**
 * @file
 * Search inside book/document pages (/search_pages): bold the searched
 * words in the page snippets, as /search and /search_websites do. The
 * pages display shows the start of each page's text without Search API's
 * highlighting.
 */
(function (Drupal, once) {
  'use strict';

  function escapeRegExp(text) {
    return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  /**
   * Wraps each match of `pattern` in the text nodes under `root` in a
   * <strong>.
   */
  function highlight(root, pattern) {
    var walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    var nodes = [];
    while (walker.nextNode()) {
      nodes.push(walker.currentNode);
    }
    nodes.forEach(function (node) {
      var text = node.nodeValue;
      pattern.lastIndex = 0;
      if (!pattern.test(text)) {
        return;
      }
      var fragment = document.createDocumentFragment();
      var last = 0;
      pattern.lastIndex = 0;
      text.replace(pattern, function (match, offset) {
        fragment.appendChild(document.createTextNode(text.slice(last, offset)));
        var strong = document.createElement('strong');
        strong.textContent = match;
        fragment.appendChild(strong);
        last = offset + match.length;
        return match;
      });
      fragment.appendChild(document.createTextNode(text.slice(last)));
      node.parentNode.replaceChild(fragment, node);
    });
  }

  Drupal.behaviors.tamuSearchInside = {
    attach: function (context) {
      once('tamu-search-inside', '.tamu-search-inside--pages', context).forEach(function (view) {
        var input = view.querySelector('.views-exposed-form input[name="page_text"]');
        var words = (input ? input.value : '')
          .replace(/["()]/g, ' ')
          .split(/\s+/)
          .filter(function (word) {
            return word.length > 1 && !/^(AND|OR|NOT)$/.test(word);
          })
          .map(escapeRegExp);
        if (!words.length) {
          return;
        }
        var pattern = new RegExp('\\b(?:' + words.join('|') + ')', 'gi');
        view.querySelectorAll('.views-field-sbf-plaintext .field-content').forEach(function (snippet) {
          if (!snippet.querySelector('strong')) {
            highlight(snippet, pattern);
          }
        });
      });
    }
  };
})(Drupal, once);
