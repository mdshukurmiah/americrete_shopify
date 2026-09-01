import { Component } from '@theme/component';
import { ThemeEvents, ZoomMediaSelectedEvent } from '@theme/events';
import { StandardEvents, ProductSelectEvent } from '@shopify/events';

/**
 * A custom element that renders a media gallery.
 *
 * @typedef {object} Refs
 * @property {import('./zoom-dialog').ZoomDialog} [zoomDialogComponent] - The zoom dialog component.
 * @property {import('./slideshow').Slideshow} [slideshow] - The slideshow component.
 * @property {HTMLElement[]} [media] - The media elements.
 *
 * @extends Component<Refs>
 */
export class MediaGallery extends Component {
  connectedCallback() {
    super.connectedCallback();

    const { signal } = this.#controller;
    const target = this.closest('.shopify-section, dialog');

    target?.addEventListener(StandardEvents.productSelect, this.#handleProductSelect, { signal });
    this.refs.zoomDialogComponent?.addEventListener(ThemeEvents.zoomMediaSelected, this.#handleZoomMediaSelected, {
      signal,
    });

    // Apply variant-specific media filtering and ordering
    this.updateVariantGallery();
  }

  #controller = new AbortController();

  disconnectedCallback() {
    super.disconnectedCallback();

    this.#controller.abort();
  }

  /**
   * Handles a product select event by updating media gallery items and replacing DOM.
   *
   * @param {ProductSelectEvent} event - The product select event.
   */
  #handleProductSelect = (event) => {
    if (!(event.target instanceof Element) || event.target.closest('product-card')) return;

    const variantId = event.detail?.resource?.id || event.detail?.variantId || event.detail?.variant?.id;
    if (variantId) {
      this.updateVariantGallery(variantId);
    }

    event.promise
      .then(({ detail }) => {
        const activeVarId = detail?.resource?.id || detail?.variant?.id || variantId;
        if (activeVarId) {
          this.updateVariantGallery(activeVarId);
        }

        if (!detail?.html) return;

        const newMediaGallery = detail.html.querySelector('media-gallery');
        if (!newMediaGallery) return;

        this.replaceWith(newMediaGallery);
      })
      .catch((error) => {
        if (error?.name !== 'AbortError') console.warn('[media-gallery] Event promise rejected:', error);
      });
  };

  /**
   * Dynamically filters and orders media slides & thumbnails according to selected variant specifications in gallery.md
   * @param {string | number} [variantId] - The ID of the currently selected variant.
   */
  updateVariantGallery(variantId) {
    const script = this.querySelector('.variant-gallery-data');
    if (!script) return;

    let data;
    try {
      data = JSON.parse(script.textContent);
    } catch (e) {
      return;
    }

    const { product_featured_media_id, variants } = data;
    const activeVariantId = variantId || this.getSelectedVariantId();
    const variantData = activeVariantId && variants ? variants[activeVariantId] : null;

    // Collect all other variants' media IDs to exclude them when a variant is selected
    const otherVariantMediaIds = new Set();
    if (variants) {
      Object.keys(variants).forEach((vId) => {
        if (!activeVariantId || String(vId) !== String(activeVariantId)) {
          const v = variants[vId];
          if (v.featured_media_id) otherVariantMediaIds.add(String(v.featured_media_id));
          if (Array.isArray(v.variant_gallery)) {
            v.variant_gallery.forEach((gId) => {
              const strId = String(gId).trim();
              if (strId) otherVariantMediaIds.add(strId);
            });
          }
        }
      });
    }

    const targetMediaIds = [];
    const addedSet = new Set();

    if (variantData) {
      // 1. Selected Variant Featured Image
      if (variantData.featured_media_id) {
        const featId = String(variantData.featured_media_id);
        targetMediaIds.push(featId);
        addedSet.add(featId);
      }

      // 2. Selected Variant Gallery Media
      if (Array.isArray(variantData.variant_gallery)) {
        variantData.variant_gallery.forEach((gId) => {
          const idStr = String(gId).trim();
          if (idStr && !addedSet.has(idStr)) {
            targetMediaIds.push(idStr);
            addedSet.add(idStr);
          }
        });
      }

      // 3. Product Media (excluding product featured media & other variants' media)
      const allMediaElements = Array.from(this.querySelectorAll('[data-media-id]'));
      allMediaElements.forEach((el) => {
        const mId = String(el.dataset.mediaId);
        if (mId === String(product_featured_media_id)) return;
        if (otherVariantMediaIds.has(mId)) return;
        if (!addedSet.has(mId)) {
          targetMediaIds.push(mId);
          addedSet.add(mId);
        }
      });
    } else {
      // NO VARIANT SELECTED
      // 1. Product Featured Image
      if (product_featured_media_id) {
        const prodFeatId = String(product_featured_media_id);
        targetMediaIds.push(prodFeatId);
        addedSet.add(prodFeatId);
      }

      // 2. Product Media (excluding product featured image)
      const allMediaElements = Array.from(this.querySelectorAll('[data-media-id]'));
      allMediaElements.forEach((el) => {
        const mId = String(el.dataset.mediaId);
        if (!addedSet.has(mId)) {
          targetMediaIds.push(mId);
          addedSet.add(mId);
        }
      });
    }

    // Filter & reorder containers (slideshow slides, thumbnails, grid)
    const containers = [
      this.querySelector('slideshow-slides'),
      this.querySelector('.slideshow-controls__thumbnails'),
      this.querySelector('.media-gallery__grid')
    ];

    containers.forEach((container) => {
      if (!container) return;

      const children = Array.from(container.children);
      const elMap = new Map();

      children.forEach((child) => {
        const mId = child.dataset.mediaId || child.querySelector('[data-media-id]')?.dataset.mediaId;
        if (mId) elMap.set(String(mId), child);
      });

      // Hide all child items first
      children.forEach((child) => {
        child.style.display = 'none';
      });

      // Show & reorder matching target items
      let idx = 0;
      targetMediaIds.forEach((mId) => {
        const child = elMap.get(mId);
        if (child) {
          child.style.display = '';
          container.appendChild(child);

          if (child.tagName === 'BUTTON' && child.classList.contains('slideshow-control')) {
            child.setAttribute('on:click', `/select/${idx}`);
            child.setAttribute('aria-selected', idx === 0 ? 'true' : 'false');
          }
          idx++;
        }
      });
    });

    // Reset active slide to first slide (index 0)
    if (this.slideshow) {
      this.slideshow.select(0, undefined, { animate: false });
    }
  }

  getSelectedVariantId() {
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.has('variant')) return urlParams.get('variant');

    const variantScript = document.querySelector('variant-picker script[type="application/json"]');
    if (variantScript) {
      try {
        const data = JSON.parse(variantScript.textContent);
        if (data && data.id) return data.id;
      } catch (e) {}
    }

    const selectedInput = document.querySelector('variant-picker input:checked[data-variant-id], variant-picker select option[selected][data-variant-id], variant-picker [data-variant-id]');
    if (selectedInput) {
      return selectedInput.dataset.variantId;
    }
    return null;
  }

  /**
   * Handles the 'zoom-media:selected' event.
   * @param {ZoomMediaSelectedEvent} event - The zoom-media:selected event.
   */
  #handleZoomMediaSelected = async (event) => {
    this.slideshow?.select(event.detail.index, undefined, { animate: false });
  };

  /**
   * Zooms the media gallery.
   *
   * @param {number} index - The index of the media to zoom.
   * @param {PointerEvent} event - The pointer event.
   */
  zoom(index, event) {
    this.refs.zoomDialogComponent?.open(index, event);
  }

  /**
   * Preloads an image.
   * @param {number} index - The index of the media to preload.
   */
  preloadImage(index) {
    const zoomDialogMedia = this.refs.zoomDialogComponent?.refs.media[index];
    if (!zoomDialogMedia) return;

    this.refs.zoomDialogComponent?.loadHighResolutionImage(zoomDialogMedia);
  }

  get slideshow() {
    return this.refs.slideshow;
  }

  get media() {
    return this.refs.media;
  }

  get presentation() {
    return this.dataset.presentation;
  }
}

if (!customElements.get('media-gallery')) {
  customElements.define('media-gallery', MediaGallery);
}
