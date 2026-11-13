/* Plan B: poll published JSON. DATA_PATH comes from #d=…, APP_TOKEN from #t=…, then localStorage.
   Never log those values. Never invent a moving balance. */
(function () {
  const LS_D = "desk_d";
  const LS_T = "desk_t";
  const POLL_MS = 15000;

  function parseHash() {
    const raw = (location.hash || "").replace(/^#/, "");
    const out = {};
    raw.split("&").forEach(function (part) {
      const i = part.indexOf("=");
      if (i < 0) return;
      out[decodeURIComponent(part.slice(0, i))] = decodeURIComponent(part.slice(i + 1));
    });
    if (out.d) try { localStorage.setItem(LS_D, out.d); } catch (e) {}
    if (out.t) try { localStorage.setItem(LS_T, out.t); } catch (e) {}
    // Drop the token from the address bar once stored, keep d so reloads work.
    if (out.t && history.replaceState) {
      const keep = out.d ? "#d=" + encodeURIComponent(out.d) : "";
      history.replaceState(null, "", location.pathname + location.search + keep);
    }
    return out;
  }

  function dataPath() {
    parseHash();
    try { return localStorage.getItem(LS_D) || ""; } catch (e) { return ""; }
  }

  function baseUrl() {
    const d = dataPath();
    if (!d) return null;
    return "d/" + d + "/";
  }

  const state = { view: "home", stack: [], data: null, activity: [], coin: null, error: null };
  let timer = null;

  function $(id) { return document.getElementById(id); }
  function show(view) {
    document.querySelectorAll(".view").forEach(function (el) { el.hidden = true; });
    const el = $("view-" + view);
    if (el) el.hidden = false;
    const bar = $("tabbar");
    const tabs = { home: 1, agents: 1, activity: 1, account: 1 };
    if (bar) {
      bar.hidden = !tabs[view];
      bar.querySelectorAll("button").forEach(function (b) {
        b.classList.toggle("on", b.getAttribute("data-tab") === view);
      });
    }
    state.view = view;
  }

  function fmtUsd(n) {
    if (n === null || n === undefined || n === "—") return "—";
    const x = Number(n);
    if (!isFinite(x)) return "—";
    return "$" + x.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  function fmtPct(n) {
    const x = Number(n);
    if (!isFinite(x)) return "—";
    const sign = x > 0 ? "+" : "";
    return sign + x.toFixed(2) + "%";
  }

  function setBoot(msg, isError) {
    show("boot");
    $("boot-msg").textContent = msg;
    $("boot-msg").classList.toggle("error", !!isError);
    $("tabbar").hidden = true;
  }

  async function fetchJson(name) {
    const base = baseUrl();
    if (!base) throw new Error("missing-d");
    const resp = await fetch(base + name, { cache: "no-store" });
    if (!resp.ok) throw new Error("http-" + resp.status);
    return resp.json();
  }

  async function refresh() {
    try {
      const [s, a] = await Promise.all([fetchJson("state.json"), fetchJson("activity.json")]);
      state.data = s;
      state.activity = (a && a.items) || [];
      state.error = null;
      if (state.view === "boot" || state.view === "error") show("home");
      render();
    } catch (err) {
      state.error = err;
      if (!state.data) {
        if (String(err.message) === "missing-d") {
          setBoot("Open this app with the desk link so it can find its data.", true);
        } else {
          show("error");
          $("error-msg").textContent = "Waiting for the desk to publish, or the data path is wrong.";
          $("tabbar").hidden = true;
        }
      }
    }
  }

  function render() {
    const s = state.data;
    if (!s) return;
    renderHome(s);
    renderAgents(s);
    renderActivity();
    renderAccount(s);
    if (state.view === "coin" && state.coin) renderCoin(state.coin, true);
    if (state.view === "auditor") renderAuditor(s);
  }

  function renderHome(s) {
    const mode = s.mode || "PAPER";
    const pill = $("home-mode");
    pill.textContent = mode;
    pill.className = "mode-pill " + String(mode).toLowerCase();
    $("home-balance").textContent = fmtUsd(s.balance);
    const today = $("home-today");
    today.textContent = fmtPct(s.todayPct) + " today · " + (Number(s.multiplier) || 1).toFixed(2) + "×";
    today.className = "today " + (s.todayPct > 0 ? "up" : s.todayPct < 0 ? "down" : "");
    const ticket = $("home-ticket");
    if (s.ticketCheck && s.ticketCheck.message) {
      ticket.hidden = false;
      ticket.textContent = s.ticketCheck.message;
    } else {
      ticket.hidden = true;
    }
    const pos = $("home-positions");
    const opens = s.openPositions || [];
    if (!opens.length) {
      pos.innerHTML = '<div class="empty">No open positions.</div>';
    } else {
      pos.innerHTML = opens.map(function (p) {
        const label = p.symbol || p.name || (p.mint || "").slice(0, 6);
        const url = p.url || "#";
        return '<div class="item" data-mint="' + esc(p.mint) + '"><div class="left"><div class="title">' +
          esc(label) + '</div><div class="sub">' + fmtUsd(p.sizeUsd) + '</div></div>' +
          '<div class="right"><a href="' + esc(url) + '" target="_blank" rel="noopener">Sell on FOMO</a></div></div>';
      }).join("");
      bindCoinClicks(pos);
    }
    $("home-activity").innerHTML = activityHtml(state.activity.slice(0, 8), "No activity yet.");
    bindCoinClicks($("home-activity"));
  }

  function renderAgents(s) {
    const cards = s.agents || {};
    const order = ["scanner", "auditor", "analyst", "executor", "risk"];
    $("agent-cards").innerHTML = order.map(function (key) {
      const c = cards[key] || {};
      let extra = "";
      if (key === "risk") {
        extra = '<div class="pills"><span class="pill stop">stop -' + esc(c.stopPct) +
          '%</span><span class="pill trail">trail ' + esc(c.trailPct) + '%</span></div>';
      }
      const go = key === "auditor" ? ' data-open-auditor="1"' : "";
      return '<div class="card"' + go + '><div class="name">' + esc(c.name || key) +
        '</div><div class="stat">' + esc(c.card || c.status || "Idle") + '</div>' + extra + "</div>";
    }).join("");
    const auditBtn = $("agent-cards").querySelector("[data-open-auditor]");
    if (auditBtn) auditBtn.addEventListener("click", function () { show("auditor"); renderAuditor(s); });
    // Scanner feed comes from activity + we don't invent coins. Show waiting honestly.
    const waiting = (cards.scanner && cards.scanner.waiting) || 0;
    const feed = $("scanner-feed");
    if (!waiting && !(cards.scanner && cards.scanner.killedToday)) {
      feed.innerHTML = '<div class="empty">No pools in the waiting room.</div>';
    } else {
      feed.innerHTML = '<div class="empty">' + waiting + " in the waiting room tonight.</div>";
    }
  }

  function renderAuditor(s) {
    const c = (s.agents || {}).auditor || {};
    $("auditor-status").textContent = c.card || c.detail || c.status || "Idle";
    // Without a selected mint, show empty 4x2 layer strips.
    const host = $("auditor-layers");
    const names = ["Mint authority","Freeze authority","Dev wallet","Top 10 holders","Liquidity","Pool age","Bundled wallets","Delegations"];
    let layers = [];
    if (state.coin && state.coin.audit && state.coin.audit.layers) layers = state.coin.audit.layers;
    if (!layers.length) {
      host.innerHTML = names.map(function (n, i) {
        return '<div class="layer pending"><div class="n">' + (i + 1) + " · " + n + '</div><div class="v">not checked</div></div>';
      }).join("");
      $("auditor-empty").hidden = false;
    } else {
      $("auditor-empty").hidden = true;
      host.innerHTML = names.map(function (n, i) {
        const L = layers.find(function (x) { return x.n === i + 1; });
        if (!L) return '<div class="layer pending"><div class="n">' + (i + 1) + " · " + n + '</div><div class="v">not checked</div></div>';
        const cls = L.pass ? "ok" : "red";
        return '<div class="layer ' + cls + '"><div class="n">' + (i + 1) + " · " + esc(L.name || n) +
          '</div><div class="v">' + esc(L.value) + "</div></div>";
      }).join("");
    }
  }

  function renderActivity() {
    const items = state.activity;
    $("activity-empty").hidden = items.length > 0;
    $("activity-list").innerHTML = activityHtml(items, "");
    bindCoinClicks($("activity-list"));
  }

  function activityHtml(items, empty) {
    if (!items || !items.length) return '<div class="empty">' + (empty || "No activity yet.") + "</div>";
    return items.map(function (it) {
      const amt = it.amountUsd != null ? fmtUsd(it.amountUsd) : "";
      const pct = it.pct != null ? fmtPct(it.pct) : "";
      const href = it.mint ? ' data-mint="' + esc(it.mint) + '"' : "";
      const link = it.link ? '<a href="' + esc(it.link) + '" target="_blank" rel="noopener">FOMO</a>' : "";
      return '<div class="item"' + href + '><div class="left"><div class="title">' + esc(it.title || it.kind) +
        '</div><div class="sub">' + esc(it.detail || "") + "</div></div><div class=\"right\">" +
        amt + (pct ? "<br>" + pct : "") + (link ? "<br>" + link : "") + "</div></div>";
    }).join("");
  }

  function renderAccount(s) {
    $("acct-mode").textContent = s.mode || "—";
    fetchJson("account.json").then(function (acct) {
      $("acct-mode").textContent = acct.mode || s.mode || "—";
      $("acct-handle").textContent = acct.fomoHandle || "—";
      $("acct-notifier").textContent = acct.notifier || "—";
      $("acct-report").textContent = acct.reportTime || "—";
      if (acct.signupUrl) $("acct-signup").href = acct.signupUrl;
    }).catch(function () {});
    fetchJson("settings.json").then(function (payload) {
      const conf = (payload && payload.settings) || {};
      const keys = Object.keys(conf).sort();
      $("acct-settings").innerHTML = keys.map(function (k) {
        return '<div class="row"><span>' + esc(k) + "</span><span>" + esc(conf[k]) + "</span></div>";
      }).join("");
    }).catch(function () {
      $("acct-settings").innerHTML = '<div class="empty">Settings are not available yet.</div>';
    });
    if (s.signupUrl) $("acct-signup").href = s.signupUrl;
  }

  function bindCoinClicks(root) {
    if (!root) return;
    root.querySelectorAll("[data-mint]").forEach(function (el) {
      el.addEventListener("click", function (ev) {
        if (ev.target.closest("a")) return;
        openCoin(el.getAttribute("data-mint"));
      });
    });
  }

  async function openCoin(mint) {
    show("coin");
    $("coin-title").textContent = mint.slice(0, 6) + "…";
    $("coin-empty").hidden = true;
    $("coin-error").hidden = true;
    $("coin-body").hidden = true;
    try {
      const data = await fetchJson("coin/" + mint + ".json");
      state.coin = data;
      renderCoin(data, false);
    } catch (e) {
      $("coin-error").hidden = false;
    }
  }

  function renderCoin(data, quiet) {
    if (!data) return;
    $("coin-body").hidden = false;
    $("coin-title").textContent = data.symbol || data.name || (data.mint || "").slice(0, 6);
    $("coin-price").textContent = fmtUsd(data.priceUsd);
    const a = $("coin-link");
    if (data.url) { a.href = data.url; a.hidden = false; } else { a.hidden = true; }
    if (window.DeskChart) DeskChart.draw($("coin-chart"), data.prices || [], data.exitLine);
    const bits = [];
    if (data.holders != null) bits.push(data.holders + " holders");
    if (data.status) bits.push(data.status);
    if (data.position && data.position.stopPct) bits.push("stop -" + data.position.stopPct + "%");
    $("coin-meta").textContent = bits.join(" · ") || "";
  }

  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  $("tabbar").addEventListener("click", function (ev) {
    const btn = ev.target.closest("[data-tab]");
    if (!btn) return;
    show(btn.getAttribute("data-tab"));
    render();
  });
  document.querySelectorAll("[data-back]").forEach(function (b) {
    b.addEventListener("click", function () { show("agents"); render(); });
  });

  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("sw.js").catch(function () {});
  }

  parseHash();
  if (!dataPath()) {
    setBoot("Open this app with the desk link so it can find its data.", true);
  } else {
    setBoot("Loading the desk…", false);
    refresh();
    timer = setInterval(refresh, POLL_MS);
  }
})();
