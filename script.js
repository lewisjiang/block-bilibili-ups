// ==UserScript==
// @name         Block Bilibili Up
// @namespace    http://tampermonkey.net/
// @version      1.0
// @description  通过up主用户名屏蔽B站Up
// @author       Boku
// @match        *://*.bilibili.com/?*
// @match        *://*.bilibili.com
// @match        *://*.bilibili.com/v/*
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

  // 推荐：先用 hide 调试，确认 upward N 没问题再切 remove
  const ACTION = 'remove'; // 'hide' | 'remove'

  /***********************
   * 2) Utils
   ***********************/
  function upward(el, n) {
    let cur = el;
    for (let i = 0; i < n && cur; i++) cur = cur.parentElement;
    return cur;
  }

  function normalizeText(s) {
    return (s || '').replace(/\s+/g, ' ').trim();
  }

  function extractAuthorText(el) {
    // 兼容作者名被包在子节点或仅存在 title 的情况
    const t1 = normalizeText(el.textContent);
    const t2 = normalizeText(el.getAttribute('title'));
    return t1 || t2;
  }

  function matchesBlock(authorText) {
    const t = normalizeText(authorText);
    if (!t) return false;
    return BLOCK_AUTHORS.some(rule => {
      if (typeof rule === 'string') return t.includes(rule);
      if (rule instanceof RegExp) return rule.test(t);
      return false;
    });
  }

  // 关键：防止 upward(N) 过头把页面骨架删掉
  function isUnsafeRoot(root) {
    if (!root) return true;
    if (root === document.body || root === document.documentElement) return true;
    // B 站常见根容器（按需扩展）
    if (root.id === 'app' || root.id === 'biliMainHeader') return true;
    return false;
  }

  function applyAction(rootEl, reason) {
    if (!rootEl || !(rootEl instanceof Element)) return;

    // 去重：同一节点不要反复处理
    if (rootEl.dataset.__tmBlocked === '1') return;
    rootEl.dataset.__tmBlocked = '1';

    if (ACTION === 'hide') {
      rootEl.style.display = 'none';
    } else {
      rootEl.remove();
    }

    // console.info('[TM block]', reason, rootEl); // debug info
  }

  /***********************
   * 3) Rules (upward-N)
   *    加 expectedRootSelector 作为“护栏”
   ***********************/
  const RULES = [
    // 1) 搜索页
    {
      name: 'search',
      enabled: () => location.host === 'search.bilibili.com',
      featureSelector: 'span.bili-video-card__info--author',
      upwardN: 7,
      expectedRootSelector: 'div.col_3',
    },

    // 2) 主页面（推荐流/首页等）
    {
      name: 'home',
      enabled: () =>
        location.host === 'www.bilibili.com' &&
        !location.pathname.startsWith('/v/popular') &&
        !location.pathname.startsWith('/video'),
      featureSelector: 'span.bili-video-card__info--author',
      upwardN: 8,
      expectedRootSelector: 'div.feed-card',
    },

    // 3) 热门页面（综合，每周）
    {
      name: 'popular',
      enabled: () =>
        location.host === 'www.bilibili.com' &&
        (location.pathname.startsWith('/v/popular/all') ||
         location.pathname.startsWith('/v/popular/weekly')
        ),
      featureSelector: 'span.up-name__text',
      upwardN: 4,
      expectedRootSelector: 'div.video-card', // 视 B 站结构可再调整
    },

    // 4) 排行榜页面
    {
      name: 'rank',
      enabled: () =>
        location.host === 'www.bilibili.com' &&
        location.pathname.includes('/v/popular/rank'),
      featureSelector: 'span.up-name', // 包含 data-box up-name 的情况也能命中
      upwardN: 5,
      expectedRootSelector: 'li.rank-item, div.rank-wrap',
    },

    // 5) 播放页右侧推荐（如果你需要）
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

  /***********************
   * 4) Core: process nodes
   ***********************/
  function processFeatureNode(node, rule) {
    if (!(node instanceof Element)) return;

    const authorText = extractAuthorText(node);
    if (!matchesBlock(authorText)) return;

    const root = upward(node, rule.upwardN);
    if (!root || isUnsafeRoot(root)) return;

    // 护栏：upward 结果必须长得像“我们期待删除的卡片根”
    if (rule.expectedRootSelector && !root.matches(rule.expectedRootSelector)) {
      // 不中断运行，但跳过，避免误删导致白屏
      // console.warn('[TM] skip suspicious root', rule.name, authorText, root);
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

          // node 本身可能是 feature
          for (const rule of rules) {
            if (node.matches?.(rule.featureSelector)) processFeatureNode(node, rule);
          }

          // node 内部包含 feature
          const hits = node.querySelectorAll?.(unionSelector);
          if (!hits || hits.length === 0) continue;

          for (const el of hits) {
            for (const rule of rules) {
              if (el.matches(rule.featureSelector)) processFeatureNode(el, rule);
            }
          }
        }
      }
    });

    obs.observe(document.body, { childList: true, subtree: true });
    return obs;
  }

  /***********************
   * 5) SPA route handling
   ***********************/
  let currentUrl = location.href;
  let observer = null;

  function restartPipeline() {
    if (observer) observer.disconnect();

    const rules = activeRules();
    if (rules.length === 0) return;

    scanExisting(rules);
    observer = observeIncremental(rules);
  }

  function onUrlChange() {
    if (location.href === currentUrl) return;
    currentUrl = location.href;
    restartPipeline();
  }

  // hook history methods
  const _pushState = history.pushState;
  history.pushState = function (...args) {
    const ret = _pushState.apply(this, args);
    onUrlChange();
    return ret;
  };

  const _replaceState = history.replaceState;
  history.replaceState = function (...args) {
    const ret = _replaceState.apply(this, args);
    onUrlChange();
    return ret;
  };

  window.addEventListener('popstate', onUrlChange);

  // 首次启动
  restartPipeline();

  // 兜底：部分 SPA 路由不会触发上面 hook（少见），加一个轻量轮询
  setInterval(onUrlChange, 500);
})();
