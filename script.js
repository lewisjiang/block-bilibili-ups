// ==UserScript==
// @name         Block Bilibili Up
// @namespace    http://tampermonkey.net/
// @version      1.0
// @description  通过up主用户名屏蔽B站Up
// @author       Boku
// @match        *://*.bilibili.com/?*
// @match        *://*.bilibili.com
// @match        *://*.bilibili.com/v/*
// @match        *://*.bilibili.com/*
// @match        *://search.bilibili.com/all*
// @run-at       document-idle
// ==/UserScript==

(() => {
  'use strict';

  /***********************
   * 1) Blocklist
   ***********************/
  const BLOCK_AUTHORS = [
    "aaa",
    "bbb",
  ];

  const ACTION = 'remove';

  function upward(el, n) {
    let cur = el;
    for (let i = 0; i < n && cur; i++) cur = cur.parentElement;
    return cur;
  }

  function normalizeText(s) {
    return (s || '').replace(/\s+/g, ' ').trim();
  }

  function extractAuthorText(el) {
    return normalizeText(el.textContent) || normalizeText(el.getAttribute('title'));
  }

  function matchesBlock(authorText) {
    const t = normalizeText(authorText);
    if (!t) return false;
    return BLOCK_AUTHORS.some(rule => t.includes(rule));
  }

  function isUnsafeRoot(root) {
    if (!root) return true;
    if (root === document.body || root === document.documentElement) return true;
    if (root.id === 'app' || root.id === 'biliMainHeader') return true;
    return false;
  }

  function applyAction(rootEl, reason) {
    if (!rootEl || rootEl.dataset.__tmBlocked === '1') return;
    rootEl.dataset.__tmBlocked = '1';

    if (ACTION === 'hide') rootEl.style.display = 'none';
    else rootEl.remove();
  }

  const RULES = [
    {
      name: 'search',
      enabled: () => location.host === 'search.bilibili.com',
      featureSelector: 'span.bili-video-card__info--author',
      upwardN: 7,
      expectedRootSelector: 'div.col_3',
    },

    {
      name: 'home',
      enabled: () =>
        location.host === 'www.bilibili.com' &&
        !location.pathname.startsWith('/v/popular') &&
        !location.pathname.startsWith('/video'),

      featureSelector: 'span.bili-video-card__info--author',
      upwardN: 7,

      // ✅ FIXED: was 'div.feed-card' (does not exist anymore)
      expectedRootSelector: 'div.feed-card, div.bili-feed4, div[class*="feed"]',
    },

    {
      name: 'popular',
      enabled: () =>
        location.host === 'www.bilibili.com' &&
        (location.pathname.startsWith('/v/popular/all') ||
         location.pathname.startsWith('/v/popular/weekly')),

      featureSelector: 'span.up-name__text',
      upwardN: 4,
      expectedRootSelector: 'div.video-card',
    },

    {
      name: 'rank',
      enabled: () =>
        location.host === 'www.bilibili.com' &&
        location.pathname.includes('/v/popular/rank'),

      featureSelector: 'span.up-name',
      upwardN: 5,
      expectedRootSelector: 'li.rank-item, div.rank-wrap',
    },

    {
      name: 'video',
      enabled: () =>
        location.host === 'www.bilibili.com' &&
        location.pathname.startsWith('/video'),

      featureSelector: 'span.name',
      upwardN: 4,
      expectedRootSelector: 'div.card-box, div.video-page-card-small',
    },
  ];

  function activeRules() {
    return RULES.filter(r => {
      try { return r.enabled(); } catch { return false; }
    });
  }

  function processFeatureNode(node, rule) {
    const authorText = extractAuthorText(node);
    if (!matchesBlock(authorText)) return;

    const root = upward(node, rule.upwardN);
    if (!root || isUnsafeRoot(root)) return;

    if (rule.expectedRootSelector && !root.matches(rule.expectedRootSelector)) {
      return;
    }

    applyAction(root, `${rule.name}: ${authorText}`);
  }

  function scanExisting(rules) {
    for (const rule of rules) {
      document.querySelectorAll(rule.featureSelector)
        .forEach(el => processFeatureNode(el, rule));
    }
  }

  function observeIncremental(rules) {
    const unionSelector = rules.map(r => r.featureSelector).join(',');

    const obs = new MutationObserver(mutations => {
      for (const m of mutations) {
        for (const node of m.addedNodes) {
          if (!(node instanceof Element)) continue;

          for (const rule of rules) {
            if (node.matches?.(rule.featureSelector)) {
              processFeatureNode(node, rule);
            }
          }

          const hits = node.querySelectorAll?.(unionSelector);
          if (!hits) continue;

          for (const el of hits) {
            for (const rule of rules) {
              if (el.matches(rule.featureSelector)) {
                processFeatureNode(el, rule);
              }
            }
          }
        }
      }
    });

    obs.observe(document.body, { childList: true, subtree: true });
    return obs;
  }

  let currentUrl = location.href;
  let observer = null;

  function restartPipeline() {
    if (observer) observer.disconnect();

    const rules = activeRules();
    scanExisting(rules);
    observer = observeIncremental(rules);
  }

  function onUrlChange() {
    if (location.href === currentUrl) return;
    currentUrl = location.href;
    restartPipeline();
  }

  history.pushState = ((f) =>
    function () {
      const ret = f.apply(this, arguments);
      onUrlChange();
      return ret;
    })(history.pushState);

  history.replaceState = ((f) =>
    function () {
      const ret = f.apply(this, arguments);
      onUrlChange();
      return ret;
    })(history.replaceState);

  window.addEventListener('popstate', onUrlChange);

  restartPipeline();
  setInterval(onUrlChange, 500);
})();
