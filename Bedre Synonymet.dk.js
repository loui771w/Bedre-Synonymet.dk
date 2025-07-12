// ==UserScript==
// @name         Bedre Synonymet.dk
// @namespace    http://tampermonkey.net/
// @version      1.2.0
// @description  Fjerner Facebook-reklamer fra hele synonymet.dk. Tilføjer en korrekt overskrift med Æ, Ø og Å (m.m.) samt en mulighed for filtrering efter længde og alfabetisk rækkevidde. Understøtter eksport af synonymer som TXT eller CSV. TIP: Brug en User-Agent spoofer, så hjemmesiden tror, du bruger en mobiltelefon. Derefter vises den fulde liste med alle ord.
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

  const selectors = {
    fbSection: "#fbw_id-2",
    heading: "h2.wp-block-heading",
    targetRow: "div.row.mt-5.justify-content-md-center.text-center",
    searchForm: "#search-form",
    searchInput: "#ord",
    filterLength: "#filter-length",
    filterAlpha: "#filter-alpha",
    clearFilter: "#clear-filter",
    exportButton: "#export-button",
    exportSelect: "#export-format",
    statusText: "#status-text",
    wordCloud: ".wordcloud-span",
    listItems: ".list-group-item",
  };

  const isWordPage = location.pathname.startsWith("/ord/");
  const $ = (sel) => document.querySelector(selectors[sel] || sel);
  const $$ = (sel) => document.querySelectorAll(selectors[sel] || sel);

  log.success("Script initialized");

  function removeFacebookAds() {
    const fbSection = $(selectors.fbSection);
    if (!fbSection) return false;

    const parentCol = fbSection.closest("div.col");
    (parentCol || fbSection).remove();
    log.success("Facebook section removed");
    return true;
  }

  function fixWordDisplay() {
    if (!isWordPage) return;

    const heading = $(selectors.heading);
    const match = location.pathname.match(/\/ord\/([^\/]+)\//);

    if (!heading || !match?.[1]) {
      log.fail("Unable to correct heading — missing <h2> or URL word");
      return;
    }

    const correctWord = decodeURIComponent(match[1]).toUpperCase();
    const currentMatch = heading.textContent.match(/Synonym for (.+)/i);
    const currentWord = currentMatch?.[1]?.trim() || "[unknown]";

    const synonyms = Array.from(
      $$(selectors.wordCloud).length
        ? $$(selectors.wordCloud)
        : $$(selectors.listItems)
    );

    heading.innerHTML = `${
      synonyms.length === 1 ? "Synonym for" : "Synonymer for"
    } <strong>${correctWord}</strong>`;

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
      `Word corrected to "${correctWord}" and ${fixedCount} paragraph(s) fixed`
    );
  }

  function createUI() {
    const targetRow = $(selectors.targetRow);
    if (!targetRow || $(selectors.searchForm)) return;

    targetRow.className = "text-center mt-5";
    targetRow.style.cssText = `
      font-family: inherit;
      color: inherit;
    `;

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
            <input id="filter-alpha" type="text" class="form-control" placeholder='Filtrér med ét bogstav eller et interval (f.eks. "A" eller "A–Å")' disabled>
            <span class="input-group-btn">
              <button id="clear-filter" class="btn btn-secondary" type="button" disabled>Ryd</button>
            </span>
          </div>
          <div class="input-group input-group-lg mb-2">
            <button id="export-button" class="btn btn-secondary" type="button" disabled>Gem som...</button>
            <select id="export-format" class="form-control" disabled>
              <option value="txt">TXT</option>
              <option value="csv">CSV</option>
            </select>
          </div>
          <div id="status-text" class="text-muted small">Synonym(er) indlæses...</div>
        </form>
      `;

    log.success("UI created");

    $(selectors.searchForm).addEventListener("submit", (e) => {
      const input = $(selectors.searchInput);
      if (!input?.value.trim()) {
        e.preventDefault();
        log.fail("Search prevented - empty query not allowed");
      }
    });

    const alphaInput = $(selectors.filterAlpha);
    alphaInput?.addEventListener("input", (e) => {
      let value = e.target.value.toUpperCase().replace(/[^A-ZÆØÅ]/gi, "");
      if (value.length >= 2 && value[1] !== "-") {
        value = `${value[0]}-${value[1]}`;
      }
      e.target.value = value;
    });

    waitForSynonyms();
  }

  function updateStatusText(
    shownCount,
    hiddenCount = 0,
    filters = {},
    message = ""
  ) {
    const statusText = $(selectors.statusText);
    if (!statusText) return;

    const { length: filterLength, alpha: filterAlpha } = filters;
    const formatNumber = (num) => num.toLocaleString("da-DK");
    let filterText = [];

    if (message && message.includes("Fejl")) {
      statusText.style.color = "#f00"; // Rød farve
      statusText.textContent = message;
      return;
    }

    statusText.style.color = "#636c72"; // Standard farve

    if (filterLength) filterText.push(`${filterLength} tegn`);

    if (filterAlpha) {
      if (/^[A-ZÆØÅ]$/.test(filterAlpha)) {
        filterText.push(`ord der starter med ${filterAlpha}`);
      } else if (/^[A-ZÆØÅ]-[A-ZÆØÅ]$/.test(filterAlpha)) {
        filterText.push(`ord der starter med bogstaverne ${filterAlpha}`);
      } else {
        filterText.push(`bogstavfilter: ${filterAlpha}`);
      }
    }

    statusText.textContent = message
      ? message
      : shownCount > 0
      ? filterText.length
        ? `Viser ${formatNumber(shownCount)} ${
            shownCount === 1 ? "ord" : "ord"
          } med ${filterText.join(" og ")} (skjuler ${formatNumber(
            hiddenCount
          )} ord)`
        : `Viser ${formatNumber(shownCount)} ord`
      : "Ingen ord matcher dine filtre";
  }

  function waitForSynonyms() {
    let lastCount = 0;
    let stableChecks = 0;
    const maxChecks = 50;
    let checkCount = 0;

    const checkSynonyms = () => {
      let synonymElements = $$(selectors.wordCloud);
      let formatType = "wordcloud";

      if (synonymElements.length === 0) {
        synonymElements = $$(selectors.listItems);
        formatType = "list";
      }

      const currentCount = synonymElements.length;

      if (currentCount > 0) {
        if (currentCount === lastCount) {
          stableChecks++;
          if (stableChecks >= 3) {
            enableFiltering(synonymElements, formatType);
            return;
          }
        } else {
          lastCount = currentCount;
          stableChecks = 0;
        }
      }

      checkCount++;
      if (checkCount < maxChecks) {
        setTimeout(checkSynonyms, 100);
      } else {
        log.timeout("Timeout waiting for synonyms, enabling filtering anyway");
        let fallbackElements = $$(selectors.wordCloud);
        let fallbackFormat = "wordcloud";
        if (fallbackElements.length === 0) {
          fallbackElements = $$(selectors.listItems);
          fallbackFormat = "list";
        }
        enableFiltering(fallbackElements, fallbackFormat);
      }
    };

    checkSynonyms();
  }

  function sortListAlphabetically(elements) {
    if (elements.length === 0) return;

    const parent = elements[0].parentElement;
    if (!parent) return;

    const sortedElements = Array.from(elements).sort((a, b) => {
      const textA = a.textContent.trim().toLowerCase();
      const textB = b.textContent.trim().toLowerCase();
      return textA.localeCompare(textB, "da", { sensitivity: "base" });
    });

    elements.forEach((el) => el.remove());

    sortedElements.forEach((el) => parent.appendChild(el));

    log.success(`Sorted ${sortedElements.length} synonyms alphabetically`);
  }

  function enableFiltering(elements, formatType) {
    const filterLengthSelect = $(selectors.filterLength);
    const filterAlphaInput = $(selectors.filterAlpha);
    const clearButton = $(selectors.clearFilter);
    const exportButton = $(selectors.exportButton);
    const exportSelect = $(selectors.exportSelect);
    const statusText = $(selectors.statusText);

    if (
      !filterLengthSelect ||
      !filterAlphaInput ||
      !clearButton ||
      !exportButton ||
      !exportSelect
    )
      return;

    if (formatType === "list") {
      sortListAlphabetically(elements);
      elements = $$(selectors.listItems);
    }

    const getTextContent = (element) => {
      return formatType === "list"
        ? element.textContent.trim()
        : element.textContent;
    };

    const lengths = Array.from(elements, (el) => getTextContent(el).length);
    const uniqueLengths = [...new Set(lengths)].sort((a, b) => a - b);

    filterLengthSelect.innerHTML =
      '<option value="">Alle antal tegn</option>' +
      uniqueLengths
        .map((len) => `<option value="${len}">${len} tegn</option>`)
        .join("");

    filterLengthSelect.disabled = false;
    filterAlphaInput.disabled = false;
    clearButton.disabled = false;
    exportButton.disabled = false;
    exportSelect.disabled = false;

    const filterWords = () => {
      const targetLength = filterLengthSelect.value.trim();
      const targetNum = targetLength ? parseInt(targetLength) : null;
      const targetAlpha = filterAlphaInput.value.trim().toUpperCase();
      let alphaRange = null;
      let error = "";

      if (targetAlpha) {
        if (/^[A-ZÆØÅ]$/.test(targetAlpha)) {
          alphaRange = new RegExp(`^${targetAlpha}`, "i");
        } else if (/^[A-ZÆØÅ]-[A-ZÆØÅ]$/.test(targetAlpha)) {
          const [start, end] = targetAlpha.split("-");
          const danishAlphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZÆØÅ";
          const startIndex = danishAlphabet.indexOf(start);
          const endIndex = danishAlphabet.indexOf(end);
          if (startIndex > endIndex) {
            error =
              "Ugyldigt filter: Startbogstavet skal komme før slutbogstavet";
          } else {
            const rangeLetters = danishAlphabet.slice(startIndex, endIndex + 1);
            alphaRange = new RegExp(`^[${rangeLetters}]`, "i");
          }
        } else {
          error =
            "Ugyldigt format: Indtast enten ét bogstav (f.eks. A) eller et interval (f.eks. A-Å)";
        }
      }

      if (error) {
        updateStatusText(0, 0, {}, error);
        elements.forEach((element) => {
          element.style.display = "none";
        });
        return;
      }

      let hiddenCount = 0,
        shownCount = 0;

      elements.forEach((element) => {
        const textContent = getTextContent(element);
        const lengthMatch = !targetNum || textContent.length === targetNum;
        const alphaMatch = !alphaRange || alphaRange.test(textContent);
        const shouldHide = !lengthMatch || !alphaMatch;
        element.style.display = shouldHide ? "none" : "";
        shouldHide ? hiddenCount++ : shownCount++;
      });

      if (formatType === "list") {
        elements.forEach((el) => {
          el.style.borderRadius = "";
        });

        const visibleElements = Array.from(elements).filter(
          (el) => el.style.display !== "none"
        );

        if (visibleElements.length > 0) {
          visibleElements[0].style.borderTopLeftRadius = ".25rem";
          visibleElements[0].style.borderTopRightRadius = ".25rem";
          const lastElement = visibleElements[visibleElements.length - 1];
          lastElement.style.borderBottomLeftRadius = ".25rem";
          lastElement.style.borderBottomRightRadius = ".25rem";
        }
      }

      updateStatusText(shownCount, hiddenCount, {
        length: targetLength,
        alpha: targetAlpha,
      });
    };

    function saveSynonyms() {
      const visibleElements = Array.from(elements).filter(
        (el) => el.style.display !== "none"
      );
      const synonyms = visibleElements.map((el) => getTextContent(el));
      const wordMatch = location.pathname.match(/\/ord\/([^\/]+)\//);
      const word = wordMatch
        ? decodeURIComponent(wordMatch[1])
        : $(selectors.searchInput)?.value.trim() || "ukendt";
      const format = exportSelect.value;
      let content, mimeType, extension;

      if (format === "txt") {
        content = synonyms.join("\n");
        mimeType = "text/plain";
        extension = "txt";
      } else if (format === "csv") {
        content = synonyms.map((word) => `"${word}"`).join("\n");
        mimeType = "text/csv";
        extension = "csv";
      }

      try {
        const blob = new Blob([content], { type: mimeType });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `${
          synonyms.length === 1 ? "Synonym" : "Synonymer"
        }_${word.toUpperCase()}.${extension}`;
        a.click();
        URL.revokeObjectURL(url);
        log.success(
          `Saved ${synonyms.length} synonym${
            synonyms.length === 1 ? "" : "s"
          } as ${format.toUpperCase()}`
        );
        updateStatusText(
          synonyms.length,
          0,
          {},
          `Synonymer gemt som ${format.toUpperCase()}`
        );
      } catch (error) {
        log.fail(`Save error: ${error.message}`);
        updateStatusText(0, 0, {}, `Fejl: Kunne ikke gemme synonymer`);
      }
    }

    filterLengthSelect.addEventListener("change", filterWords);
    filterAlphaInput.addEventListener("input", filterWords);
    clearButton.addEventListener("click", () => {
      filterLengthSelect.value = "";
      filterAlphaInput.value = "";
      filterWords();
    });
    exportButton.addEventListener("click", saveSynonyms);

    if (statusText) {
      updateStatusText(elements.length);
    }

    if (elements.length > 0) {
      log.success(
        `Filtering enabled for ${formatType}! ${
          elements.length
        } words (${Math.min(...lengths)}-${Math.max(...lengths)} letter(s))`
      );
    } else {
      log.fail("No words found — filtering disabled.");
    }
  }

  function setupMainPageValidation() {
    const searchInput = $(selectors.searchInput);
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

  try {
    removeFacebookAds();

    if (isWordPage) {
      fixWordDisplay();
      createUI();
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
  } catch (error) {
    log.fail(`Script error: ${error.message}`);
  }
})();
