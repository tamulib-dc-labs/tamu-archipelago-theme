/**
 * @file
 * Card type and date under the title.
 *
 * On .tamu-card grids the metadata display only renders inside the image
 * box, so the card thumbnail template (TAMU Custom Simple Card Thumbnail)
 * puts its "[Type] Date" line there, after the image, with the hidden
 * attribute. This moves it under the card title and shows it; without
 * JavaScript it stays hidden.
 */
(function (Drupal, once) {
  'use strict';

  Drupal.behaviors.tamuCardMeta = {
    attach: function (context) {
      once('tamu-card-meta', '.tamu-card .tamu-card__image .tamu-card__meta', context).forEach(function (meta) {
        var card = meta.closest('.tamu-card');
        var title = card.querySelector('.tamu-card__title');
        if (title) {
          title.after(meta);
          meta.hidden = false;
        }
      });
    }
  };
})(Drupal, once);
