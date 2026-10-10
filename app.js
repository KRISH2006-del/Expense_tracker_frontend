/* Expense Tracker - React front end (no build step; uses React.createElement). */
(function () {
  "use strict";
  var h = React.createElement;
  var useState = React.useState, useEffect = React.useEffect, useCallback = React.useCallback, useRef = React.useRef;

  var API_BASE = (window.APP_CONFIG && window.APP_CONFIG.API_BASE_URL) || "";
  var API = API_BASE + "/api/expenses";
  var CURRENCY = "INR";
  var LOCALE = "en-IN";
  var DEFAULT_CATEGORIES = ["Food", "Transport", "Rent", "Utilities", "Shopping", "Health", "Entertainment", "Education", "Other"];
  var COLORS = ["#4f46e5", "#059669", "#f59e0b", "#dc2626", "#0ea5e9", "#a855f7", "#ec4899", "#14b8a6", "#84cc16", "#64748b"];

  var fmtMoney = function (n) {
    return new Intl.NumberFormat(LOCALE, { style: "currency", currency: CURRENCY }).format(Number(n) || 0);
  };
  var fmtDate = function (iso) {
    var p = iso.split("-");
    return new Date(+p[0], +p[1] - 1, +p[2]).toLocaleDateString(LOCALE, { day: "2-digit", month: "short", year: "numeric" });
  };
  var fmtMonth = function (ym) {
    var p = ym.split("-");
    return new Date(+p[0], +p[1] - 1, 1).toLocaleDateString(LOCALE, { month: "short", year: "2-digit" });
  };
  var todayISO = function () {
    var d = new Date();
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  };
  var colorFor = function (name, names) {
    var i = names.indexOf(name);
    return COLORS[(i < 0 ? 0 : i) % COLORS.length];
  };

  /* ---------- API helper ---------- */
  function api(path, options) {
    return fetch(path, Object.assign({ headers: { "Content-Type": "application/json" } }, options)).then(function (res) {
      if (res.status === 204) return null;
      return res.json().catch(function () { return {}; }).then(function (body) {
        if (!res.ok) {
          var err = new Error(body.message || "Request failed (" + res.status + ")");
          err.fields = body.errors || {};
          throw err;
        }
        return body;
      });
    });
  }
  function toQuery(f) {
    var p = new URLSearchParams();
    if (f.category) p.set("category", f.category);
    if (f.from) p.set("from", f.from);
    if (f.to) p.set("to", f.to);
    if (f.q) p.set("q", f.q);
    var s = p.toString();
    return s ? "?" + s : "";
  }

  /* ---------- Summary cards ---------- */
  function Stat(props) {
    return h("div", { className: "card stat" },
      h("div", { className: "label" }, props.label),
      h("div", { className: "value" }, props.value));
  }
  function Stats(props) {
    var s = props.summary;
    var top = s && Object.keys(s.byCategory)[0];
    return h("div", { className: "stats" },
      h(Stat, { label: "Total expenditure", value: fmtMoney(s ? s.total : 0) }),
      h(Stat, { label: "Transactions", value: s ? s.count : 0 }),
      h(Stat, { label: "Average expense", value: fmtMoney(s ? s.average : 0) }),
      h(Stat, { label: "Top category", value: top || "—" }));
  }

  /* ---------- Charts (hand-drawn SVG) ---------- */
  function polar(cx, cy, r, angle) {
    return [cx + r * Math.cos(angle), cy + r * Math.sin(angle)];
  }
  function CategoryChart(props) {
    var data = props.data, names = Object.keys(data);
    var total = names.reduce(function (a, n) { return a + Number(data[n]); }, 0);
    if (!names.length || total <= 0) return h("div", { className: "empty" }, "No data to display");

    var cx = 90, cy = 90, R = 80, r = 50, start = -Math.PI / 2, paths = [];
    names.forEach(function (n) {
      var frac = Number(data[n]) / total, color = colorFor(n, props.allNames);
      if (frac >= 0.9999) {
        paths.push(h("circle", { key: n, cx: cx, cy: cy, r: (R + r) / 2, fill: "none", stroke: color, strokeWidth: R - r }));
        return;
      }
      var end = start + frac * 2 * Math.PI, large = frac > 0.5 ? 1 : 0;
      var a = polar(cx, cy, R, start), b = polar(cx, cy, R, end), c = polar(cx, cy, r, end), d = polar(cx, cy, r, start);
      var dPath = ["M", a[0], a[1], "A", R, R, 0, large, 1, b[0], b[1], "L", c[0], c[1], "A", r, r, 0, large, 0, d[0], d[1], "Z"].join(" ");
      paths.push(h("path", { key: n, d: dPath, fill: color }, h("title", null, n + ": " + fmtMoney(data[n]))));
      start = end;
    });

    return h("div", { className: "donut-wrap" },
      h("svg", { width: 180, height: 180, viewBox: "0 0 180 180", role: "img", "aria-label": "Spending by category" }, paths),
      h("ul", { className: "legend" }, names.map(function (n) {
        return h("li", { key: n },
          h("span", { className: "dot", style: { background: colorFor(n, props.allNames) } }),
          h("span", null, n + " — " + fmtMoney(data[n])),
          h("span", { className: "pct" }, Math.round(Number(data[n]) / total * 100) + "%"));
      })));
  }

  function MonthlyChart(props) {
    var months = Object.keys(props.data);
    if (!months.length) return h("div", { className: "empty" }, "No data to display");
    var vals = months.map(function (m) { return Number(props.data[m]); });
    var max = Math.max.apply(null, vals) || 1;
    var W = Math.max(320, months.length * 56), H = 220, padL = 8, padB = 28, padT = 22, plotH = H - padB - padT;
    var slot = (W - padL) / months.length, bw = Math.min(36, slot * 0.6);

    var bars = months.map(function (m, i) {
      var bh = Math.max(2, vals[i] / max * plotH), x = padL + i * slot + (slot - bw) / 2, y = padT + plotH - bh;
      return h("g", { key: m },
        h("rect", { x: x, y: y, width: bw, height: bh, rx: 4, fill: "#4f46e5" }, h("title", null, fmtMonth(m) + ": " + fmtMoney(vals[i]))),
        h("text", { x: x + bw / 2, y: y - 6, textAnchor: "middle", fontSize: 10, fill: "#374151" },
          new Intl.NumberFormat(LOCALE, { notation: "compact", maximumFractionDigits: 1 }).format(vals[i])),
        h("text", { x: x + bw / 2, y: H - 8, textAnchor: "middle", fontSize: 11, fill: "#6b7280" }, fmtMonth(m)));
    });
    return h("div", { style: { overflowX: "auto" } },
      h("svg", { width: W, height: H, viewBox: "0 0 " + W + " " + H, role: "img", "aria-label": "Monthly spending" },
        h("line", { x1: padL, x2: W, y1: padT + plotH, y2: padT + plotH, stroke: "#e5e7eb" }), bars));
  }

  /* ---------- Filters ---------- */
  function Filters(props) {
    var f = props.filters, set = props.onChange;
    var upd = function (key) { return function (e) { var n = Object.assign({}, f); n[key] = e.target.value; set(n); }; };
    return h("div", { className: "card filters" },
      h("label", { className: "field" }, "Search", h("input", { type: "search", placeholder: "Description…", value: f.q, onChange: upd("q") })),
      h("label", { className: "field" }, "Category",
        h("select", { value: f.category, onChange: upd("category") },
          h("option", { value: "" }, "All categories"),
          props.categories.map(function (c) { return h("option", { key: c, value: c }, c); }))),
      h("label", { className: "field" }, "From", h("input", { type: "date", value: f.from, max: f.to || undefined, onChange: upd("from") })),
      h("label", { className: "field" }, "To", h("input", { type: "date", value: f.to, min: f.from || undefined, onChange: upd("to") })),
      h("button", { className: "btn ghost", onClick: props.onReset }, "Clear filters"));
  }

  /* ---------- Expense form (add / edit) ---------- */
  function ExpenseForm(props) {
    var editing = props.expense;
    var init = editing
      ? { amount: String(editing.amount), category: editing.category, expenseDate: editing.expenseDate, description: editing.description || "" }
      : { amount: "", category: "", expenseDate: todayISO(), description: "" };
    var st = useState(init), form = st[0], setForm = st[1];
    var es = useState({}), errors = es[0], setErrors = es[1];
    var ss = useState(false), saving = ss[0], setSaving = ss[1];
    var firstRef = useRef(null);
    useEffect(function () { if (firstRef.current) firstRef.current.focus(); }, []);

    var upd = function (key) { return function (e) { var n = Object.assign({}, form); n[key] = e.target.value; setForm(n); }; };

    function validate() {
      var e = {};
      var amt = parseFloat(form.amount);
      if (!form.amount || isNaN(amt) || amt <= 0) e.amount = "Enter an amount greater than zero";
      else if (!/^\d{1,10}(\.\d{1,2})?$/.test(form.amount.trim())) e.amount = "Use at most 2 decimal places";
      if (!form.category.trim()) e.category = "Category is required";
      if (!form.expenseDate) e.expenseDate = "Date is required";
      return e;
    }
    function submit(ev) {
      ev.preventDefault();
      var e = validate();
      setErrors(e);
      if (Object.keys(e).length) return;
      setSaving(true);
      var payload = { amount: form.amount.trim(), category: form.category.trim(), expenseDate: form.expenseDate, description: form.description };
      var req = editing
        ? api(API + "/" + editing.id, { method: "PUT", body: JSON.stringify(payload) })
        : api(API, { method: "POST", body: JSON.stringify(payload) });
      req.then(function () { props.onSaved(editing ? "Expense updated" : "Expense added"); })
        .catch(function (err) { setSaving(false); setErrors(Object.assign({ _form: err.message }, err.fields)); });
    }

    var err = function (k) { return errors[k] ? h("span", { className: "field-error" }, errors[k]) : null; };
    return h("div", { className: "overlay", onMouseDown: function (e) { if (e.target === e.currentTarget) props.onClose(); } },
      h("form", { className: "modal", onSubmit: submit, noValidate: true },
        h("h2", null, editing ? "Edit expense" : "Add expense"),
        errors._form ? h("div", { className: "banner" }, errors._form) : null,
        h("div", { className: "form-grid" },
          h("label", { className: "field" }, "Amount (" + CURRENCY + ")",
            h("input", { ref: firstRef, type: "number", step: "0.01", min: "0.01", inputMode: "decimal", value: form.amount, onChange: upd("amount"), placeholder: "0.00" }), err("amount")),
          h("label", { className: "field" }, "Category",
            h("input", { list: "category-list", value: form.category, onChange: upd("category"), placeholder: "Choose or type a new one", maxLength: 50 }),
            h("datalist", { id: "category-list" }, props.categories.map(function (c) { return h("option", { key: c, value: c }); })), err("category")),
          h("label", { className: "field" }, "Date", h("input", { type: "date", value: form.expenseDate, onChange: upd("expenseDate") }), err("expenseDate")),
          h("label", { className: "field" }, "Description (optional)",
            h("input", { value: form.description, onChange: upd("description"), maxLength: 255, placeholder: "e.g. Lunch with team" }), err("description"))),
        h("div", { className: "modal-actions" },
          h("button", { type: "button", className: "btn ghost", onClick: props.onClose }, "Cancel"),
          h("button", { type: "submit", className: "btn", disabled: saving }, saving ? "Saving…" : editing ? "Save changes" : "Add expense"))));
  }

  /* ---------- Confirm delete ---------- */
  function ConfirmDelete(props) {
    var e = props.expense;
    return h("div", { className: "overlay", onMouseDown: function (ev) { if (ev.target === ev.currentTarget) props.onClose(); } },
      h("div", { className: "modal" },
        h("h2", null, "Delete expense?"),
        h("p", null, fmtMoney(e.amount) + " · " + e.category + " · " + fmtDate(e.expenseDate)),
        h("div", { className: "modal-actions" },
          h("button", { className: "btn ghost", onClick: props.onClose }, "Cancel"),
          h("button", { className: "btn danger", onClick: props.onConfirm }, "Delete"))));
  }

  /* ---------- Table ---------- */
  function ExpenseTable(props) {
    if (!props.expenses.length) {
      return h("div", { className: "card empty" }, props.loading ? "Loading…" : "No expenses found. Click “Add expense” to create one.");
    }
    return h("div", { className: "card table-wrap" },
      h("table", null,
        h("thead", null, h("tr", null,
          h("th", null, "Date"), h("th", null, "Category"), h("th", null, "Description"),
          h("th", { className: "num" }, "Amount"), h("th", null, ""))),
        h("tbody", null, props.expenses.map(function (e) {
          return h("tr", { key: e.id },
            h("td", null, fmtDate(e.expenseDate)),
            h("td", null, h("span", { className: "badge", style: { background: colorFor(e.category, props.allNames) } }, e.category)),
            h("td", null, e.description || h("span", { style: { color: "#9ca3af" } }, "—")),
            h("td", { className: "num" }, fmtMoney(e.amount)),
            h("td", { className: "actions" },
              h("button", { className: "btn ghost small", onClick: function () { props.onEdit(e); } }, "Edit"),
              h("button", { className: "btn ghost small", onClick: function () { props.onDelete(e); } }, "Delete")));
        }))));
  }

  /* ---------- App ---------- */
  var EMPTY_FILTERS = { q: "", category: "", from: "", to: "" };

  function App() {
    var s1 = useState([]), expenses = s1[0], setExpenses = s1[1];
    var s2 = useState(null), summary = s2[0], setSummary = s2[1];
    var s3 = useState([]), savedCats = s3[0], setSavedCats = s3[1];
    var s4 = useState(EMPTY_FILTERS), filters = s4[0], setFilters = s4[1];
    var s5 = useState(null), formState = s5[0], setFormState = s5[1];   // null | {expense|null}
    var s6 = useState(null), toDelete = s6[0], setToDelete = s6[1];
    var s7 = useState(true), loading = s7[0], setLoading = s7[1];
    var s8 = useState(null), loadError = s8[0], setLoadError = s8[1];
    var s9 = useState(null), toast = s9[0], setToast = s9[1];
    var s10 = useState(""), debouncedQ = s10[0], setDebouncedQ = s10[1];

    useEffect(function () {
      var t = setTimeout(function () { setDebouncedQ(filters.q); }, 300);
      return function () { clearTimeout(t); };
    }, [filters.q]);

    var load = useCallback(function () {
      var qs = toQuery({ q: debouncedQ, category: filters.category, from: filters.from, to: filters.to });
      setLoading(true);
      return Promise.all([api(API + qs), api(API + "/summary" + qs), api(API + "/categories")])
        .then(function (r) { setExpenses(r[0]); setSummary(r[1]); setSavedCats(r[2]); setLoadError(null); })
        .catch(function (e) { setLoadError(e.message || "Could not reach the server"); })
        .then(function () { setLoading(false); });
    }, [debouncedQ, filters.category, filters.from, filters.to]);

    useEffect(function () { load(); }, [load]);

    function notify(msg, isError) {
      setToast({ msg: msg, error: !!isError });
      setTimeout(function () { setToast(null); }, 2600);
    }
    function onSaved(msg) { setFormState(null); notify(msg); load(); }
    function confirmDelete() {
      var id = toDelete.id;
      setToDelete(null);
      api(API + "/" + id, { method: "DELETE" })
        .then(function () { notify("Expense deleted"); load(); })
        .catch(function (e) { notify(e.message, true); });
    }

    var allNames = Array.from(new Set(DEFAULT_CATEGORIES.concat(savedCats))).sort(function (a, b) { return a.localeCompare(b); });
    // Stable colour palette based on categories that actually exist
    var colorNames = savedCats.slice().sort(function (a, b) { return a.localeCompare(b); });
    var formCategories = allNames;
    var filterCategories = savedCats;

    return h("div", { className: "container" },
      h("div", { className: "header" },
        h("div", null, h("h1", null, "Expense Tracker"), h("p", null, "Record, filter and understand your spending")),
        h("button", { className: "btn", onClick: function () { setFormState({ expense: null }); } }, "+ Add expense")),

      loadError ? h("div", { className: "banner" }, "Could not load data: " + loadError + ". Is the backend running and MySQL reachable?") : null,

      h(Stats, { summary: summary }),
      h(Filters, { filters: filters, categories: filterCategories, onChange: setFilters, onReset: function () { setFilters(EMPTY_FILTERS); } }),

      h("div", { className: "charts" },
        h("div", { className: "card" }, h("h2", null, "Spending by category"),
          h(CategoryChart, { data: summary ? summary.byCategory : {}, allNames: colorNames })),
        h("div", { className: "card" }, h("h2", null, "Monthly spending"),
          h(MonthlyChart, { data: summary ? summary.byMonth : {} }))),

      h(ExpenseTable, {
        expenses: expenses, loading: loading, allNames: colorNames,
        onEdit: function (e) { setFormState({ expense: e }); },
        onDelete: setToDelete
      }),

      formState ? h(ExpenseForm, { expense: formState.expense, categories: formCategories, onClose: function () { setFormState(null); }, onSaved: onSaved }) : null,
      toDelete ? h(ConfirmDelete, { expense: toDelete, onClose: function () { setToDelete(null); }, onConfirm: confirmDelete }) : null,
      toast ? h("div", { className: "toast" + (toast.error ? " error" : "") }, toast.msg) : null);
  }

  ReactDOM.createRoot(document.getElementById("root")).render(h(App));
})();
