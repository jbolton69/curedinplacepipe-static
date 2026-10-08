/* theme-init.js — the parts of the old theme.js the site actually uses.
   Bundled after jQuery + owl carousel + meanmenu + waypoints + counterup + scrollUp by
   tools/build-assets.mjs. Everything here runs after the DOM is parsed (the bundle is
   loaded with `defer`). Removed: nivo slider, revolution slider, isotope, WOW, venobox,
   barfiller, animated-text, imagesloaded, the calendar widget — none exist on any page. */
(function ($) {
  'use strict';

  // Mobile menu (meanmenu)
  $('.mobile-menu nav').meanmenu({
    meanScreenWidth: '990',
    meanMenuContainer: '.mobile-menu',
    onePage: false
  });

  // Header search / "Find Contractors" overlay
  if ($('.search-box-outer').length) {
    $('.search-box-outer').on('click', function () { $('body').addClass('search-active'); });
    $('.close-search').on('click', function () { $('body').removeClass('search-active'); });
  }

  // Sticky header + go-top button
  var wind = $(window);
  var sticky = $('#sticky-header');
  wind.on('scroll', function () {
    var scroll = wind.scrollTop();
    if (scroll < 100) sticky.removeClass('sticky'); else sticky.addClass('sticky');
    if (scroll > 300) $('.go-top').addClass('active'); else $('.go-top').removeClass('active');
  });
  $('.go-top').on('click', function () { $('html, body').animate({ scrollTop: '0' }, 1200); });

  // Hero slider (home)
  $('.slider_list').owlCarousel({
    loop: true, autoplay: false, autoplayTimeout: 10000, dots: false, nav: true,
    navText: ["<i class='fas fa-chevron-left'></i>", "<i class='fas fa-chevron-right'></i>"],
    responsive: { 0: { items: 1 } }
  });

  // Blog carousel (home) — same options the inline script in base.njk used
  $('.blog_list.owl-carousel').owlCarousel({
    loop: true, margin: 30, nav: true, dots: false, autoplay: true, smartSpeed: 700,
    responsive: { 0: { items: 1 }, 600: { items: 2 }, 1000: { items: 3 } }
  });

  // Counters (home)
  if ($.fn.counterUp) $('.counter').counterUp({ delay: 10, time: 1000 });

  $('body').addClass('loaded');

  // scrollUp
  if ($.scrollUp) $.scrollUp({ scrollText: '<i class="fa fa-angle-up"></i>', easingType: 'linear', scrollSpeed: 900, animation: 'fade' });
})(jQuery);
