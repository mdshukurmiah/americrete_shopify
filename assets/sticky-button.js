if (!customElements.get('sticky-button')) {
  customElements.define(
    'sticky-button',
    class StickyButton extends HTMLElement {
      constructor() {
        super();
      }

      connectedCallback() {
        const el = this;
        this.cartButton = this.querySelector('[data-link-add-to-cart]');

        const checkScroll = () => {
          const scrollValue = parseFloat(el.getAttribute('data-scroll') ?? '70');
          const scrollAt = scrollValue / 100;

          const pageWrapper = document.querySelector('.page-wrapper');
          const isDesktop = window.matchMedia('(min-width: 990px)').matches;
          const container = (isDesktop && pageWrapper) ? pageWrapper : (document.scrollingElement || document.documentElement);

          const scrollTop = container.scrollTop;
          const viewportHeight = container.clientHeight;
          const pageHeight = container.scrollHeight;

          const maxScroll = pageHeight - viewportHeight;
          const scrollProgress = maxScroll > 0 ? (scrollTop / maxScroll) : 0;

          if (scrollProgress >= scrollAt) {
            el.classList.add('is-sticky');
          } else {
            el.classList.remove('is-sticky');
          }
        };

        const pageWrapper = document.querySelector('.page-wrapper');
        if (pageWrapper) {
          pageWrapper.addEventListener('scroll', checkScroll);
        }
        window.addEventListener('scroll', checkScroll);

        // Run once on load/initialization
        checkScroll();

        if (this.cartButton) {
          this.cartButton.addEventListener('click', () => {
            const formBtn = document.querySelector('form[data-type="add-to-cart-form"] button[type="submit"]')
              || document.querySelector('button[name="add"]')
              || document.querySelector('form.product-single__form button[type="submit"]');
            formBtn?.click();
          });
        }
      }
    }
  );
}
