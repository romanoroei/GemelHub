(function () {
  const STORAGE_KEY = 'gemelhub_cookie_notice_closed_v2';
  const FORCE_SHOW_PARAM = 'showCookieBanner';
  const FORCE_SHOW_VALUE = '1';

  function shouldForceShow() {
    try {
      return new URLSearchParams(window.location.search).get(FORCE_SHOW_PARAM) === FORCE_SHOW_VALUE;
    } catch (error) {
      return false;
    }
  }

  function renderBanner(banner) {
    banner.innerHTML = `
      <div class="cookie-banner-inner cookie-banner-inner-minimal">
        <p>האתר עושה שימוש בעוגיות לצורך שיפור חוויית המשתמש וניתוח נתונים.</p>
        <div class="cookie-banner-actions">
          <button type="button" class="cookie-btn cookie-btn-primary" id="cookie-accept">הבנתי</button>
        </div>
      </div>
    `;
  }

  function closeBanner() {
    const banner = document.getElementById('cookie-banner');
    if (!banner) return;
    localStorage.setItem(STORAGE_KEY, '1');
    document.documentElement.classList.remove('show-cookie-banner');
    banner.style.display = 'none';
  }

  function initCookieBanner() {
    const banner = document.getElementById('cookie-banner');
    if (!banner) return;

    renderBanner(banner);

    if (!shouldForceShow() && localStorage.getItem(STORAGE_KEY) === '1') {
      banner.style.display = 'none';
      return;
    }

    banner.style.display = '';
  }

  document.addEventListener('click', function (event) {
    const target = event.target.closest('#cookie-accept');
    if (!target) return;
    closeBanner();
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initCookieBanner);
  } else {
    initCookieBanner();
  }
})();
