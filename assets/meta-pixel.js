/* Well couture Meta Pixel (2026-09-11 v1)
 * 役割: ①全ページで PageView を送る ②LINE友だち追加リンク(line.me/ti/p・lin.ee)のクリックで標準イベント Lead を送る
 *       (広告の最適化目標に使う。attrib.js の保存値から line_route / utm を content_* に添える)
 * 注意: attrib.js の後・GA4 の前後どちらでも可。プライバシーポリシー第9項に Meta を記載済みであること。
 * ピクセルID はイベントマネージャ(Metaビジネス設定)で確認・変更する。
 */
(function () {
  var PIXEL_ID = '1772713904043885';
  if (!PIXEL_ID) return;
  !function (f, b, e, v, n, t, s) {
    if (f.fbq) return; n = f.fbq = function () { n.callMethod ? n.callMethod.apply(n, arguments) : n.queue.push(arguments); };
    if (!f._fbq) f._fbq = n; n.push = n; n.loaded = !0; n.version = '2.0'; n.queue = [];
    t = b.createElement(e); t.async = !0; t.src = v; s = b.getElementsByTagName(e)[0];
    if (s && s.parentNode) s.parentNode.insertBefore(t, s); else b.head.appendChild(t);
  }(window, document, 'script', 'https://connect.facebook.net/en_US/fbevents.js');
  window.fbq('init', PIXEL_ID);
  window.fbq('track', 'PageView');

  /* ② LINE追加クリック → Lead */
  document.addEventListener('click', function (e) {
    var a = e.target && e.target.closest ? e.target.closest('a[href*="line.me/ti/p"],a[href*="lin.ee/"]') : null;
    if (!a) return;
    var p = {};
    try { var f = window.wcAttribFlat ? window.wcAttribFlat() : null; if (f) { p.content_name = a.getAttribute('data-wc-line-route') ? 'ad' : 'default'; p.content_category = f.utmSource + '/' + f.utmMedium; } } catch (_) {}
    try { window.fbq('track', 'Lead', p); } catch (_) {}
  }, true);
})();
