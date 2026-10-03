/* ============================================================
   丝路智境 · 甘肃文化AI助手（纯前端版）
   ------------------------------------------------------------
   零后端依赖：词典分词 + BM25 检索 + 结构化回答组装
   150 条知识库数据在 data/*.json，完全离线运行
   ============================================================ */
(function () {
  "use strict";

  var DATA_FILES = [
    "data/dunhuang.json", "data/dunhuang2.json", "data/dunhuang3.json",
    "data/dunhuang4.json",
    "data/silkroad.json", "data/silkroad2.json", "data/people.json",
    "data/grottoes.json", "data/pottery.json", "data/bamboo.json",
    "data/relics.json", "data/relics2.json", "data/gansu2.json", "data/lanzhou.json",
    "data/national.json", "data/ethnic-detail.json", "data/heritage.json",
    "data/heritage2.json", "data/history-geo.json", "data/history-geo2.json",
    "data/red-culture.json",
    "data/food-festival.json", "data/food2.json", "data/modern.json"
  ];

  var STOPWORDS = new Set(("的 了 是 在 和 与 及 或 一个 什么 为什么 怎么 怎样 如何 吗 呢 吧 啊 请 帮 我 你 他 她 它 这 那 有 没有 呀 嘛 都 也 就 而 对 从 到 于 其 之 着 得 被 把 让 哪些 哪里 啥 谁 多少 大概 请问 介绍 讲讲 说 了解 知道 关于 有关 一下 一下").split(" "));

  var GENERIC_WORDS = new Set(("甘肃 甘肃省 兰州 省 市 县 镇 中国 中华 文化 历史 地方 地区 区域 介绍 讲 说 请问 想 要 了解 相关 知识 内容 故事 艺术 价值").split(" "));

  var KNOWLEDGE = [];
  var INDEX = [];        // 每篇分词文档
  var DOC_LEN = [];
  var TERM_FREQ = [];    // 每篇词频 {token: count}
  var DF = {};           // 全局文档频率
  var N_DOCS = 0;
  var AVG_DL = 25;

  var DICT = new Set();  // 自定义词典（最大正向匹配用）

  /* ---------- 词典构建：预置文化词 + 知识库关键词 ---------- */
  var PRESET = ["莫高窟", "九色鹿", "榆林窟", "炳灵寺", "麦积山", "天梯山", "马蹄寺", "文殊山",
    "西千佛洞", "马家窑", "悬泉置", "居延汉简", "悬泉汉简", "河西走廊", "藏经洞", "敦煌学",
    "数字敦煌", "铜奔马", "马踏飞燕", "嘉峪关", "河西四郡", "张骞", "鹿王本生", "反弹琵琶",
    "彩陶", "大地湾", "凉州模式", "锁阳城", "玉门关", "阳关", "武威", "张掖", "酒泉", "天水",
    "敦煌壁画", "莫高窟历史", "兰州牛肉面", "驴肉黄面", "裕固族", "东乡族", "保安族",
    "刻葫芦", "庆阳香包", "洮砚", "会宁会师", "南梁", "黄河文化", "七彩丹霞", "月牙泉",
    "敦煌研究院", "常书鸿", "段文杰", "樊锦诗", "建弘元年", "凉州模式", "东方雕塑陈列馆",
    "三十三天", "石窟鼻祖", "姊妹窟", "丝路重镇", "烽燧", "沙州", "甘州", "肃州", "凉州",
    "马家窑文化", "齐家文化", "大地湾遗址", "伏羲", "女娲", "黄河铁桥", "中山桥", "白塔山"];
  PRESET.forEach(function (w) { DICT.add(w); });

  function _entryText(e) {
    var parts = [e.title || "", e.topic || ""];
    parts = parts.concat(e.keywords || []);
    parts = parts.concat(e.questions || []);
    var ans = e.answer || {};
    parts.push(ans.summary || "");
    (ans.sections || []).forEach(function (s) { parts.push(s.body || ""); });
    return parts.join(" ");
  }

  /* ---------- 分词：词典最大正向匹配 + 单字兜底 ---------- */
  function _tokenize(text) {
    var out = [];
    var i = 0;
    var n = text.length;
    while (i < n) {
      var ch = text[i];
      if (/[\u4e00-\u9fa5]/.test(ch)) {
        var matched = null;
        for (var L = Math.min(8, n - i); L >= 2; L--) {
          var cand = text.substr(i, L);
          if (DICT.has(cand)) { matched = cand; break; }
        }
        if (matched) {
          out.push(matched);
          i += matched.length;
        } else {
          out.push(ch);
          i += 1;
        }
      } else if (/[A-Za-z0-9]/.test(ch)) {
        var j = i;
        while (j < n && /[A-Za-z0-9]/.test(text[j])) j++;
        out.push(text.substr(i, j - i));
        i = j;
      } else {
        i += 1;
      }
    }
    return out.filter(function (t) {
      return t && t.trim() && !STOPWORDS.has(t) && !/^[。，！？、；：""''（）\s]+$/.test(t);
    });
  }

  /* ---------- 索引构建 ---------- */
  function buildIndex() {
    KNOWLEDGE.forEach(function (e) {
      var toks = _tokenize(_entryText(e));
      INDEX.push(toks);
      DOC_LEN.push(toks.length);
      var tf = {};
      toks.forEach(function (t) { tf[t] = (tf[t] || 0) + 1; });
      TERM_FREQ.push(tf);
      Object.keys(tf).forEach(function (t) { DF[t] = (DF[t] || 0) + 1; });
    });
    N_DOCS = INDEX.length;
    var sum = 0;
    DOC_LEN.forEach(function (l) { sum += l; });
    AVG_DL = N_DOCS ? sum / N_DOCS : 25;
  }

  /* ---------- BM25 ---------- */
  function bm25(queryTokens, k1, b) {
    k1 = k1 || 1.5; b = b || 0.75;
    var scores = [];
    for (var i = 0; i < N_DOCS; i++) {
      var tf = TERM_FREQ[i];
      var dl = DOC_LEN[i];
      var score = 0;
      for (var q = 0; q < queryTokens.length; q++) {
        var t = queryTokens[q];
        if (!tf[t]) continue;
        var df = DF[t] || 1;
        var idf = Math.log((N_DOCS - df + 0.5) / (df + 0.5) + 1.0);
        score += idf * (tf[t] * (k1 + 1)) / (tf[t] + k1 * (1 - b + b * dl / AVG_DL));
      }
      scores.push(score);
    }
    return scores;
  }

  function _coreTokens(tokens) {
    var out = [];
    tokens.forEach(function (t) {
      if (GENERIC_WORDS.has(t)) return;
      var df = DF[t] || 1;
      if (df < N_DOCS * 0.5) out.push(t);
    });
    return out;
  }

  /* ---------- 回答组装（与 Python 版一致） ---------- */
  function buildAnswer(e) {
    var ans = e.answer || {};
    var lines = [];
    lines.push("**" + (ans.summary || "关于这个问题：") + "**");
    (ans.sections || []).forEach(function (s) {
      lines.push("\n### " + (s.heading || ""));
      lines.push(s.body || "");
    });
    if (ans.tips) lines.push("\n> 💡 " + ans.tips);
    var related = KNOWLEDGE.filter(function (x) { return x.id !== e.id; });
    var rec = [];
    related.forEach(function (x) { if (x.topic === e.topic && rec.length < 3) rec.push(x); });
    if (rec.length < 3) {
      related.forEach(function (x) { if (x.topic !== e.topic && rec.length < 3) rec.push(x); });
    }
    if (rec.length) {
      lines.push("\n### 你可能还想了解");
      rec.slice(0, 3).forEach(function (x) {
        var q = (x.questions && x.questions[0]) || ("介绍一下" + (x.title || ""));
        lines.push("- **" + (x.title || "") + "**：" + q);
      });
    }
    return lines.join("\n");
  }

  function buildFallback() {
    var hot = [
      "敦煌壁画为什么保存千年？", "九色鹿的故事是什么？",
      "莫高窟是什么时候开凿的？", "丝绸之路的路线是怎样的？",
      "马家窑彩陶是什么？", "铜奔马（马踏飞燕）是什么？"
    ];
    var lines = [
      "抱歉，我暂时还没有完全掌握这个问题的资料。甘肃文化浩瀚如海，我目前重点整理了**敦煌壁画、丝绸之路、甘肃石窟、彩陶文化、汉简、丝路遗珍**六大主题。",
      "你可以试试这样问我："
    ];
    hot.forEach(function (q) { lines.push("- " + q); });
    lines.push("\n> 提示：知识库会持续扩充，也可以直接在作品说明文档中说明当前覆盖范围。");
    return lines.join("\n");
  }

  function answerQuestion(question) {
    var qTokens = _tokenize(question);
    if (!qTokens.length) return { answer: buildFallback(), sources: [], related: [] };
    var scores = bm25(qTokens);
    var order = scores.map(function (s, idx) { return idx; })
      .sort(function (a, b) { return scores[b] - scores[a]; });
    var best = scores[order[0]];
    var hits = [];
    for (var k = 0; k < Math.min(3, order.length); k++) {
      if (scores[order[k]] > 0) hits.push(KNOWLEDGE[order[k]]);
    }
    var core = _coreTokens(qTokens);
    if (core.length) {
      var top = KNOWLEDGE[order[0]];
      var target = (top.title || "") + " " + ((top.answer || {}).summary || "");
      var hitCore = false;
      for (var c = 0; c < core.length; c++) {
        if (target.indexOf(core[c]) >= 0) { hitCore = true; break; }
      }
      if (!hitCore) return { answer: buildFallback(), sources: [], related: [] };
    }
    if (!hits.length || best < 0.001) return { answer: buildFallback(), sources: [], related: [] };
    return {
      answer: buildAnswer(hits[0]),
      sources: hits.map(function (e) { return { id: e.id, title: e.title, topic: e.topic }; }),
      related: hits.reduce(function (a, e) { return a.concat((e.questions || []).slice(0, 2)); }, [])
    };
  }

  /* ---------- 界面 ---------- */
  function escapeHtml(s) {
    return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }
  function md2html(text) {
    if (!text) return "";
    var safe = escapeHtml(text);
    safe = safe.replace(/^###\s*(.+)$/gm, "<h4>$1</h4>")
      .replace(/^##\s*(.+)$/gm, "<h4>$1</h4>")
      .replace(/^\s*-\s+(.+)$/gm, "<li>$1</li>")
      .replace(/\*\*(.+?)\*\*/g, "<b>$1</b>")
      .replace(/\n{2,}/g, "\n");
    return safe;
  }
  function addMsg(text, role) {
    var chat = document.getElementById("chat");
    var box = document.createElement("div");
    box.className = "msg " + role;
    var inner = document.createElement("div");
    inner.className = "bubble";
    if (role === "bot") {
      inner.innerHTML = md2html(text) + "<div class='meta'>离线知识库模式 · 检索增强问答</div>";
    } else {
      inner.textContent = text;
    }
    box.appendChild(inner);
    chat.appendChild(box);
    chat.scrollTop = chat.scrollHeight;
    return box;
  }
  function load() {
    var status = document.getElementById("status");
    var chips = document.getElementById("chips");
    // 双击打开（file://）时浏览器会拦截 fetch，给出明确引导而不是显示"0 条"
    if (location.protocol === "file:") {
      status.innerHTML = '<span class="dot" style="background:#ea6668"></span>请用本地服务器打开';
      document.getElementById("chat").insertAdjacentHTML("afterbegin",
        "<div class='msg bot'><div class='bubble'>检测到直接双击打开（file:// 协议），浏览器会拦截本地数据加载。" +
        "请在本目录运行 <b>python -m http.server 8200</b>，然后访问 http://127.0.0.1:8200/ai/</div></div>");
      return;
    }
    var queue = DATA_FILES.slice();
    function next() {
      if (!queue.length) {
        buildIndex();
        status.textContent = "知识库 " + N_DOCS + " 条 · 离线运行";
        var hot = ["敦煌壁画为什么保存千年？", "莫高窟有多少个洞窟？", "九色鹿的故事是什么？", "兰州牛肉面有什么特点？"];
        hot.forEach(function (q) {
          var c = document.createElement("button");
          c.className = "chip";
          c.textContent = q;
          c.addEventListener("click", function () { ask(q); });
          chips.appendChild(c);
        });
        // 支持 URL 参数自动提问（如 ai/?q=莫高窟有多少个洞窟）
        var qs = (location.search || "").replace(/^\?/, "");
        var m = qs.match(/(?:^|[?&])q=([^&]+)/);
        if (m && decodeURIComponent(m[1]).trim()) {
          ask(decodeURIComponent(m[1]));
        }
        return;
      }
      var f = queue.shift();
      fetch(f).then(function (r) { return r.json(); }).then(function (d) {
        KNOWLEDGE = KNOWLEDGE.concat(d);
        next();
      }).catch(function () { next(); });
    }
    next();
  }
  function ask(q) {
    q = (q || "").trim();
    if (!q) return;
    addMsg(q, "user");
    document.getElementById("input").value = "";
    var res = answerQuestion(q);
    addMsg(res.answer, "bot");
  }
  function bind() {
    var input = document.getElementById("input");
    var send = document.getElementById("send");
    function go() { ask(input.value); }
    send.addEventListener("click", go);
    input.addEventListener("keydown", function (e) {
      if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); go(); }
    });
    document.getElementById("status").textContent = "知识库加载中…";
  }
  bind();
  load();
})();
