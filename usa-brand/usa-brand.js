/* ============================================================================
   USA HELOC - the two small behaviours the preview adds (2026-11-01)
     1. A topic coin fills the ask bar with its question and SENDS it (11/3 PM, Bryan:
        "get everything functioning properly and quickly"): one tap, one answer. The
        plain ASK coin only brings the bar. Contact goes to #contact.
     2. (the preview chip was removed by tools/build_live.py for the live site)
   ========================================================================== */
(function () {
  var root = document.documentElement;

  /* 1. topic coins -> the ask bar */
  function prefill(text) {
    var q = document.getElementById('q');
    var form = document.getElementById('ask');
    if (!q) return;
    if (text) q.value = text;
    if (typeof window.RoverFitBox === 'function') window.RoverFitBox();
    if (typeof window.RoverBringBar === 'function') window.RoverBringBar();
    else { try { q.focus(); } catch (e) {} }
    if (!text || !form) return;                 /* the plain ASK coin: bring the bar only */
    /* send it: the page's own submit handler takes the question to the brain */
    if (typeof form.requestSubmit === 'function') form.requestSubmit();
    else form.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
  }
  var coins = document.querySelectorAll('[data-usa-ask]');
  for (var i = 0; i < coins.length; i++) {
    coins[i].addEventListener('click', function (e) {
      e.preventDefault();
      prefill(this.getAttribute('data-usa-ask') || '');
    });
  }

})();
