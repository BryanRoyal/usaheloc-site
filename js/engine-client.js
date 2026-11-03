/* ============================================================
   ROYAL Ai — THE BROWSER CLIENT
   One file, no dependencies, no build step. Drop it on any
   surface the ask bar lives on: the app worlds, royalai.ai, or
   a Royal-hosted page inside the vendor's Web Portal iframe.

   It never holds a key. It talks to the engine, streams the
   answer in, and if the engine is unreachable it falls back to
   the concierge line — the borrower never sees a dead end.

     RoyalEngineClient.configure({ endpoint: 'https://royal-claude-brain.onrender.com' })
     RoyalEngineClient.ask('What does escrow mean?', { world: 'contract' }, {
       onDelta: t => …,
       onDone:  info => …,
     })
   ============================================================ */

(function (global) {
  'use strict';

  /* Said when the engine could not produce an answer — unreachable, erroring,
     or empty. Deliberately claims NOTHING about the question having reached
     anyone: on the unreachable path that claim would be false, and a false
     receipt is the one thing this line must never be. It only points at the
     path that is always real — a human the borrower reaches themselves. */
  var CONCIERGE =
    'The assistant could not finish that one here — a licensed loan officer can pick it up right now, whenever you are ready.';
  var ASK_FINE =
    'Answers are information, not advice or an offer. A licensed loan officer is one tap away, ' +
    'and a human underwriter reviews and signs every decision.';
  var SLOW_DOWN =
    'Rover reached the current request limit and did not answer this question. You can try it again.';
  /* Said out loud when a stream dies mid-answer. Half an answer is worse than
     no answer if it reads as a whole one — the borrower must never mistake a
     truncated sentence for where we chose to stop. */
  var CUTOFF =
    'That answer stopped before it finished — the connection went quiet, so what is above is ' +
    'incomplete. A licensed loan officer can pick it up from here and give you the whole answer.';

  var cfg = {
    endpoint: '',            // e.g. https://royal-claude-brain.onrender.com  (same-origin if blank)
    historyTurns: 6,
    timeoutMs: 45000,       // silence budget, NOT a total budget — see arm()
    /* THE CONNECT DEADLINE (added 7/29/2026). MEASURED, not assumed —
       and the host named here is the one that was MEASURED, api.royalai.ai,
       NOT today's live brain. (Restored 8/7/2026: a site-wide endpoint
       rename swept this historical note too and left it claiming the LIVE
       royal-claude-brain.onrender.com has no DNS record, which is false —
       that host is up and serving. The measurement below is untouched.)
       api.royalai.ai had NO DNS RECORD. `nslookup api.royalai.ai` returns
       "Non-existent domain" and one of the two resolvers TIMES OUT at 2s;
       a browser fetch to https://api.royalai.ai/ask rejected at 1108ms and
       1294ms cold on the office connection, 89ms once negatively cached.
       On a resolver that black-holes instead of answering NXDOMAIN, or
       behind a captive portal, there is no upper bound at all — and the
       only clock in this file was the 45,000ms SILENCE budget, which is
       armed before the fetch and therefore held every caller's "thinking"
       state for up to forty-five seconds before saying a word.
       This budget covers DNS + TCP + TLS + response headers ONLY. It is
       disarmed the instant headers land, so a live engine that takes a
       second or two to produce its first token is never cut off — that is
       what timeoutMs is for. Three seconds is deliberately generous for a
       real deployment on a bad mobile connection and still an order of
       magnitude below the failure it replaces. UPDATE 7/31/2026: the
       royalai.ai front door used to set its own tighter override; that
       override was deliberately dropped so this default now governs
       everywhere, front door included. Do not re-add a front-door-specific
       connectMs. */
    connectMs: 3000,
  };

  var history = [];

  function configure(opts) {
    for (var k in opts) if (Object.prototype.hasOwnProperty.call(opts, k)) cfg[k] = opts[k];
    return cfg;
  }

  /* Journey context. Uses the site's Journey layer when present, otherwise
     just the world that was passed in.

     journey.js declares `const Journey` at the top level of a CLASSIC script.
     A top-level const lands in the global declarative record, not on window —
     so window.Journey reads undefined even on a page where the layer is loaded
     and working perfectly. Looking only at global.Journey silently dropped the
     stage and the voice off every single question and left the engine loading
     the generic compliance voice. Resolve the lexical binding too. */
  function journeyLayer() {
    if (global.Journey && typeof global.Journey.context === 'function') return global.Journey;
    /* typeof against an undeclared name is the one safe read — it never throws,
       so this stays inert on a surface that ships no journey layer at all. */
    if (typeof Journey !== 'undefined' && Journey && typeof Journey.context === 'function') {
      return Journey;
    }
    return null;
  }

  function contextFor(opts) {
    opts = opts || {};
    var layer = journeyLayer();
    if (layer) {
      try {
        return layer.context(opts.world, opts.tool);
      } catch (e) { /* fall through */ }
    }
    return { world: opts.world || null, tool: opts.tool || null, brand: 'usaheloc' };
  }

  /* ============================================================
     WHICH SHELL THIS PAGE IS RUNNING IN — added 2026-08-02

     TWO THINGS TURN ON IT, and neither of them can unlock anything:

     1. THE STORE PITCH. doctrine.js compiles a "you can download the
        Royal Ai app" clause into the prompt, and it used to compile
        identically into every surface — so someone standing INSIDE
        the native app was told to go and download the native app.
        The server gate that silences it has existed since 8/2 and
        has never once fired, because no client ever sent this field.
        This is the other half of that fix.

     2. ATTRIBUTION. The ask bar used to send world:'royal-ai', which
        is not one of the sixteen doors, so the server correctly
        dropped it and every ask from this page filed under
        byWorld.none. The honest answer is that the front door HAS no
        world; what it has is a shell, and the ledger counts that now.

     THE SERVER TREATS THIS AS A HINT AND SO SHOULD ANYONE READING
     IT. It arrives from a browser nobody controls, it is checked
     against a closed set of four words, and the ONLY thing it can
     buy is silence about an app store. Failing closed means not
     making the pitch, which is the safe direction.

     WHY "FRAMED" IS THE SIGNAL FOR THE NATIVE APP. The app loads
     this page inside its own webview frame. There is no user-agent
     token that distinguishes that webview from mobile Safari, and
     guessing from the user agent alone would tag every iPhone
     visitor as an app user and rob real browser visitors of ever
     hearing the app exists. Framed plus the platform is the closest
     thing to ground truth available from inside the page.

     A TOP-LEVEL VISIT IS NEVER 'ios' OR 'android'. That is
     deliberate: on those two values the store pitch goes silent, and
     a browser visitor is exactly who the pitch is for.
     ============================================================ */
  var shellCache = null;
  function appShell() {
    if (shellCache !== null) return shellCache;
    var out = 'web';
    try {
      var framed = false;
      /* A cross-origin parent makes even the comparison throw in some
         engines, and a throw here means we ARE framed. */
      try { framed = (window.self !== window.top); } catch (e) { framed = true; }

      var ua = (navigator && navigator.userAgent) || '';
      /* iPadOS 13+ reports a desktop Macintosh user agent. maxTouchPoints is
         the documented way back; a real Mac reports 0. */
      var ios = /iPad|iPhone|iPod/.test(ua) ||
        (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
      var android = /Android/.test(ua);

      if (framed) out = ios ? 'ios' : (android ? 'android' : 'web');
      else if (navigator.standalone === true ||
        (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches)) out = 'pwa';
    } catch (e) {
      /* Anything unexpected drops to the value that changes nothing. */
      out = 'web';
    }
    shellCache = out;
    return out;
  }

  /* Parse an SSE body incrementally. We read the fetch stream directly
     rather than using EventSource because the ask is a POST. */
  function readStream(response, handlers) {
    var reader = response.body.getReader();
    var decoder = new TextDecoder();
    var buf = '';

    function pump() {
      return reader.read().then(function (r) {
        if (r.done) return;
        buf += decoder.decode(r.value, { stream: true });
        var parts = buf.split('\n\n');
        buf = parts.pop();
        /* A HEARTBEAT IS NOT PROGRESS — 2026-08-02.
           This used to re-arm the silence budget on ANY byte, which was
           right when every byte was an event. The engine can now be asked
           to send SSE comment frames during the pre-first-token window
           (":\n\n", no data line) so a carrier proxy never sees an idle
           connection. Those frames say the socket is alive; they say
           nothing at all about the engine still working. Re-arming on them
           would mean a WEDGED engine could hold this client open past its
           own budget, which trades a real failure detection for a
           theoretical transport gain. Only a parsed event counts.
           A frame that arrives split across two reads simply re-arms on
           the read that completes it, which is a beat later and still
           inside a forty-five second budget. */
        var sawEvent = false;
        for (var i = 0; i < parts.length; i++) {
          var lines = parts[i].split('\n');
          var event = 'message';
          var data = '';
          for (var j = 0; j < lines.length; j++) {
            if (lines[j].indexOf('event:') === 0) event = lines[j].slice(6).trim();
            else if (lines[j].indexOf('data:') === 0) data += lines[j].slice(5).trim();
          }
          if (!data) continue;          /* comment frames land here and stop */
          sawEvent = true;
          var payload;
          try { payload = JSON.parse(data); } catch (e) { continue; }
          if (event === 'delta' && handlers.onDelta) handlers.onDelta(payload.text || '');
          else if (event === 'meta' && handlers.onMeta) handlers.onMeta(payload);
          else if (event === 'done' && handlers.onDoneEvent) handlers.onDoneEvent(payload);
        }
        if (sawEvent && handlers.onActivity) handlers.onActivity();
        return pump();
      });
    }
    return pump();
  }

  /**
   * Ask. Resolves with { text, followup, handoff, reason, source }.
   * source is 'engine' when Claude answered, 'concierge' when it could not.
   */
  function ask(question, opts, handlers) {
    opts = opts || {};
    handlers = handlers || {};
    /* The shell is added AFTER the journey layer has had its say, so a
       surface that ships a journey layer and a surface that does not both
       report it. Detection wins over anything a caller passes: this is a
       fact about the device, not a preference. */
    var ctx = contextFor(opts);
    try { ctx.appShell = appShell(); } catch (e) { /* never block an ask on it */ }
    var answer = '';
    var meta = null;

    var controller = typeof AbortController !== 'undefined' ? new AbortController() : null;

    /* INACTIVITY, not a stopwatch. The old absolute timer fired cfg.timeoutMs
       after the question left, so a long-but-healthy answer was cut off mid
       sentence with no done event and nothing on screen to say so. The clock
       now restarts on every byte the engine sends: only a stream that has
       genuinely gone quiet trips it, and when it does the answer gets closed
       out loud rather than just stopping. */
    var timer = null;
    var timedOut = false;
    function arm() {
      if (timer) clearTimeout(timer);
      timer = setTimeout(function () {
        timedOut = true;
        if (controller) controller.abort();
      }, cfg.timeoutMs);
    }
    function disarm() { if (timer) clearTimeout(timer); timer = null; }
    arm();

    /* THE CONNECT DEADLINE — see cfg.connectMs. Armed here, disarmed the
       moment response headers arrive. If it fires nothing has been said
       yet, so `answer` is empty, no CUTOFF note is added, and the caller
       drops straight to the concierge line with reason 'timeout'. */
    var connectTimer = setTimeout(function () {
      timedOut = true;
      if (controller) controller.abort();
    }, cfg.connectMs);
    function disarmConnect() {
      if (connectTimer) clearTimeout(connectTimer);
      connectTimer = null;
    }

    var url = (cfg.endpoint || '') + '/ask';

    return fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controller ? controller.signal : undefined,
      body: JSON.stringify({
        question: question,
        context: ctx,
        history: history.slice(-cfg.historyTurns),
        /* ASK FOR THE KEEPALIVE — 2026-08-02, and it is opt-in on purpose.
           The engine writes SSE comment frames during the pre-first-token
           window only, so a mobile carrier proxy never sees a connection
           that has been idle since the response head. Every client that
           does not send this flag gets byte-for-byte what it gets today,
           which is what keeps the ten other Royal docroots shipping their
           own cached copy of this file completely unaffected. This copy
           understands the frames (see readStream: a comment does NOT
           re-arm the silence budget), so it is safe for it to ask. */
        heartbeat: true,
      }),
    })
      .then(function (res) {
        /* Headers are in. The connection happened; from here the silence
           budget is the only clock that should be running. */
        disarmConnect();
        if (res.status === 429) {
          var slow = new Error('engine 429');
          slow.code = 'slow_down';
          throw slow;
        }
        if (!res.ok || !res.body) throw new Error('engine ' + res.status);
        return readStream(res, {
          onActivity: arm,
          onMeta: function (m) { meta = m; if (handlers.onMeta) handlers.onMeta(m); },
          onDelta: function (t) { arm(); answer += t; if (handlers.onDelta) handlers.onDelta(t); },
          onDoneEvent: function (d) { meta = Object.assign({}, meta, d); },
        }).then(function () {
          disarm();
          disarmConnect();
          history.push({ role: 'user', text: question });
          history.push({ role: 'assistant', text: answer });
          if (history.length > 16) history = history.slice(-16);
          var out = {
            text: answer || CONCIERGE,
            followup: (meta && meta.followup) || ASK_FINE,
            handoff: !!(meta && meta.handoff),
            reason: meta && meta.reason,
            /* R6 — the deep-link the server computed rides the done event;
               dropping it here was how "knows which bubble to press" became
               dead code end to end. One of the sixteen door keys, or null —
               and the page validates it again before it becomes an href. */
            navigate: meta && typeof meta.navigate === 'string' ? meta.navigate : null,
            /* THE CALCULATOR DOOR (2026-09-27) — which calculator the gold
               button under the calculator line opens, as the server decided
               it: 'purchase' or 'equity', anything else null. Same contract
               as navigate: the server's verdict, validated again here. */
            calculator: meta && (meta.calculator === 'purchase' || meta.calculator === 'equity') ? meta.calculator : null,
            source: answer ? 'engine' : 'concierge',
          };
          if (handlers.onDone) handlers.onDone(out);
          return out;
        });
      })
      .catch(function (err) {
        disarm();
        disarmConnect();
        // Engine unreachable, aborted, or erroring. The borrower still gets
        // a real answer path — a human picks it up.
        /* ANY error path that arrives with text already on screen is a
           TRUNCATED ANSWER, whatever killed the stream. Corrected 2026-08-02.

           The gate used to read `timedOut && answer`, and `timedOut` is set
           only by this file's own two abort timers. So a real connection
           reset mid-stream — the common mobile failure, deltas then
           controller.error() — left timedOut false, skipped the CUTOFF rail,
           and reported truncated:false. MEASURED: the log ended on the half
           sentence "PMI is private mortgage insurance, and it is", the
           followup rail painted underneath as though the answer had
           finished, and no retry was offered. A borrower read half a
           mortgage explanation as the whole one, which is the exact harm
           this rail exists to prevent.

           What killed the stream is diagnostic detail. What the borrower is
           looking at is half a sentence either way. */
        if (answer) {
          // The stream died with text already on screen. Say so on the SAME
          // channel the answer arrived on: a caller that renders from onDelta
          // never looks at out.text, so a note only in the return value would
          // leave the truncated sentence standing as the whole answer.
          var note = '\n\n' + CUTOFF;
          answer += note;
          if (handlers.onDelta) handlers.onDelta(note);
        }
        var slowed = !!(err && err.code === 'slow_down');
        var out = {
          text: answer || (slowed ? SLOW_DOWN : CONCIERGE),
          followup: ASK_FINE,
          handoff: !slowed,
          // 'interrupted' is a THIRD state: the stream died after real words
          // arrived but before either abort timer fired. Naming it separately
          // keeps a connection reset legible in the ledger and in support.
          reason: answer ? 'interrupted' : (slowed ? 'slow_down' : (timedOut ? 'timeout' : 'offline')),
          truncated: !!answer,
          navigate: null,
          calculator: null,
          source: answer ? 'engine' : 'concierge',
          error: String((err && err.message) || err),
        };
        if (handlers.onDone) handlers.onDone(out);
        return out;
      });
  }

  function reset() { history = []; }

  /**
   * Optional: wire an existing input + output pair with one call.
   * Nothing about the host page's markup changes.
   */
  function attach(o) {
    var input = typeof o.input === 'string' ? document.querySelector(o.input) : o.input;
    var out = typeof o.output === 'string' ? document.querySelector(o.output) : o.output;
    var send = o.send ? (typeof o.send === 'string' ? document.querySelector(o.send) : o.send) : null;
    if (!input || !out) return null;

    var busy = false;
    function go() {
      var q = (input.value || '').trim();
      if (!q || busy) return;
      busy = true;
      input.value = '';
      out.textContent = '';
      if (o.onStart) o.onStart();
      ask(q, { world: o.world && o.world(), tool: o.tool && o.tool() }, {
        onDelta: function (t) { out.textContent += t; if (o.onDelta) o.onDelta(t); },
        onDone: function (info) { busy = false; if (o.onDone) o.onDone(info); },
      });
    }
    if (send) send.addEventListener('click', go);
    input.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') { e.preventDefault(); go(); }
    });
    return { send: go };
  }

  global.RoyalEngineClient = {
    configure: configure,
    ask: ask,
    reset: reset,
    attach: attach,
    RAILS: { concierge: CONCIERGE, askFine: ASK_FINE, cutoff: CUTOFF },
  };
})(typeof window !== 'undefined' ? window : globalThis);

/* ---------------------------------------------------------------------------
   THE HANDOFF PICKUP — added 2026-08-04 under THE LIGHTS-ON LAW.
   Every family door's ask box submits GET ?q= to this front door (mortgage's
   does exactly that). Before this, the question died on arrival: nothing read
   the param, the visitor landed on an EMPTY bar — a dead end in the exact
   place the concierge exists to prevent. Now the question is picked up,
   auto-asked through the same submit path the bar itself uses (so every tier,
   including the concierge, applies), and the URL is scrubbed so refresh and
   history don't re-ask it.

   EVERY GLOBAL IN HERE GOES THROUGH `window` (corrected 8/7/2026). The guard
   above already tests `window.document`, but the body reached for the BARE
   `document` — identical in a real browser, and a ReferenceError anywhere
   else. "Anywhere else" is not hypothetical: the repo's own client tests load
   this exact file with a supplied `window` and no global document, which is
   how the inconsistency surfaced. Browser behaviour is unchanged. */
(function () {
  if (typeof window === 'undefined' || !window.document) return;
  var doc = window.document;
  function pickup() {
    try {
      var q = new URLSearchParams(window.location.search).get('q');
      if (!q || !q.trim()) return;
      var form = doc.getElementById('ask');
      var input = doc.getElementById('q');
      if (!form || !input) return;
      input.value = q.trim();
      window.history.replaceState(null, '', window.location.pathname);
      /* after front-door.js has attached its submit handler */
      window.setTimeout(function () {
        if (typeof form.requestSubmit === 'function') form.requestSubmit();
        else form.dispatchEvent(new Event('submit', { cancelable: true }));
      }, 0);
    } catch (e) { /* a failed pickup must never break the page */ }
  }
  if (doc.readyState === 'loading') {
    doc.addEventListener('DOMContentLoaded', pickup);
  } else { pickup(); }
})();
