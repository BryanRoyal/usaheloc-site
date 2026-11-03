/* =====================================================================
   THE ROYAL FRONT DOOR  ·  front-door.js
   The intro screen's whole behaviour. No dependencies, no build step.

   Six things happen on a front door and this file is all six:
     1. THE ASK BAR       the real one, three tiers, never a dead click
     2. THE DEEP DOOR     the bubble that opens everything already built
     3. THE TOAST         an unwired coin acknowledges the tap
     4. THE SERVICE WORKER  registered if the site ships one
     5. THE iPHONE PILL   home-screen nudge, iOS Safari only, remembered
     6. NOTHING ELSE      nothing on this page opens by itself

   THE LEAVING-SITE NOTICE IS GONE (Bryan, 7/29/2026, and it reverses the
   external link law of 7/28). His ruling: we own all the sites and we
   monitor all the sites, so nothing gets in the way of speedy navigation
   between the portals. Every link is now an ordinary same-tab <a href>.
   No modal, no forced new-window target, no scripted window jump. Do not
   rebuild it, and do not build a softer one for third-party hosts either.
   THIS FILE IS THIS TREE'S OWN COPY and it now diverges on purpose from
   the shared master at Royal AI Launch\_royal-system\front-door\.

   Nothing here was invented. The hand-off is royalai.ai's, verbatim. The
   engine wiring is rm-dot-com/js/site.js wireAsk(), verbatim in behaviour,
   including its dead-end guard. Every user-facing string is either the
   page's own authored markup or a filed RoyalEngineClient rail.

   Royal Mortgage LLC · NMLS #2059962
   ===================================================================== */

(function () {
  'use strict';

  /* -------------------------------------------------------------------
     THE FILED RAILS.
     Mirrors of RoyalEngineClient.RAILS, used only when engine-client.js
     is not on the page at all. If either string changes in
     js/engine-client.js, change it here in the same commit - a front door
     and its engine must never say two different things.
     ------------------------------------------------------------------- */
  var CONCIERGE =
    'The assistant could not finish that one here - a licensed loan officer can pick it up right now, whenever you are ready.';

  function rail(name, fallback) {
    var c = window.RoyalEngineClient;
    return (c && c.RAILS && c.RAILS[name]) || fallback;
  }

  function $(id) { return document.getElementById(id); }


  /* ===================================================================
     1. THE ASK BAR

     THE ONE-ASSISTANT LAW (Bryan, 7/28/2026): this bar IS the assistant.
     There is no second affordance on this screen - no gold seat inside the
     input, no sleeping ball under the coins, no floating pill. Do not add
     one. On screen it is ROYAL Ai and only ROYAL Ai; the internal codename
     is kept out of every file that ships.

     THE LADDER. Three tiers, checked in this order, and the visitor is
     never left with a dead click on any of them.

       TIER 1  ENGINE LIVE
         <meta name="royal-engine" content="https://royal-claude-brain.onrender.com">
         AND window.RoyalEngineClient present.
         The real streaming ask. The answer paints into .a as it arrives,
         the engine's own follow-up line lands in .hook, and if the stream
         never produces a word the client's concierge line is put on
         screen rather than leaving a blank panel staring back. That last
         part is the dead-end guard and it is not optional.

       TIER 2  HAND-OFF   (what actually runs today on all five sites)
         The meta is empty, so the engine is not live here. royalai.ai's
         exact behaviour: echo the question, show the panel, and 450ms
         later carry the question to the deep ask page. NOTHING IS
         TRANSMITTED from this page. The panel's authored copy says
         exactly that and it must stay true.

       TIER 3  NO DEEP PAGE EITHER
         data-handoff="" on the form. The panel opens in place with the
         filed concierge line, which points at the one path that is always
         real - a human the visitor reaches themselves. It claims nothing
         about the question having reached anyone, because it has not.

     WHY AN EMPTY META MEANS TIER 2 AND NOT SAME-ORIGIN.
     rm-dot-com/js/site.js reads an empty endpoint as "same origin", which
     is right on a host that proxies the engine. These five sites are
     static cPanel docroots: a POST to /ask there is a 404, so an empty
     meta would mean asking a question, waiting, and getting the concierge
     line every single time - strictly worse than the hand-off that
     already works. Fill the meta the day the endpoint answers and TIER 1
     takes over with no other change to the page.
     =================================================================== */

  function engineEndpoint() {
    var m = document.querySelector('meta[name="royal-engine"]');
    return ((m && m.getAttribute('content')) || '').trim();
  }

  function wireAsk() {
    var form  = $('ask');
    var input = $('q');
    var panel = $('answer');
    if (!form || !input || !panel) return;

    /* THE OPT-OUT (Bryan, 7/29/2026 - THE SONNY BOX ruling).
       data-own-handler on the form means the page owns its own ask
       behaviour and this function must keep its hands off. royalai.ai's
       front door uses it: its box is a PERMANENTLY EMBEDDED answer surface
       with a hard few-hundred-millisecond deadline, which the three tiers
       below cannot express - TIER 2 navigates away and TIER 1 inherits the
       client's 45-second silence budget. The other five front doors are
       untouched and still run the ladder. Never quietly ignore this
       attribute: two submit handlers on one form is the bug it prevents. */
    if (form.hasAttribute('data-own-handler')) return;

    var echo = $('echo');
    var body = $('answerbody') || panel.querySelector('.a');
    var hook = $('answerhook') || panel.querySelector('.hook');
    var orb  = form.querySelector('button[type="submit"]');

    /* The authored copy, captured before anything overwrites it, so the
       hand-off tier can always put the page back exactly as written. */
    var authoredBody = body ? body.innerHTML : '';
    var authoredHook = hook ? hook.innerHTML : '';

    var endpoint = engineEndpoint();
    var client   = window.RoyalEngineClient;
    var live     = !!(endpoint && client);

    /* data-handoff absent  -> app.html (royalai.ai's default)
       data-handoff="x.html" -> x.html
       data-handoff=""       -> no deep page; answer in place (tier 3)   */
    var handoff = form.hasAttribute('data-handoff')
      ? form.getAttribute('data-handoff').trim()
      : 'app.html';

    /* The world this door belongs to, for the engine's context. Optional:
       <body data-world="royal-heloc">. */
    var world = document.body.getAttribute('data-world') || null;

    var busy = false;

    if (live) client.configure({ endpoint: endpoint });

    function show() { panel.classList.add('show'); }

    form.addEventListener('submit', function (e) {
      /* A real submit would reload the page out from under the answer. */
      e.preventDefault();

      var q = input.value.trim();
      if (!q || busy) return;

      if (echo) echo.textContent = 'You asked: ' + q;

      /* ---------------- TIER 1 : the engine is live ---------------- */
      if (live) {
        busy = true;
        if (orb) orb.setAttribute('aria-busy', 'true');
        if (body) body.textContent = '';
        if (hook) hook.textContent = '';
        panel.classList.add('thinking');
        show();

        client.ask(q, { world: world }, {
          onDelta: function (t) {
            panel.classList.remove('thinking');
            if (body) body.textContent += t;
          },
          onDone: function (info) {
            busy = false;
            panel.classList.remove('thinking');
            if (orb) orb.removeAttribute('aria-busy');
            /* THE DEAD-END GUARD. The answer paints from the delta
               stream, so when the engine never streams - unreachable,
               erroring, or empty - nothing at all lands in the answer
               line and the visitor is left staring at a blank panel
               after asking a question. The client already computed the
               concierge line for exactly this case; put it on screen.
               Only when the line is genuinely empty, so a real answer is
               never overwritten. */
            if (body && !body.textContent && info && info.text) {
              body.textContent = info.text;
            }
            if (hook) hook.textContent = (info && info.followup) || '';
          }
        });
        return;
      }

      /* ---------------- TIER 2 : hand off to the deep ask page ----------
         royalai.ai's behaviour, unchanged. The panel is the half second
         the visitor sees in between. Nothing is sent anywhere from here. */
      if (handoff) {
        if (body) body.innerHTML = authoredBody;
        if (hook) hook.innerHTML = authoredHook;
        show();
        busy = true;
        setTimeout(function () {
          location.href = handoff +
            (handoff.indexOf('?') > -1 ? '&' : '?') + 'q=' + encodeURIComponent(q);
        }, 450);
        return;
      }

      /* ---------------- TIER 3 : answer in place, honestly -------------- */
      if (body) body.textContent = rail('concierge', CONCIERGE);
      if (hook) hook.innerHTML = authoredHook;
      show();
    });
  }


  /* ===================================================================
     2. THE DEEP DOOR
     RULING 2, 7/28/2026: "keep all of the work that we just did located
     BEHIND ONE OF THE BUBBLES on the intro screen ... so we don't waste
     all of the work that we just did."

     Two modes, and the markup decides which one without a config flag:

       MODE TRAY   the door carries aria-controls pointing at a tray that
                   exists in the document. One touch opens it, a second
                   closes it, Escape closes it, and it starts closed on
                   every load because nothing on this page is allowed to
                   open by itself.
       MODE LINK   no such tray. The door is left completely alone and
                   behaves as the ordinary link it already is.

     Either way the href is a real page, so with JavaScript off the deep
     work is still one click away and is never lost.
     =================================================================== */

  function wireDeepDoor() {
    var door = document.querySelector('[data-deep-door]') || $('royalAiDoor');
    if (!door) return;

    var trayId = door.getAttribute('aria-controls');
    var tray = trayId ? $(trayId) : null;

    /* MODE LINK - nothing to wire. Do not preventDefault a real link. */
    if (!tray) {
      door.removeAttribute('aria-expanded');
      return;
    }

    function setOpen(on) {
      tray.classList.toggle('open', on);
      door.setAttribute('aria-expanded', on ? 'true' : 'false');
    }

    setOpen(false);

    door.addEventListener('click', function (e) {
      e.preventDefault();
      var opening = !tray.classList.contains('open');
      setOpen(opening);
      if (opening) {
        try { tray.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); }
        catch (err) { tray.scrollIntoView(false); }
      }
    });

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && tray.classList.contains('open')) {
        setOpen(false);
        door.focus();
      }
    });
  }


  /* ===================================================================
     3. THE TOAST
     A coin with a real href navigates. A coin staged at href="#" - a
     parked domain, a page not built yet - acknowledges the tap instead of
     doing nothing. Every tap gets an answer, never a dead click.
     =================================================================== */

  function wireCoins() {
    var toast = $('toast');
    document.querySelectorAll('.bubble').forEach(function (b) {
      b.addEventListener('click', function (e) {
        if (b.getAttribute('href') !== '#') return;
        e.preventDefault();
        if (!toast) return;
        toast.classList.add('show');
        clearTimeout(toast._h);
        toast._h = setTimeout(function () { toast.classList.remove('show'); }, 1600);
      });
    });
  }


  /* ===================================================================
     4. THE SERVICE WORKER
     Registered only if the site ships sw.js; a site that does not will
     404 and the catch swallows it silently. Bump the cache name in sw.js
     on every deploy or the stale build keeps serving itself.
     =================================================================== */

  function wireServiceWorker() {
    if (!('serviceWorker' in navigator)) return;
    if (location.protocol !== 'https:' && location.hostname !== 'localhost') return;
    /* THE try/catch IS NOT BELT AND BRACES - 2026-08-02, THE IFRAME PROGRAM.
       `'serviceWorker' in navigator` does not invoke the getter; reading
       navigator.serviceWorker DOES, and in a partitioned or storage-blocked
       THIRD-PARTY FRAME that getter can throw SecurityError synchronously
       rather than returning a promise for .catch() to swallow. This page is
       about to start being framed by the native app, which is exactly that
       context. A synchronous throw here does not just skip the service
       worker: it unwinds out of boot() and every later wiring step in it
       never runs. Cheap insurance against a whole page half-initialising in
       the one shell that matters most. */
    try {
      navigator.serviceWorker.register('sw.js').catch(function () {});
    } catch (err) { /* blocked in this context; the page is unaffected */ }
  }


  /* ===================================================================
     5. THE iPHONE HOME-SCREEN PILL
     iOS Safari in a browser tab only. Never inside the installed app,
     never on any other browser, and never again once it is waved away.
     =================================================================== */

  function wireHomeScreenPill() {
    var pill = $('a2hs');
    if (!pill) return;
    try {
      var ua = navigator.userAgent;
      var iosSafari = /iPad|iPhone|iPod/.test(ua) && !/CriOS|FxiOS|EdgiOS|OPiOS/.test(ua);
      var installed = (navigator.standalone === true) ||
        (window.matchMedia && matchMedia('(display-mode: standalone)').matches);
      if (!iosSafari || installed || localStorage.getItem('rai-a2hs')) return;

      pill.hidden = false;
      var x = $('a2hsX');
      if (x) {
        x.addEventListener('click', function () {
          pill.hidden = true;
          try { localStorage.setItem('rai-a2hs', '1'); } catch (err) {}
        });
      }
    } catch (err) { /* private mode, blocked storage - stay quiet */ }
  }


  /* =================================================================== */

  function boot() {
    wireAsk();
    wireDeepDoor();
    wireCoins();
    wireServiceWorker();
    wireHomeScreenPill();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
