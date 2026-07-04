(function () {
  'use strict';

  var appConfig = typeof CONFIG !== 'undefined' ? CONFIG : window.CONFIG;
  var measurementId = appConfig && appConfig.API && appConfig.API.GA_MEASUREMENT_ID;

  window.GemelHubAnalytics = window.GemelHubAnalytics || {
    ready: false,
    measurementId: measurementId || '',
    track: function () {}
  };

  if (!measurementId || window.__GEMELHUB_GA_LOADED__) return;
  window.__GEMELHUB_GA_LOADED__ = true;

  window.dataLayer = window.dataLayer || [];
  function gtag() {
    window.dataLayer.push(arguments);
  }
  window.gtag = window.gtag || gtag;

  var script = document.createElement('script');
  script.async = true;
  script.src = 'https://www.googletagmanager.com/gtag/js?id=' + encodeURIComponent(measurementId);
  document.head.appendChild(script);

  window.gtag('js', new Date());
  window.gtag('config', measurementId, {
    anonymize_ip: true,
    send_page_view: true
  });

  window.GemelHubAnalytics.ready = true;
  window.GemelHubAnalytics.measurementId = measurementId;
  window.GemelHubAnalytics.track = function (name, params) {
    if (!name || typeof window.gtag !== 'function') return;
    window.gtag('event', name, params || {});
  };
})();
