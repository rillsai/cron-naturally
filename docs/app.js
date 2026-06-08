// cron-naturally site — drives the live translator with the real published library.
// No framework, no build dependency beyond the esbuild-bundled library module.

import {
  parseNaturalSchedule,
  explainCronFields,
  getNextRuns,
  isCronExpression,
} from "./cron-naturally.mjs";

// The demo's own example phrases. Not imported from the library: the published
// API is deliberately language-agnostic and does not export an English list.
const EXAMPLE_PHRASES = [
  "every 15 minutes",
  "mondays at 9am",
  "weekdays at noon",
  "1st of the month at 8am",
  "fridays at 21:00",
];

const $ = (sel, root = document) => root.querySelector(sel);

const input = $("#schedule-input");
const tbody = $("#tbody");
const modeTag = $("#mode-tag");

const localTZ = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
const runFmt = new Intl.DateTimeFormat(undefined, {
  timeZone: localTZ,
  weekday: "short",
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
});

const esc = (s) =>
  String(s).replace(
    /[&<>"]/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c],
  );

const copyIcon = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/></svg>`;

// ---------------------------------------------------------------- rendering
function render(raw) {
  const value = raw.trim();

  if (!value) {
    modeTag.textContent = "English → cron";
    tbody.innerHTML = `<p class="empty-hint">Start typing a schedule, or pick an example below.</p>`;
    return;
  }

  modeTag.textContent = isCronExpression(value) ? "cron → English" : "English → cron";

  const result = parseNaturalSchedule(value);

  if (!result.ok) {
    renderError(result);
    return;
  }

  const fields = explainCronFields(result.cron) || [];
  const runs = safeRuns(result.cron);

  let html = "";

  // field anatomy row. The "Day rule" entry is a cross-field annotation (the
  // dom/dow OR), not a sixth field, so it gets a full-width band of its own
  // instead of a lone grid cell with four empty columns beside it.
  if (fields.length) {
    const dayRule = fields.find((f) => f.field === "Day rule");
    const cells = fields.filter((f) => f.field !== "Day rule");

    html += `<div class="fields anim">${cells
      .map(
        (f) => `<div class="field">
          <div class="fname">${esc(f.field)}</div>
          <div class="fval">${esc(f.value)}</div>
          <div class="fmean">${esc(f.meaning)}</div>
        </div>`,
      )
      .join("")}</div>`;

    if (dayRule) {
      html += `<div class="dayrule anim">
        <div class="dr-mark">
          <span class="dr-tag">${esc(dayRule.field)}</span>
          <span class="dr-badge">${esc(dayRule.value)}</span>
        </div>
        <p class="dr-mean">${esc(dayRule.meaning)}</p>
      </div>`;
    }
  }

  // result rows
  html += `<div class="result-rows">
    <div class="rrow">
      <div class="rk">Cron</div>
      <div class="rv">
        <div class="cron-out">
          <code>${esc(result.cron)}</code>
          <button class="copy-mini" data-copy="${esc(result.cron)}" type="button">${copyIcon}<span>copy</span></button>
        </div>
      </div>
    </div>
    <div class="rrow">
      <div class="rk">In words</div>
      <div class="rv"><p class="description">${esc(result.description)}</p></div>
    </div>`;

  if (runs.length) {
    html += `<div class="rrow">
      <div class="rk">Next runs</div>
      <div class="rv">
        <ul class="runs">${runs
          .map(
            (d, i) =>
              `<li><span class="idx">${i + 1}</span><span>${esc(runFmt.format(d))}</span></li>`,
          )
          .join("")}</ul>
      </div>
    </div>
    <div class="rrow">
      <div class="rk">Timezone</div>
      <div class="rv"><span class="tzval">${esc(localTZ)}</span></div>
    </div>`;
  }

  html += `</div>`;

  // assumptions
  if (result.assumptions?.length) {
    html += `<div class="notes">${result.assumptions
      .map((a) => {
        const alt = a.alternative
          ? `<button class="alt-btn" data-fill="${esc(a.alternative.input)}" type="button">${esc(a.alternative.label)}</button>`
          : "";
        return `<div class="note assumption">
          <span class="ntag">Assumed</span>
          <span class="ntext">${esc(a.text)}</span>
          ${alt}
        </div>`;
      })
      .join("")}</div>`;
  }

  tbody.innerHTML = html;
}

function renderError(result) {
  const suggestions = (result.suggestions || [])
    .map(
      (s) =>
        `<button class="sugg" data-fill="${esc(s)}" type="button"><code>${esc(s)}</code></button>`,
    )
    .join("");
  tbody.innerHTML = `<div class="notes" style="padding-top: 1rem">
    <div class="note error">
      <span class="ntag">No cron yet</span>
      <span class="ntext">${esc(result.hint)}</span>
    </div>
    ${suggestions ? `<div class="note error" style="background:transparent;padding-top:0">${suggestions}</div>` : ""}
  </div>`;
}

function safeRuns(cron) {
  try {
    return getNextRuns(cron, localTZ, 3);
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------- chips
function buildChips() {
  const chips = $("#chips");
  const cronExamples = ["*/15 9-17 * * 1-5", "0 0 1 * *", "@daily"];

  const phraseChips = EXAMPLE_PHRASES.map(
    (p) =>
      `<button class="chip" role="listitem" data-fill="${esc(p)}" type="button">${esc(p)}</button>`,
  ).join("");

  const cronChips = cronExamples
    .map(
      (c) =>
        `<button class="chip cron-chip" role="listitem" data-fill="${esc(c)}" type="button"><span class="arrow">paste</span> ${esc(c)}</button>`,
    )
    .join("");

  chips.innerHTML = phraseChips + cronChips;
}

// ---------------------------------------------------------------- copy
async function copyText(text, btn) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const ta = document.createElement("textarea");
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    try {
      document.execCommand("copy");
    } catch {}
    ta.remove();
  }
  if (btn) {
    const label = btn.querySelector("span");
    const prev = label ? label.textContent : null;
    btn.classList.add("ok");
    if (label) label.textContent = "copied";
    setTimeout(() => {
      btn.classList.remove("ok");
      if (label && prev !== null) label.textContent = prev;
    }, 1400);
  }
}

// ---------------------------------------------------------------- theme
function initTheme() {
  const btn = $("#theme-toggle");
  btn.addEventListener("click", () => {
    const root = document.documentElement;
    const current =
      root.getAttribute("data-theme") ||
      (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
    const next = current === "dark" ? "light" : "dark";
    root.setAttribute("data-theme", next);
    try {
      localStorage.setItem("cn-theme", next);
    } catch {}
  });
}

// ---------------------------------------------------------------- wiring
function fill(text) {
  input.value = text;
  render(text);
  input.focus();
  input.setSelectionRange(text.length, text.length);
}

let raf = 0;
input.addEventListener("input", () => {
  cancelAnimationFrame(raf);
  raf = requestAnimationFrame(() => render(input.value));
});

document.addEventListener("click", (e) => {
  const fillEl = e.target.closest("[data-fill]");
  if (fillEl) {
    fill(fillEl.getAttribute("data-fill"));
    return;
  }
  const copyEl = e.target.closest("[data-copy]");
  if (copyEl) {
    copyText(copyEl.getAttribute("data-copy"), copyEl);
    return;
  }
  if (e.target.closest("#install-btn")) {
    copyText("npm install cron-naturally", null);
    const btn = $("#install-btn");
    const cp = btn.querySelector(".cp");
    cp.style.color = "var(--saffron)";
    setTimeout(() => (cp.style.color = ""), 1400);
  }
});

// ---------------------------------------------------------------- boot
buildChips();
initTheme();
fill("weekdays at noon"); // never start dead
