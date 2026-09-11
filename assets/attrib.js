/* Well couture 流入属性の保持・引き継ぎ (2026-09-11 v3)
 * 役割: ①着地URLのutm/クリックIDをlocalStorageに保存(初回着地=first / 最新=last)
 *       ②SP/PC振り分けや内部リンク遷移でパラメータを引き継ぐ
 *       ③予約フォーム送信に流入属性を同梱する (window.wcAttribFlat)
 *       ④LINEアプリ内ブラウザからの来訪でutmが無ければ utm_source=line を自動付与(GA4がLINE経由と判別できる)
 *       ⑤保存済み経路に応じてLINE友だち追加リンクを差し替える (WC_LINE_ROUTES)
 *       ⑥SP/PC振り分け(__wc_redirect)で失われる元の参照元を復元する(v2)。振り分け前に ref=元の参照元 がURLに乗るので、
 *         読み取ったらURLから消し(utmは残す)、window.wcPageReferrer に入れる。各ページの gtag('config') が page_referrer として渡す
 *       ⑦広告ID類(utm_id=キャンペーンID / adset_id / ad_id / src=配信元)も保存し、GA4の全イベントに共通パラメータとして付ける(v3)。
 *         GA4側で adset_id / ad_id / src をカスタムディメンション(イベント)に登録すると内訳が見える。utm_id は標準の「キャンペーンID」
 * 注意: このファイルはgtag(GA4)より前に読み込むこと(④⑥のURL書き換えをGA4の計測前に済ませるため)
 */
(function () {
  var KEY = 'wc_attrib';
  var TTL_DAYS = 90;
  var TRACK = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term', 'utm_id', 'adset_id', 'ad_id', 'src', 'gclid', 'fbclid', 'ttclid', 'wbraid', 'gbraid'];

  /* ⑤ LINE友だち追加リンクの経路別差し替え。url が空の行は無効。
   *    when の全キーが保存済み属性(last優先→first)と一致したら、ページ内の line.me/ti/p と lin.ee のリンク先を url に置換する。
   *    LINE公式アカウントマネージャー「友だちを増やす→友だち追加経路」で発行したURLを吉井さんから受け取って記入する。 */
  var WC_LINE_ROUTES = [
    { when: { utm_source: 'meta' }, url: 'https://lin.ee/t7R6v7U' },            // Meta広告(Instagram/Facebook)から → LINE経路「Meta広告」
    { when: { utm_medium: 'paid' }, url: 'https://lin.ee/t7R6v7U' },            // その他の有料広告から → 同上(広告用)
    { when: { utm_source: 'instagram', utm_medium: 'profile' }, url: 'https://lin.ee/NjP0e8l' } // IGプロフィールから → LINE経路「Instagram」
  ];
  /* 経路別URL一覧(2026-09-11 LINE公式で発行・編集/削除不可):
   *   HP(既定・全ページのLINEボタン) https://lin.ee/X3Jn2thw
   *   Instagram(プロフィール)        https://lin.ee/NjP0e8l
   *   Meta広告                       https://lin.ee/t7R6v7U
   *   店頭QR                         https://lin.ee/zcEiUKK
   */

  function parse(search) {
    var out = {}, q = (search || '').replace(/^\?/, '').split('&');
    for (var i = 0; i < q.length; i++) {
      if (!q[i]) continue;
      var kv = q[i].split('='), k = decodeURIComponent(kv[0] || ''), v = decodeURIComponent((kv[1] || '').replace(/\+/g, ' '));
      if (TRACK.indexOf(k) >= 0 && v) out[k] = v;
    }
    return out;
  }
  function load() { try { return JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) { return null; } }
  function save(o) { try { localStorage.setItem(KEY, JSON.stringify(o)); } catch (e) {} }
  function isLineApp() { return /\bLine\//i.test(navigator.userAgent); }

  /* ⑥ 振り分け前の参照元を ref= から復元し、URLから消す(履歴は増やさない)。無ければ通常の document.referrer */
  var origRef = document.referrer || '';
  try {
    var u0 = new URL(location.href), refParam = u0.searchParams.get('ref');
    if (refParam) {
      origRef = refParam;
      u0.searchParams.delete('ref');
      history.replaceState(history.state, '', u0.toString());
    }
  } catch (e) {}
  window.wcPageReferrer = origRef;

  /* ④ LINEアプリ内でutm無し → utm_source=line&utm_medium=inapp をURLに付与(履歴は増やさない) */
  var params = parse(location.search);
  if (isLineApp() && !params.utm_source) {
    try {
      var u = new URL(location.href);
      u.searchParams.set('utm_source', 'line'); u.searchParams.set('utm_medium', 'inapp');
      history.replaceState(history.state, '', u.toString());
      params = parse(location.search);
    } catch (e) {}
  }

  /* ① 保存 */
  var now = Date.now(), store = load() || {};
  if (store.first && now - (store.first.ts || 0) > TTL_DAYS * 86400000) store = {};
  var hasTrack = Object.keys(params).length > 0;
  if (hasTrack) {
    var entry = { url: location.href, params: params, referrer: origRef, ts: now };
    if (!store.first) store.first = entry;
    store.last = entry;
  } else if (!store.first && origRef && origRef.indexOf(location.host) < 0) {
    store.first = { url: location.href, params: {}, referrer: origRef, ts: now };
    store.last = store.first;
  }
  save(store);

  function current() { var s = load() || {}; return s.last || s.first || null; }
  function flat() {
    var s = load() || {}, f = s.first || {}, l = s.last || {}, p = (l.params || f.params || {});
    return {
      landingUrl: f.url || '', landingReferrer: f.referrer || '', landingTs: f.ts ? new Date(f.ts).toISOString() : '',
      lastUrl: l.url || '',
      utmSource: p.utm_source || '', utmMedium: p.utm_medium || '', utmCampaign: p.utm_campaign || '', utmContent: p.utm_content || '', utmTerm: p.utm_term || '',
      campaignId: p.utm_id || '', adsetId: p.adset_id || '', adId: p.ad_id || '', adSrc: p.src || '',
      clickId: p.gclid ? 'gclid:' + p.gclid : p.fbclid ? 'fbclid:' + p.fbclid : p.ttclid ? 'ttclid:' + p.ttclid : '',
      pageUrl: location.href
    };
  }
  window.wcAttrib = function () { return load(); };
  window.wcAttribFlat = flat;

  /* ⑦ 広告ID類をGA4の共通パラメータに(gtagより前に dataLayer へ 'set' を積む。値が無ければ何もしない) */
  try {
    var cur = current(), cp = (cur && cur.params) || {};
    var extra = {};
    if (cp.adset_id) extra.adset_id = cp.adset_id;
    if (cp.ad_id) extra.ad_id = cp.ad_id;
    if (cp.src) extra.ad_src = cp.src;
    if (cp.utm_id) extra.wc_campaign_id = cp.utm_id;
    if (Object.keys(extra).length) { window.dataLayer = window.dataLayer || []; (function () { window.dataLayer.push(arguments); })('set', extra); }
  } catch (e) {}

  /* ② 内部リンクへ引き継ぎ: クリック時に同一サイト内の .html/相対リンクへ保存済みパラメータを付与 */
  function decorate(href) {
    var c = current(); if (!c || !c.params) return href;
    try {
      var u = new URL(href, location.href);
      if (u.origin !== location.origin) return href;
      if (!/\.html?$|\/$|\/[^./?#]*$/.test(u.pathname)) return href;
      var changed = false;
      for (var k in c.params) { if (!u.searchParams.has(k)) { u.searchParams.set(k, c.params[k]); changed = true; } }
      return changed ? u.toString() : href;
    } catch (e) { return href; }
  }
  document.addEventListener('click', function (e) {
    var a = e.target && e.target.closest ? e.target.closest('a[href]') : null;
    if (!a) return;
    var h = a.getAttribute('href') || '';
    if (!h || h.charAt(0) === '#' || /^(mailto:|tel:|javascript:)/i.test(h) || /^https?:\/\//i.test(h) && h.indexOf(location.host) < 0) return;
    a.href = decorate(a.href);
  }, true);

  /* ⑤ LINEリンク差し替え */
  function matchRoute() {
    var c = current(); if (!c || !c.params) return null;
    for (var i = 0; i < WC_LINE_ROUTES.length; i++) {
      var r = WC_LINE_ROUTES[i]; if (!r.url) continue;
      var ok = true; for (var k in r.when) { if (c.params[k] !== r.when[k]) { ok = false; break; } }
      if (ok) return r.url;
    }
    return null;
  }
  function rewriteLineLinks() {
    var url = matchRoute(); if (!url) return;
    var as = document.querySelectorAll('a[href*="line.me/ti/p"],a[href*="lin.ee/"]');
    for (var i = 0; i < as.length; i++) { if (as[i].href !== url) { as[i].href = url; as[i].setAttribute('data-wc-line-route', '1'); } }
  }
  document.addEventListener('DOMContentLoaded', rewriteLineLinks);
  window.addEventListener('load', rewriteLineLinks);
  try { new MutationObserver(function () { rewriteLineLinks(); }).observe(document.documentElement, { childList: true, subtree: true }); } catch (e) {}
})();
