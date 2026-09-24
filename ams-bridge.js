/**
 * Runs inside https://ams-web.omanairports.co.om (via bookmarklet).
 * Fetches movements and sends them to Book List (GitHub Pages) — no .bat / Python.
 */
(function () {
  "use strict";
  var API = "https://amswebapi.omanairports.co.om/api/";
  var BOOKLIST = "https://khalidsaif912.github.io/book-list/";
  var HEADERS = ["Dep Flt", "Airline Name", "Status", "Nature", "Dest.", "STD", "Dep Stand"];
  var ALIASES = {
    "Dep Flt": ["Dep Flt", "DepFlt", "FlightNumber", "Flight No", "FlightNo", "FLNO", "DepartureFlightNumber", "DepFlightNumber", "Flight"],
    "Airline Name": ["Airline Name", "AirlineName", "Airline", "CarrierName", "Carrier", "OperatorName", "AirlineDescription"],
    "Status": ["Status", "FlightStatus", "PublicStatus", "OperationalStatus", "DepStatus", "DepartureStatus"],
    "Nature": ["Nature", "FlightNature", "ServiceType", "TrafficType", "FlightType", "I/D", "ID", "InternationalDomestic"],
    "Dest.": ["Dest.", "Dest", "Destination", "DestinationAirport", "ArrAirport", "ArrivalAirport", "ToAirport", "ArrivalIata", "DestinationIata"],
    "STD": ["STD", "ScheduledDeparture", "SchedDep", "ScheduledDep", "BestDeparture", "DepartureScheduled", "SOBT", "EOBT"],
    "Dep Stand": ["Dep Stand", "DepStand", "Stand", "ParkingStand", "DepartureStand", "AircraftStand", "StandPosition"],
  };

  function toast(msg, isErr) {
    var el = document.getElementById("booklist-ams-toast");
    if (!el) {
      el = document.createElement("div");
      el.id = "booklist-ams-toast";
      el.setAttribute("style", "position:fixed;z-index:999999;left:50%;bottom:24px;transform:translateX(-50%);max-width:90vw;padding:12px 16px;border-radius:12px;font:600 14px/1.4 sans-serif;box-shadow:0 8px 24px rgba(0,0,0,.2);background:#1c1915;color:#fff;");
      document.body.appendChild(el);
    }
    el.style.background = isErr ? "#b42318" : "#1c1915";
    el.textContent = msg;
    clearTimeout(el._t);
    el._t = setTimeout(function () { el.remove(); }, 8000);
  }

  function findToken() {
    var re = /eyJ[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+/;
    var cookies = document.cookie.split(";");
    for (var i = 0; i < cookies.length; i++) {
      var raw = cookies[i].replace(/^[^=]+=/, "");
      try { raw = decodeURIComponent(raw.trim()); } catch (e) {}
      var m = raw.match(re);
      if (m) return m[0];
    }
    var stores = [];
    try { stores.push(localStorage); } catch (e) {}
    try { stores.push(sessionStorage); } catch (e) {}
    for (var s = 0; s < stores.length; s++) {
      var store = stores[s];
      for (var j = 0; j < store.length; j++) {
        var v = store.getItem(store.key(j)) || "";
        var mm = v.match(re);
        if (mm) return mm[0];
      }
    }
    return "";
  }

  function asRows(payload) {
    if (!payload) return [];
    if (Array.isArray(payload)) {
      return payload.map(function (item) {
        if (item && typeof item === "object" && !Array.isArray(item)) return item;
        if (Array.isArray(item)) {
          var d = {};
          item.forEach(function (pair) {
            if (pair && pair.Key != null) d[String(pair.Key)] = pair.Value;
          });
          return d;
        }
        return null;
      }).filter(Boolean);
    }
    if (typeof payload === "object") {
      var keys = ["Movements", "Flights", "Data", "Items", "Result", "value"];
      for (var k = 0; k < keys.length; k++) {
        if (payload[keys[k]] != null) return asRows(payload[keys[k]]);
      }
      return [payload];
    }
    return [];
  }

  function normKey(s) {
    return String(s || "").toLowerCase().replace(/[^a-z0-9]/g, "");
  }

  function cell(row, aliases) {
    var exact = {};
    var lower = {};
    var norm = {};
    Object.keys(row || {}).forEach(function (k) {
      exact[k] = row[k];
      lower[String(k).toLowerCase()] = row[k];
      norm[normKey(k)] = row[k];
    });
    var val = null;
    for (var i = 0; i < aliases.length; i++) {
      var a = aliases[i];
      if (exact[a] != null && exact[a] !== "") { val = exact[a]; break; }
      if (lower[a.toLowerCase()] != null && lower[a.toLowerCase()] !== "") { val = lower[a.toLowerCase()]; break; }
      if (norm[normKey(a)] != null && norm[normKey(a)] !== "") { val = norm[normKey(a)]; break; }
    }
    if (val == null) return "";
    if (val && typeof val === "object" && !Array.isArray(val)) {
      val = val.Value || val.Text || val.Name || val.Code || val.Display || "";
    }
    if (Array.isArray(val)) val = val.filter(Boolean).join(", ");
    var text = String(val).trim();
    if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(text)) return text.slice(11, 16);
    return text;
  }

  function toMissionRows(movements) {
    var out = [HEADERS.slice()];
    movements.forEach(function (m) {
      var direction = String(m.Direction || m.FlightKind || m.ArrDep || m["I/D"] || "").toLowerCase();
      if (direction === "a" || direction === "arr" || direction === "arrival" || direction === "inbound") return;
      var values = HEADERS.map(function (h) { return cell(m, ALIASES[h]); });
      if (!values[0] || values.every(function (v) { return !v; })) return;
      out.push(values);
    });
    return out;
  }

  function todayLocal() {
    var d = new Date();
    var off = d.getTimezoneOffset() * 60000;
    return new Date(d.getTime() - off).toISOString().slice(0, 10);
  }

  function sendToBookList(rows) {
    var url = BOOKLIST + "?ams=1#mission";
    var w = window.open(url, "booklist-mission");
    var payload = { type: "booklist-ams-rows", rows: rows, source: "ams-bridge" };
    var n = 0;
    var timer = setInterval(function () {
      n += 1;
      try {
        if (w && !w.closed) w.postMessage(payload, "https://khalidsaif912.github.io");
      } catch (e) {}
      if (n >= 15) {
        clearInterval(timer);
        try {
          localStorage.setItem("booklistAmsBridgeRows", JSON.stringify(rows));
        } catch (e2) {}
        toast("تم الجلب (" + (rows.length - 1) + "). إن لم تُفتح Book List، ارفع الملف من التصدير أو افتح الموقع يدوياً.");
      }
    }, 400);
  }

  async function run() {
    if (location.hostname.indexOf("omanairports") === -1) {
      toast("افتح موقع AMS أولاً وسجّل الدخول، ثم شغّل الأداة من المفضلة.", true);
      return;
    }
    var token = findToken();
    if (!token) {
      toast("لم يُعثر على جلسة AMS. سجّل الدخول في AMS ثم أعد المحاولة.", true);
      return;
    }
    var date = prompt("تاريخ الجلب (YYYY-MM-DD)", todayLocal());
    if (!date) return;
    var from = date + "T00:00:00";
    var to = date + "T23:59:59";
    var airport = prompt("رمز المطار", "MCT") || "MCT";
    toast("جاري الجلب من AMS…");
    try {
      var url = API + "Movements/GetMovements?airportCode=" + encodeURIComponent(airport) +
        "&from=" + encodeURIComponent(from) + "&to=" + encodeURIComponent(to);
      var res = await fetch(url, {
        headers: {
          Accept: "application/json",
          "X-AMSAuthorization": token,
        },
        credentials: "include",
      });
      if (res.status === 401 || res.status === 403) {
        toast("انتهت الجلسة. سجّل الدخول في AMS ثم أعد المحاولة.", true);
        return;
      }
      if (!res.ok) {
        toast("فشل الجلب من AMS (" + res.status + ").", true);
        return;
      }
      var body = await res.json();
      var rows = toMissionRows(asRows(body));
      if (rows.length < 2) {
        toast("لا توجد رحلات في هذا النطاق.", true);
        return;
      }
      toast("تم — " + (rows.length - 1) + " رحلة. جاري الفتح في Book List…");
      sendToBookList(rows);
    } catch (err) {
      toast("تعذر الاتصال بـ AMS API من هذه الصفحة.", true);
    }
  }

  run();
})();
