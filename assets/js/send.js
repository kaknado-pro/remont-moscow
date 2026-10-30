"use strict";

/* =====================================================================
 * Отправка заявок сайта remont-moscow (Tilda-копия)
 * ---------------------------------------------------------------------
 * Формы с классом .form-submit перехватываются (до обработчиков Tilda)
 * и отправляются на рабочий backend — https://remont-kaknado.ru/sendmail.php
 * (тот же, что у основного сайта заказчика). После отправки — редирект
 * на thankyou.html.
 * =================================================================== */

const CONFIG = {
  THANKYOU_URL: "./thankyou.html",
  SUBMIT_DELAY_MS: 600,
};

const PRODUCTION_SEND_URL = "https://remont-kaknado.ru/sendmail.php";
window.SEND_CONFIG = CONFIG;

/* ------------------------- утилиты ------------------------------- */

function digits(value) {
  return String(value || "").replace(/\D/g, "");
}

function isValidPhone(value) {
  // с маской: либо 10 цифр (без кода страны), либо 11 (+7…)
  const d = digits(value);
  return d.length === 10 || d.length === 11;
}

function escapeHtml(text) {
  return String(text == null ? "" : text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function utmQuery() {
  const params = new URLSearchParams(window.location.search);
  const utm = {};
  ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term"].forEach(function (key) {
    if (params.get(key)) utm[key] = params.get(key);
  });
  return utm;
}

function isVisible(el) {
  return !!(el && el.offsetWidth !== null && el.offsetParent !== null);
}

/* --------------------- сбор данных формы ------------------------- */

const QUESTION_LABELS = {
  "Где планируете ремонт?": "Где планируете ремонт",
  "Какая площадь помещения?": "Площадь помещения",
  "Когда планируете стартовать?": "Когда планируете стартовать",
  "messenger-type": "Способ связи",
  "messenger-id": "Контакт для связи",
  "Name": "Имя",
  "Phone": "Телефон",
  "Checkbox": "Согласие с условиями",
  "formname": "Форма",
};

function collectFormData(form) {
  const data = { fields: [], utm: utmQuery() };
  data.from = form.dataset.from || "Форма сайта (remont-moscow)";

  const seen = {};

  // radio: только выбранные, по одному на группу имён
  form.querySelectorAll('input[type="radio"]:checked').forEach(function (el) {
    if (!el.name || seen[el.name]) return;
    seen[el.name] = true;
    data.fields.push({ name: el.name, label: QUESTION_LABELS[el.name] || el.name, value: el.value });
  });

  // checkbox
  form.querySelectorAll('input[type="checkbox"]').forEach(function (el) {
    if (!el.name) return;
    data.fields.push({
      name: el.name,
      label: QUESTION_LABELS[el.name] || el.name,
      value: el.checked ? "Да" : "Нет",
    });
  });

  // text / tel / email / select / textarea (пропускаем скрытые и служебные)
  form.querySelectorAll('input[type="text"], input[type="tel"], input[type="email"], select, textarea').forEach(function (el) {
    const name = el.name;
    if (!name) return;
    if (!isVisible(el)) return;
    if (el.classList.contains("t-input-phonemask")) return; // сырой ввод маски — берём полный номер ниже
    if (name === "tildaspec-phone-part[]" || name === "tildaspec-phone-part[]-iso") return;
    if (!el.value) return;
    data.fields.push({ name: name, label: QUESTION_LABELS[name] || name, value: el.value });
  });

  // полный номер из скрытого поля маски телефона
  form.querySelectorAll('.js-phonemask-result').forEach(function (el) {
    if (!el.value) return;
    data.fields.push({
      name: el.name || "Phone",
      label: QUESTION_LABELS[el.name] || "Телефон",
      value: el.value,
    });
  });

  return data;
}

function buildMessage(data) {
  const lines = [];
  lines.push("\u{1F3E0} <b>Новая заявка с сайта remont-moscow</b>");
  lines.push("\u{1F4CB} Источник: <b>" + escapeHtml(data.from) + "</b>");
  data.fields.forEach(function (f) {
    lines.push("\u{2022} " + escapeHtml(f.label) + ": <b>" + escapeHtml(f.value) + "</b>");
  });
  lines.push("\u{1F4CD} Страница: " + escapeHtml(window.location.href));
  if (document.referrer) lines.push("\u{1F517} Переход с: " + escapeHtml(document.referrer));
  const utm = Object.keys(data.utm);
  if (utm.length) {
    lines.push("\u{1F3AF} UTM: " + utm.map(function (k) { return k + "=" + escapeHtml(data.utm[k]); }).join(" | "));
  }
  lines.push("\u{23F0} " + new Date().toLocaleString("ru-RU", { timeZone: "Europe/Moscow" }));
  return lines.join("\n");
}

/* ----------------------- отправка заявки --------------------------- */

function sendToProduction(form) {
  const fd = new FormData(form);
  fd.append("newToken", Date.now().toString(36) + Math.random().toString(36).slice(2));
  fd.append("from", form.dataset.from || "Форма сайта (remont-moscow)");
  const utm = utmQuery();
  Object.keys(utm).forEach(function (k) { fd.append(k, utm[k]); });
  return fetch(PRODUCTION_SEND_URL, {
    method: "POST",
    body: fd,
    mode: "no-cors",
  });
}

/* ---------------------- UI-состояния формы ------------------------ */

function setSubmitLoading(form, loading) {
  const btn = form.querySelector('button[type="submit"], input[type="submit"]');
  if (!btn) return;
  if (loading) {
    btn.dataset.originalHtml = btn.innerHTML;
    btn.dataset.originalValue = btn.value;
    btn.disabled = true;
    if (btn.tagName === "INPUT") btn.value = "Отправка формы...";
    else btn.innerHTML = "Отправка формы...";
  } else {
    btn.disabled = false;
    if (btn.tagName === "INPUT") btn.value = btn.dataset.originalValue || "";
    else btn.innerHTML = btn.dataset.originalHtml || "";
  }
}

function showFormError(form, message) {
  let box = form.querySelector(".form-send-error");
  if (!box) {
    box = document.createElement("div");
    box.className = "form-send-error";
    box.style.cssText = "color:#d64541;font-size:14px;line-height:1.4;margin:12px 0 0;text-align:center;";
    form.appendChild(box);
  }
  box.textContent = message;
  setTimeout(function () { if (box && box.parentNode) box.parentNode.removeChild(box); }, 6000);
}

/* ------------------------ обработчик submit ----------------------- */

function handleSubmit(event) {
  const form = event.target;
  if (!form || !form.classList || !form.classList.contains("form-submit")) return;

  // перехватываем до обработчиков Tilda
  event.preventDefault();
  event.stopPropagation();

  if (form.dataset.submitting === "1") return;

  // валидация телефона (полный номер берём из скрытого поля маски, если оно есть)
  const resultInput = form.querySelector('.js-phonemask-result');
  let phoneValue = resultInput ? resultInput.value : "";
  if (!phoneValue) {
    const pi = form.querySelector('input[type="tel"]:not([disabled])');
    if (pi && isVisible(pi)) phoneValue = pi.value;
  }
  const phoneInput = form.querySelector('input[type="tel"]:not([disabled])');
  if (phoneValue && !isValidPhone(phoneValue)) {
    showFormError(form, "Пожалуйста, введите полный номер телефона (+7 (XXX) XXX-XX-XX)");
    if (phoneInput && isVisible(phoneInput)) phoneInput.focus();
    return;
  }
  if (!phoneValue && phoneInput && isVisible(phoneInput)) {
    // выбран способ связи по телефону, но поле пустое — браузер сам подсветит required
    form.reportValidity();
    return;
  }

  if (!form.checkValidity()) {
    form.reportValidity();
    return;
  }

  form.dataset.submitting = "1";
  const data = collectFormData(form);
  const message = buildMessage(data);
  setSubmitLoading(form, true);
  form.classList.add("_sending");

  const finish = function () {
    window.location.href = CONFIG.THANKYOU_URL;
  };
  const fail = function (err) {
    console.error("Ошибка отправки формы:", err);
    form.dataset.submitting = "0";
    form.classList.remove("_sending");
    setSubmitLoading(form, false);
    showFormError(form, "Не удалось отправить заявку. Попробуйте ещё раз.");
  };

  sendToProduction(form)
    .then(function () {
      form.reset();
      window.setTimeout(finish, CONFIG.SUBMIT_DELAY_MS);
    })
    .catch(fail);
}

document.addEventListener("DOMContentLoaded", function () {
  // capture-фаза: перехватываем раньше обработчиков Tilda
  document.addEventListener("submit", handleSubmit, true);

  // подстраховка: перехватываем клик по кнопке отправки ещё до нативной отправки,
  // чтобы обработчики Tilda (quiz/forms) не ушли в свой нерабочий бэкенд
  document.addEventListener("click", function (event) {
    const btn = event.target && event.target.closest ? event.target.closest('button[type="submit"], input[type="submit"]') : null;
    if (!btn) return;
    const form = btn.form;
    if (!form || !form.classList.contains("form-submit")) return;
    event.preventDefault();
    event.stopPropagation();
    if (form.dataset.submitting === "1") return;
    handleSubmit({
      target: form,
      preventDefault: function () {},
      stopPropagation: function () {},
    });
  }, true);
});
