// ==UserScript==
// @name         Bedre Synonymet.dk
// @namespace    http://tampermonkey.net/
// @version      1.0
// @description  Fjerner Facebook-reklamer fra hele synonymet.dk. Tilføjer en korrekt overskrift med Æ, Ø og Å (m.m.) samt en mulighed for filtrering.
// @match        https://synonymet.dk/*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=synonymet.dk
// @updateURL    https://raw.githubusercontent.com/loui771w/Bedre-Synonymet.dk/main/Bedre%20Synonymet.dk.js
// @downloadURL  https://raw.githubusercontent.com/loui771w/Bedre-Synonymet.dk/main/Bedre%20Synonymet.dk.js
// @grant        none
// @license      GPL-3.0-or-later
// ==/UserScript==

(function () {
  "use strict";

  const log = {
    success: (msg) => console.log(`✅ ⟩ ${msg}`),
    fail: (msg) => console.log(`❌ ⟩ ${msg}`),
    timeout: (msg) => console.log(`⏰ ⟩ ${msg}`),
  };
  const isWordPage = location.pathname.startsWith("/ord/");
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => document.querySelectorAll(sel);

  log.success("Script initialized");

  function removeFacebookAds() {
    const fbSection = $("#fbw_id-2");
    if (!fbSection) return false;

    const parentCol = fbSection.closest("div.col");
    (parentCol || fbSection).remove();
    log.success("Facebook section removed");
    return true;
  }

  function fixWordDisplay() {
    if (!isWordPage) return;

    const heading = $("h2.wp-block-heading");
    const match = location.pathname.match(/\/ord\/([^\/]+)\//);

    if (!heading || !match?.[1]) {
      log.fail("Unable to correct heading — missing <h2> or URL word");
      return;
    }

    const correctWord = decodeURIComponent(match[1]).toUpperCase();
    const currentMatch = heading.textContent.match(/Synonym for (.+)/i);
    const currentWord = currentMatch?.[1]?.trim() || "[unknown]";

    heading.innerHTML = `Synonym for <strong>${correctWord}</strong>`;

    const regex = new RegExp(
      `\\b${currentWord.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`,
      "g"
    );
    let fixedCount = 0;

    $$("p").forEach((p) => {
      const original = p.innerHTML;
      const updated = original.replace(
        regex,
        `<strong>${correctWord}</strong>`
      );
      if (updated !== original) {
        p.innerHTML = updated;
        fixedCount++;
      }
    });

    log.success(
      `Word corrected to "${correctWord}" and ${fixedCount} paragraph(s) fixed.`
    );
  }

  function createFilterUI() {
    const targetRow = $("div.row.mt-5.justify-content-md-center.text-center");
    if (!targetRow || $("#search-form")) return;

    targetRow.innerHTML = `
        <form id="search-form" method="get" action="https://synonymet.dk/wp-admin/admin-post.php" onsubmit="setAutoComplete(true);return true;">
          <input type="hidden" name="action" value="search">
          <div class="input-group input-group-lg mb-3">
            <input id="ord" type="search" class="form-control" placeholder="Søg efter synonymer" aria-describedby="searchterm" name="ord" autocomplete="off" autocorrect="off" autocapitalize="none" spellcheck="false">
            <span class="input-group-btn">
              <button class="btn btn-primary" type="submit"><i class="fa fa-search" aria-hidden="true"></i> Søg</button>
            </span>
          </div>
          <div class="input-group input-group-lg mb-2">
            <select id="filter-length" class="form-control" disabled>
              <option value="">Indlæser...</option>
            </select>
            <span class="input-group-btn">
              <button id="clear-filter" class="btn btn-secondary" type="button" disabled>Ryd</button>
            </span>
          </div>
          <div id="loading-text" class="text-muted small">Venter på at ordskyen indlæses...</div>
          <div id="filter-status" class="text-muted small" style="display: none;"></div>
        </form>
      `;

    log.success("UI created");

    $("#search-form").addEventListener("submit", (e) => {
      const input = $("#ord");
      if (!input?.value.trim()) {
        e.preventDefault();
        log.fail("Search prevented - empty query not allowed");
      }
    });

    waitForWordCloud();
  }

  function waitForWordCloud() {
    let lastCount = 0;
    let stableChecks = 0;
    const maxChecks = 50; // 5 sekunder (max)
    let checkCount = 0;

    const checkWords = () => {
      const spans = $$(".wordcloud-span");
      const currentCount = spans.length;

      if (currentCount > 0) {
        if (currentCount === lastCount) {
          stableChecks++;
          if (stableChecks >= 3) {
            enableFiltering(spans);
            return;
          }
        } else {
          lastCount = currentCount;
          stableChecks = 0;
        }
      }

      checkCount++;
      if (checkCount < maxChecks) {
        setTimeout(checkWords, 100);
      } else {
        log.timeout(
          "Timeout waiting for word cloud, enabling filtering anyway"
        );
        enableFiltering($$(".wordcloud-span"));
      }
    };

    checkWords();
  }

  function enableFiltering(spans) {
    const filterSelect = $("#filter-length");
    const clearButton = $("#clear-filter");
    const loadingText = $("#loading-text");
    const statusText = $("#filter-status");

    if (!filterSelect || !clearButton) return;

    const lengths = Array.from(spans, (s) => s.textContent.length);
    const uniqueLengths = [...new Set(lengths)].sort((a, b) => a - b);

    filterSelect.innerHTML =
      '<option value="">Alle ordlængder</option>' +
      uniqueLengths
        .map(
          (len) =>
            `<option value="${len}">${len} ${
              len === 1 ? "bogstav" : "bogstaver"
            }</option>`
        )
        .join("");

    filterSelect.disabled = false;
    clearButton.disabled = false;
    if (loadingText) loadingText.style.display = "none";

    const filterWords = () => {
      const targetLength = filterSelect.value.trim();
      const targetNum = targetLength ? parseInt(targetLength) : null;
      let hiddenCount = 0,
        shownCount = 0;

      spans.forEach((span) => {
        const shouldHide = targetNum && span.textContent.length !== targetNum;
        span.style.display = shouldHide ? "none" : "block";
        shouldHide ? hiddenCount++ : shownCount++;
      });

      if (statusText) {
        if (targetLength) {
          statusText.textContent = `Viser ${shownCount} ord med ${targetLength} bogstaver (skjuler ${hiddenCount} ord)`;
          statusText.style.display = "block";
        } else {
          statusText.style.display = "none";
        }
      }
    };

    filterSelect.addEventListener("change", filterWords);
    clearButton.addEventListener("click", () => {
      filterSelect.value = "";
      filterWords();
    });

    if (spans.length > 0) {
      log.success(
        `Filtering enabled! ${spans.length} words (${Math.min(
          ...lengths
        )}-${Math.max(...lengths)} letter(s))`
      );
    } else {
      log.fail("No words found — filtering disabled.");
    }
  }

  function setupMainPageValidation() {
    const searchInput = $("#ord");
    if (!searchInput) return;

    const form = searchInput.closest("form");
    if (form) {
      form.addEventListener("submit", (e) => {
        if (!searchInput.value.trim()) {
          e.preventDefault();
          log.fail("Search prevented — empty query not allowed");
        }
      });
      log.success("Main page search validation added");
    }
  }

  removeFacebookAds();

  if (isWordPage) {
    fixWordDisplay();
    createFilterUI();
  } else {
    setupMainPageValidation();
  }

  const observer = new MutationObserver(() => {
    if (removeFacebookAds()) observer.disconnect();
  });

  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
  });
  setTimeout(() => {
    observer.disconnect();
    log.timeout("Observer stopped after 10 seconds");
  }, 10000);
})();
