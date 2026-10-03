(function () {
  "use strict";
  var TYPE_SYMBOL = { 石窟: "diamond", 丝路重镇: "circle", 关隘: "triangle" };
  var TYPE_SIZE = { 石窟: 13, 丝路重镇: 11, 关隘: 12 };
  var TYPE_COLOR = { 石窟: "#9EACEA", 丝路重镇: "#F0C76A", 关隘: "#EA8F8F" };

  var mapEl = document.getElementById("map");
  var chart = null;
  var SITES = [];
  var ROUTES = [];
  var STATS = { grotto_count: 0, city_count: 0, fort_count: 0, route_count: 0 };
  var currentLayer = "all";
  var grottoSeries = null, citySeries = null, fortSeries = null, routeSeries = [];

  function fmt(o) { return o == null ? "—" : o; }

  function loadData(cb) {
    var done = 0, total = 2, errs = 0;
    function tick() { done++; if (done >= total) { cb(errs === 0); } }
    function onErr() { errs++; tick(); }
    fetch("data/sites.json").then(function (r) { return r.json(); }).then(function (d) {
      SITES = d.sites || [];
      ROUTES = d.routes || [];
      STATS = d.stats || STATS;
      tick();
    }).catch(onErr);
    fetch("js/gansu.json").then(function (r) { return r.json(); }).then(function (g) {
      echarts.registerMap("gansu", g);
      tick();
    }).catch(onErr);
  }

  function buildSeries() {
    grottoSeries = {
      name: "石窟", type: "scatter", coordinateSystem: "geo", symbol: "diamond",
      symbolSize: 13, zlevel: 3,
      itemStyle: { color: "#9EACEA", borderColor: "#e8d9b0", borderWidth: 1, shadowBlur: 8, shadowColor: "rgba(158,172,234,.6)" },
      data: SITES.filter(function (s) { return s.type === "石窟"; }).map(pt)
    };
    citySeries = {
      name: "丝路重镇", type: "scatter", coordinateSystem: "geo", symbol: "circle",
      symbolSize: 11, zlevel: 3,
      itemStyle: { color: "#F0C76A", borderColor: "#17161a", borderWidth: 1, shadowBlur: 8, shadowColor: "rgba(240,199,106,.6)" },
      data: SITES.filter(function (s) { return s.type === "丝路重镇"; }).map(pt)
    };
    fortSeries = {
      name: "关隘", type: "scatter", coordinateSystem: "geo", symbol: "triangle",
      symbolSize: 13, zlevel: 3,
      itemStyle: { color: "#EA8F8F", borderColor: "#e8d9b0", borderWidth: 1, shadowBlur: 8, shadowColor: "rgba(234,143,143,.6)" },
      data: SITES.filter(function (s) { return s.type === "关隘"; }).map(pt)
    };
    function pt(s) {
      return { name: s.name, value: [s.lng, s.lat], desc: s.desc, dynasty: s.dynasty, type: s.type, source: s.source };
    }
  }

  function routeSeriesOf(r) {
    return {
      name: r.name, type: "lines", coordinateSystem: "geo", zlevel: 2,
      effect: { show: true, period: 6, trailLength: 0.4, symbol: "arrow", symbolSize: 7, color: r.color },
      lineStyle: { color: r.color, width: 2.5, opacity: 0.85, curveness: 0.08 },
      data: [{ coords: r.coords, name: r.name }]
    };
  }

  function visibleSeries() {
    var arr = [];
    if (currentLayer === "all" || currentLayer === "route") arr = arr.concat(ROUTES.map(routeSeriesOf));
    if (currentLayer === "all" || currentLayer === "grotto") arr.push(grottoSeries);
    if (currentLayer === "all" || currentLayer === "city") { arr.push(citySeries); arr.push(fortSeries); }
    return arr;
  }

  function init() {
    chart = echarts.init(mapEl);
    chart.setOption({
      backgroundColor: "transparent",
      tooltip: {
        trigger: "item", triggerOn: "click", confine: true, renderMode: "richText",
        backgroundColor: "rgba(30,28,34,.95)", borderColor: "#c8963c", borderWidth: 1,
        textStyle: { color: "#e8d9b0", fontSize: 12 },
        formatter: function (p) {
          if (!p.data || !p.data.desc) return p.seriesName + "：" + (p.name || "");
          return p.name + "\n朝代：" + p.data.dynasty + "\n" + p.data.desc;
        }
      },
      geo: {
        map: "gansu", roam: true, zoom: 1.15, zlevel: 1,
        itemStyle: {
          areaColor: "#26242b",
          borderColor: "#8a7448", borderWidth: 1.2
        },
        emphasis: {
          itemStyle: { areaColor: "#3a2f1c" },
          label: { show: false }
        },
        label: { show: false }
      },
      series: visibleSeries()
    });
    chart.on("click", function (p) {
      if (p.componentType === "series" && p.data && p.data.desc) {
        showDetail(p.data);
      }
    });
    chart.on("georoam", function () { /* 拖拽时无需刷新 */ });

    function safeResize() {
      try { if (chart && mapEl.clientHeight > 0) chart.resize(); } catch (e) {}
    }
    window.addEventListener("resize", safeResize);
    setTimeout(safeResize, 400);
    setTimeout(safeResize, 1200);
  }

  function renderSiteList() {
    var el = document.getElementById("site-list");
    var html = "";
    SITES.forEach(function (s) {
      var cls = "site-item";
      if (s.type === "石窟") cls += " t-grotto";
      else if (s.type === "丝路重镇") cls += " t-city";
      else cls += " t-fort";
      var askQ = s.ask || ("介绍一下" + s.name);
      html += "<div class='site-row'>";
      html += "<button class='" + cls + "' data-id='" + s.id + "'>" + s.name + "</button>";
      html += "<button class='ask-mini' data-q='" + askQ.replace(/'/g, "&#39;") + "'>问AI</button>";
      html += "</div>";
    });
    el.innerHTML = html;
    el.querySelectorAll(".site-item").forEach(function (b) {
      b.addEventListener("click", function () {
        var s = null;
        for (var i = 0; i < SITES.length; i++) { if (SITES[i].id === b.getAttribute("data-id")) { s = SITES[i]; break; } }
        if (!s) return;
        showDetail(s);
        if (chart) chart.setOption({ geo: { center: [s.lng, s.lat], zoom: 4.5 } });
      });
    });
    el.querySelectorAll(".ask-mini").forEach(function (b) {
      b.addEventListener("click", function () {
        askAI(b.getAttribute("data-q"));
        var box = document.getElementById("ai-answer");
        if (box) box.scrollIntoView({ behavior: "smooth", block: "nearest" });
      });
    });
  }

  function showDetail(d) {
    var el = document.getElementById("detail");
    var askQ = d.ask || ("介绍一下" + d.name);
    var html = "<h3>" + d.name + " <span style='font-size:11px;color:#8a7a5a;font-weight:400'>" + d.type + "</span></h3>";
    html += "<span class='dynasty'>" + fmt(d.dynasty) + "</span>";
    html += "<div class='desc'>" + d.desc + "</div>";
    html += "<div class='src'>数据来源：" + fmt(d.source) + " · 坐标：公开地理数据</div>";
    html += "<button class='ask-btn' data-q='" + askQ.replace(/'/g, "&#39;") + "'>向 AI 助手追问：\"" + askQ + "\"</button>";
    el.innerHTML = html;
    var btn = el.querySelector(".ask-btn");
    if (btn) {
      btn.addEventListener("click", function () {
        askAI(btn.getAttribute("data-q"));
      });
    }
  }

  // 轻量 Markdown 渲染：###/## 标题、- 列表、**加粗**、> 引用
  function md(text) {
    if (!text) return "";
    return text
      .replace(/^###\s*(.+)$/gm, function (m, t) { return "<h4>" + t + "</h4>"; })
      .replace(/^##\s*(.+)$/gm, function (m, t) { return "<h4>" + t + "</h4>"; })
      .replace(/^\s*-\s+(.+)$/gm, function (m, t) { return "<li>" + t + "</li>"; })
      .replace(/^\s*>\s*(.+)$/gm, function (m, t) { return "<blockquote>" + t + "</blockquote>"; })
      .replace(/\*\*(.+?)\*\*/g, "<b>$1</b>")
      .replace(/\n{2,}/g, "\n");
  }

  function askAI(q) {
    var box = document.getElementById("ai-answer");
    box.innerHTML = "<div class='ai-loading'>正在向 AI 助手提问：" + q + " …</div>";
    // 在线版（GitHub Pages）：跳转到 AI 助手页自动提问（纯前端闭环）
    var here = location.pathname;
    if (here.indexOf("/map/") >= 0 || here.indexOf("/map") >= 0) {
      location.href = (here.replace(/map\/?$/, "") + "ai/?q=" + encodeURIComponent(q));
      return;
    }
    fetch("http://127.0.0.1:8000/api/ask", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question: q })
    }).then(function (r) { return r.json(); }).then(function (d) {
      var html = "<div class='ai-q'>" + q + "</div>";
      html += "<div class='ai-a'>" + md(d.answer) + "</div>";
      if (d.sources && d.sources.length) {
        html += "<div class='ai-src'>知识库条目：" + d.sources.map(function (s) { return s.title; }).join("、") + "</div>";
      }
      if (d.related && d.related.length) {
        html += "<div class='ai-rel'>推荐追问：" + d.related.slice(0, 3).map(function (t) { return t; }).join("；") + "</div>";
      }
      html += "<div class='ai-mode'>模式：" + (d.mode === "llm" ? "大模型增强" : "离线知识库") + "</div>";
      box.innerHTML = html;
    }).catch(function () {
      box.innerHTML = "<div class='ai-err'>AI 助手未连接（127.0.0.1:8000）。<br/>请先运行 AI 助手：<code>python app.py</code>（在 丝路智境-AI助手 目录）</div>";
    });
  }

  function renderRouteNote() {
    var el = document.getElementById("route-note");
    var html = "";
    ROUTES.forEach(function (r) {
      html += "<div class='r' style='border-color:" + r.color + "'>";
      html += "<b>" + r.name + "</b>：" + r.note + "</div>";
    });
    el.innerHTML = html;
  }

  function renderStats() {
    document.getElementById("st-grotto").textContent = STATS.grotto_count;
    document.getElementById("st-city").textContent = STATS.city_count;
    document.getElementById("st-fort").textContent = STATS.fort_count;
    document.getElementById("st-route").textContent = STATS.route_count;
  }

  function bindLayers() {
    var btns = document.querySelectorAll(".layer-btn");
    btns.forEach(function (b) {
      b.addEventListener("click", function () {
        btns.forEach(function (x) { x.classList.remove("active"); });
        b.classList.add("active");
        currentLayer = b.getAttribute("data-layer");
        chart.setOption({ series: visibleSeries() }, { replaceMerge: ["series"] });
      });
    });
  }

  function renderSources() {
    var body = document.getElementById("src-body");
    if (!body) return;
    var html = "<div class='src-head'>共 " + SITES.length + " 个点位 · 每个点位的数据来源如下</div>";
    SITES.forEach(function (s) {
      var t = s.type, color = TYPE_COLOR[t] || "#9EACEA";
      html += "<div class='src-row'><span class='src-ico' style='color:" + color + "'>" + (t === "石窟" ? "◇" : t === "关隘" ? "▲" : "●") + "</span>";
      html += "<div class='src-main'><b>" + s.name + "</b><div class='src-src'>" + (s.source || "公开资料") + "</div></div></div>";
    });
    body.innerHTML = html;
  }

  function bindSources() {
    var btn = document.getElementById("src-btn");
    var mask = document.getElementById("src-mask");
    var close = document.getElementById("src-close");
    if (!btn || !mask || !close) return;
    btn.addEventListener("click", function () {
      renderSources();
      mask.hidden = false;
    });
    close.addEventListener("click", function () { mask.hidden = true; });
    mask.addEventListener("click", function (e) { if (e.target === mask) mask.hidden = true; });
  }

  loadData(function (ok) {
    if (!ok) {
      document.getElementById("detail").innerHTML = "<div class='empty'>数据加载失败：请通过本地服务器访问本页面（python -m http.server 8100）</div>";
      return;
    }
    buildSeries();
    init();
    bindLayers();
    renderStats();
    renderRouteNote();
    renderSiteList();
    bindSources();
  });
})();
