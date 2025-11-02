const doc = typeof document !== "undefined" ? document : null;
const dropZone = doc ? doc.getElementById("drop-zone") : null;
const fileInput = doc ? doc.getElementById("file-input") : null;
const progressBar = doc ? doc.getElementById("progress-bar") : null;
const progressLabel = doc ? doc.getElementById("progress-label") : null;
const errorMessage = doc ? doc.getElementById("error-message") : null;
const controlsSection = doc ? doc.getElementById("controls") : { hidden: true };
const resultsSection = doc ? doc.getElementById("results") : { hidden: true };
const fileListSection = doc ? doc.getElementById("file-list") : { hidden: true };
const fileListItems = doc ? doc.getElementById("file-list-items") : null;
const searchInput = doc ? doc.getElementById("search-input") : { value: "" };
const searchButton = doc ? doc.getElementById("search-button") : null;
const resetButton = doc ? doc.getElementById("reset-button") : null;
const caseSensitiveToggle = doc
  ? doc.getElementById("case-sensitive")
  : { checked: false };
const exactMatchToggle = doc ? doc.getElementById("exact-match") : { checked: false };
const dataTable = doc ? doc.getElementById("data-table") : null;
const resultStats = doc ? doc.getElementById("result-stats") : { textContent: "" };
const pagination = doc ? doc.getElementById("pagination") : { hidden: true };
const pageInfo = doc ? doc.getElementById("page-info") : { textContent: "" };
const prevPageBtn = doc ? doc.getElementById("prev-page") : { disabled: true };
const nextPageBtn = doc ? doc.getElementById("next-page") : { disabled: true };
const copyButton = doc ? doc.getElementById("copy-button") : null;
const exportCsvButton = doc ? doc.getElementById("export-csv-button") : null;
const exportXlsxButton = doc ? doc.getElementById("export-xlsx-button") : null;

const PAGE_SIZE = 100;
const MAX_FILE_SIZE = 200 * 1024 * 1024; // 200MB

let headers = [];
let rawRows = [];
let filteredRows = [];
let rowTextCache = [];
let lowerRowTextCache = [];
let currentPage = 1;
let currentFileName = "";
let datasets = [];
const selectedDatasetIds = new Set();
let datasetCounter = 0;
const datasetKeyIndex = new Map();
const displayNameCounts = new Map();

function getFileKey(file) {
  const name = file?.name ?? "";
  const lastModified = file?.lastModified ?? 0;
  const size = file?.size ?? 0;
  return `${name}::${lastModified}::${size}`;
}

function getUniqueDisplayName(name) {
  if (!name) return "Fichier";
  const count = displayNameCounts.get(name) ?? 0;
  displayNameCounts.set(name, count + 1);
  if (count === 0) {
    return name;
  }
  return `${name} (${count + 1})`;
}

function clearAggregatedData() {
  headers = [];
  rawRows = [];
  filteredRows = [];
  rowTextCache = [];
  lowerRowTextCache = [];
  currentPage = 1;
  currentFileName = "";
  pagination.hidden = true;
  if (dataTable) {
    dataTable.innerHTML = "";
  }
  resultStats.textContent = "";
}

function resetState() {
  clearAggregatedData();
  datasets = [];
  selectedDatasetIds.clear();
  datasetCounter = 0;
  datasetKeyIndex.clear();
  displayNameCounts.clear();
  updateProgress(0, "");
  clearError();
  controlsSection.hidden = true;
  resultsSection.hidden = true;
  if (fileListSection) {
    fileListSection.hidden = true;
  }
  if (fileListItems) {
    fileListItems.innerHTML = "";
  }
}

function resolveHeaders(headers, sampleLength) {
  const count = Math.max(headers ? headers.length : 0, sampleLength || 0);
  const resolved = [];
  for (let index = 0; index < count; index += 1) {
    const header = headers && headers[index];
    if (header === undefined || header === null || header === "") {
      resolved.push(`Colonne ${index + 1}`);
    } else {
      resolved.push(String(header));
    }
  }
  return resolved;
}

function sanitizeFileName(name) {
  if (!name) return "";
  return name.replace(/\.[^.]+$/, "");
}

function addDataset(file, parsed, key = getFileKey(file)) {
  const { headers: parsedHeaders = [], rows = [] } = parsed;
  const columnCount = rows.reduce((max, row) => Math.max(max, row.length), parsedHeaders.length);
  const resolvedHeaders = resolveHeaders(parsedHeaders, columnCount);
  const baseName = sanitizeFileName(file.name);
  const existingIndex = datasetKeyIndex.get(key);

  if (existingIndex !== undefined) {
    const previous = datasets[existingIndex];
    const updatedDataset = {
      ...previous,
      name: file.name,
      baseName,
      headers: parsedHeaders,
      resolvedHeaders,
      rows,
      columnCount,
      fileKey: key,
    };
    datasets[existingIndex] = updatedDataset;
    selectedDatasetIds.add(updatedDataset.id);
    datasetKeyIndex.set(key, existingIndex);
    return updatedDataset;
  }

  const dataset = {
    id: `dataset-${datasetCounter}`,
    name: file.name,
    displayName: getUniqueDisplayName(file.name),
    baseName,
    headers: parsedHeaders,
    resolvedHeaders,
    rows,
    columnCount,
    fileKey: key,
  };
  datasetCounter += 1;
  datasets.push(dataset);
  datasetKeyIndex.set(key, datasets.length - 1);
  selectedDatasetIds.add(dataset.id);
  return dataset;
}

function handleDatasetToggle(event) {
  const checkbox = event.target;
  if (!checkbox || !checkbox.dataset.datasetId) {
    return;
  }

  const datasetId = checkbox.dataset.datasetId;
  if (checkbox.checked) {
    selectedDatasetIds.add(datasetId);
    clearError();
  } else {
    if (selectedDatasetIds.size === 1 && selectedDatasetIds.has(datasetId)) {
      checkbox.checked = true;
      showError("Sélectionnez au moins un fichier pour la recherche.");
      return;
    }
    selectedDatasetIds.delete(datasetId);
  }

  rebuildAggregatedData();
}

function renderFileList() {
  if (!fileListItems) {
    return;
  }

  fileListItems.innerHTML = "";
  datasets.forEach((dataset) => {
    const label = doc.createElement("label");
    label.className = "file-item";
    label.dataset.datasetId = dataset.id;

    const checkbox = doc.createElement("input");
    checkbox.type = "checkbox";
    checkbox.dataset.datasetId = dataset.id;
    checkbox.checked = selectedDatasetIds.has(dataset.id);
    checkbox.addEventListener("change", handleDatasetToggle);

    const nameSpan = doc.createElement("span");
    nameSpan.textContent = dataset.displayName;

    label.appendChild(checkbox);
    label.appendChild(nameSpan);
    fileListItems.appendChild(label);
  });

  if (fileListSection) {
    fileListSection.hidden = datasets.length === 0;
  }
}

function aggregateDatasets(allDatasets, selectedIds) {
  const selected = allDatasets.filter((dataset) => selectedIds.has(dataset.id));
  if (!selected.length) {
    return {
      headers: [],
      rows: [],
      fileName: "",
      selectedCount: 0,
    };
  }

  const combinedHeaders = ["Fichier"];
  const headerSet = new Set(combinedHeaders);

  selected.forEach((dataset) => {
    const datasetHeaders = Array.isArray(dataset.resolvedHeaders)
      ? dataset.resolvedHeaders
      : resolveHeaders(dataset.headers, dataset.columnCount);
    datasetHeaders.forEach((headerName, index) => {
      const safeHeader =
        headerName === undefined || headerName === null || headerName === ""
          ? `Colonne ${index + 1}`
          : String(headerName);
      if (!headerSet.has(safeHeader)) {
        headerSet.add(safeHeader);
        combinedHeaders.push(safeHeader);
      }
    });
  });

  const headerIndexMap = new Map();
  combinedHeaders.forEach((name, index) => {
    headerIndexMap.set(name, index);
  });

  const aggregatedRows = [];
  selected.forEach((dataset) => {
    const datasetHeaders = Array.isArray(dataset.resolvedHeaders)
      ? dataset.resolvedHeaders
      : resolveHeaders(dataset.headers, dataset.columnCount);
    dataset.rows.forEach((row) => {
      const combinedRow = new Array(combinedHeaders.length).fill("");
      combinedRow[0] = dataset.displayName || dataset.name || dataset.baseName || "";
      datasetHeaders.forEach((headerName, columnIndex) => {
        const safeHeader =
          headerName === undefined || headerName === null || headerName === ""
            ? `Colonne ${columnIndex + 1}`
            : String(headerName);
        const targetIndex = headerIndexMap.get(safeHeader);
        if (targetIndex !== undefined) {
          const value = row[columnIndex];
          combinedRow[targetIndex] = value === undefined || value === null ? "" : value;
        }
      });
      aggregatedRows.push(combinedRow);
    });
  });

  const fileName =
    selected.length === 1
      ? selected[0].baseName
      : "multi_fichiers";

  return {
    headers: combinedHeaders,
    rows: aggregatedRows,
    fileName,
    selectedCount: selected.length,
  };
}

function rebuildAggregatedData({ preserveSearch = true } = {}) {
  const { headers: aggregatedHeaders, rows, fileName, selectedCount } =
    aggregateDatasets(datasets, selectedDatasetIds);

  headers = aggregatedHeaders;
  rawRows = rows;
  buildCaches();
  filteredRows = [...rawRows];
  currentPage = 1;
  currentFileName = fileName;

  if (!selectedCount) {
    if (dataTable) {
      dataTable.innerHTML = "";
    }
    resultStats.textContent = "";
    pagination.hidden = true;
    resultsSection.hidden = true;
    if (!datasets.length) {
      controlsSection.hidden = true;
    }
    return;
  }

  controlsSection.hidden = false;
  resultsSection.hidden = false;

  if (preserveSearch && searchInput.value.trim()) {
    performSearch();
    return;
  }

  if (!preserveSearch) {
    searchInput.value = "";
    caseSensitiveToggle.checked = false;
    exactMatchToggle.checked = false;
  }

  renderPage(1);
}

function showError(message) {
  if (errorMessage) {
    errorMessage.textContent = message;
  }
}

function clearError() {
  if (errorMessage) {
    errorMessage.textContent = "";
  }
}

function updateProgress(percent, label) {
  if (progressBar && progressBar.style) {
    progressBar.style.width = `${percent}%`;
  }
  if (progressLabel) {
    progressLabel.textContent = label;
  }
}

function formatBytes(bytes) {
  const units = ["octets", "Ko", "Mo", "Go"];
  let size = bytes;
  let unitIndex = 0;
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex += 1;
  }
  return `${size.toFixed(unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
}

async function handleFiles(fileList) {
  const incomingFiles = Array.from(fileList || []);
  if (!incomingFiles.length) return;
  clearError();

  const hadExistingDatasets = datasets.length > 0;

  if (fileInput) {
    fileInput.value = "";
  }

  const errors = [];
  const validFiles = [];

  incomingFiles.forEach((file) => {
    if (file.size > MAX_FILE_SIZE) {
      errors.push(
        `Le fichier "${file.name}" est trop volumineux (${formatBytes(file.size)}). Limite : ${formatBytes(
          MAX_FILE_SIZE
        )}.`
      );
      return;
    }

    const extension = file.name.split(".").pop()?.toLowerCase();
    if (!extension || !["csv", "xlsx", "xls"].includes(extension)) {
      errors.push(`Format non supporté pour "${file.name}".`);
      return;
    }

    const key = getFileKey(file);
    validFiles.push({ file, extension, key });
  });

  if (!validFiles.length) {
    if (errors.length) {
      showError(errors.join("\n"));
    }
    return;
  }

  const totalSize = validFiles.reduce((sum, entry) => sum + entry.file.size, 0);
  let processedSize = 0;
  let updatedDatasets = false;

  for (let index = 0; index < validFiles.length; index += 1) {
    const { file, extension, key } = validFiles[index];

    const progressCallback = (percent, label) => {
      const normalized = percent / 100;
      const totalPercent = totalSize
        ? ((processedSize + normalized * file.size) / totalSize) * 100
        : ((index + normalized) / validFiles.length) * 100;
      const statusLabel = label || `${Math.round(percent)}%`;
      updateProgress(Math.min(99, totalPercent), `${file.name} • ${statusLabel}`);
    };

    updateProgress(
      totalSize ? (processedSize / totalSize) * 100 : (index / validFiles.length) * 100,
      `Lecture de ${file.name}`
    );

    try {
      let parsed;
      if (extension === "csv") {
        parsed = await parseCsv(file, progressCallback);
      } else {
        parsed = await parseXlsx(file, progressCallback);
      }

      const rows = parsed?.rows || [];
      if (!rows.length) {
        errors.push(`Aucune donnée trouvée dans "${file.name}".`);
        continue;
      }

      addDataset(file, parsed, key);
      updatedDatasets = true;
    } catch (error) {
      console.error(error);
      errors.push(`Impossible de lire "${file.name}".`);
    } finally {
      processedSize += file.size;
    }

    updateProgress(
      totalSize ? (processedSize / totalSize) * 100 : ((index + 1) / validFiles.length) * 100,
      `Chargement de ${index + 1}/${validFiles.length}`
    );
  }

  if (updatedDatasets) {
    renderFileList();
    const preserveSearch = hadExistingDatasets && Boolean(searchInput.value.trim());
    rebuildAggregatedData({ preserveSearch });
    updateProgress(100, "Chargement terminé");
  }

  if (errors.length) {
    showError(errors.join("\n"));
  } else {
    clearError();
  }
}

function parseCsv(file, progressCallback = updateProgress) {
  return new Promise((resolve, reject) => {
    const rows = [];
    let headerRow = null;
    let totalRows = 0;

    Papa.parse(file, {
      worker: true,
      skipEmptyLines: "greedy",
      chunkSize: 1024 * 1024,
      step: (results, parser) => {
        const { data, errors, meta } = results;
        if (errors.length) {
          parser.abort();
          reject(new Error(errors.map((err) => err.message).join("; ")));
          return;
        }

        if (!headerRow) {
          headerRow = data;
        } else {
          rows.push(data);
        }

        totalRows += 1;
        const percent = Math.min(99, Math.round((meta.cursor / file.size) * 100));
        progressCallback(percent, `${totalRows.toLocaleString()} lignes lues`);
      },
      complete: () => {
        resolve({ headers: headerRow, rows });
      },
      error: (error) => {
        reject(error);
      },
    });
  });
}

async function parseXlsx(file, progressCallback = updateProgress) {
  progressCallback(10, "Lecture du classeur");
  const data = await file.arrayBuffer();
  const workbook = XLSX.read(data, { type: "array", dense: true });
  progressCallback(60, "Extraction des feuilles");
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) {
    throw new Error("Le fichier ne contient pas de feuille exploitable.");
  }
  const sheet = workbook.Sheets[sheetName];
  const sheetData = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" });
  const [headerRow, ...rows] = sheetData;
  progressCallback(90, "Conversion terminée");
  return { headers: headerRow, rows };
}

function buildCaches() {
  rowTextCache = rawRows.map((row) =>
    row
      .map((value) => (value === null || value === undefined ? "" : String(value)))
      .join(" \u2022 ")
  );
  lowerRowTextCache = rowTextCache.map((text) => text.toLowerCase());
}

function renderTable(rows) {
  if (!dataTable) {
    return;
  }
  const columnCount = rows.reduce((max, row) => Math.max(max, row.length), headers.length);
  const effectiveColumnCount = columnCount || headers.length || (rows[0]?.length ?? 0);
  const tableHead = doc.createElement("thead");
  const headerRow = doc.createElement("tr");
  const totalColumns = Math.max(effectiveColumnCount, headers.length);
  for (let index = 0; index < totalColumns; index += 1) {
    const th = doc.createElement("th");
    const header = headers[index];
    th.textContent = header === undefined || header === null || header === ""
      ? `Colonne ${index + 1}`
      : String(header);
    headerRow.appendChild(th);
  }
  tableHead.appendChild(headerRow);

  const tableBody = doc.createElement("tbody");
  rows.forEach((row) => {
    const tr = doc.createElement("tr");
    for (let index = 0; index < totalColumns; index += 1) {
      const td = doc.createElement("td");
      const value = row[index];
      td.textContent = value === undefined || value === null ? "" : String(value);
      tr.appendChild(td);
    }
    tableBody.appendChild(tr);
  });

  dataTable.innerHTML = "";
  dataTable.appendChild(tableHead);
  dataTable.appendChild(tableBody);
}

function renderPage(pageNumber) {
  if (!dataTable) {
    if (filteredRows.length === 0) {
      resultStats.textContent = "0 résultat";
      pagination.hidden = true;
    }
    return;
  }
  if (filteredRows.length === 0) {
    renderTable([]);
    const tbody = dataTable.querySelector("tbody");
    if (tbody) {
      const emptyRow = doc.createElement("tr");
      const emptyCell = doc.createElement("td");
      const totalColumns = headers.length || (rawRows[0]?.length ?? 1);
      emptyCell.colSpan = totalColumns || 1;
      emptyCell.textContent = "Aucune ligne correspondante.";
      emptyRow.appendChild(emptyCell);
      tbody.appendChild(emptyRow);
    }
    resultStats.textContent = "0 résultat";
    pagination.hidden = true;
    return;
  }

  const totalPages = Math.ceil(filteredRows.length / PAGE_SIZE);
  currentPage = Math.min(Math.max(pageNumber, 1), totalPages);
  const start = (currentPage - 1) * PAGE_SIZE;
  const pageRows = filteredRows.slice(start, start + PAGE_SIZE);

  renderTable(pageRows);

  const totalText = `${filteredRows.length.toLocaleString()} ligne${
    filteredRows.length > 1 ? "s" : ""
  } trouvée${filteredRows.length > 1 ? "s" : ""}`;
  resultStats.textContent = `${totalText} (sur ${rawRows.length.toLocaleString()} lignes)`;

  if (totalPages > 1) {
    pagination.hidden = false;
    pageInfo.textContent = `Page ${currentPage} / ${totalPages}`;
    prevPageBtn.disabled = currentPage === 1;
    nextPageBtn.disabled = currentPage === totalPages;
  } else {
    pagination.hidden = true;
  }
}

function tokenizeQuery(query) {
  const tokens = [];
  const regex = /"([^"]+)"|\(|\)|\bAND\b|\bOR\b|\bNOT\b|[^\s,()]+/gi;
  let match;

  while ((match = regex.exec(query))) {
    let token = match[0].trim();
    if (!token) continue;
    if (token.endsWith(",")) {
      token = token.slice(0, -1);
    }
    if (!token) continue;
    if (token.startsWith("\"") && token.endsWith("\"")) {
      token = token.slice(1, -1);
    }

    const upper = token.toUpperCase();
    if (["AND", "OR", "NOT", "(", ")"].includes(upper)) {
      tokens.push({ type: "operator", value: upper });
    } else {
      tokens.push({ type: "operand", value: token });
    }
  }
  return tokens;
}

function toPostfix(tokens) {
  const output = [];
  const stack = [];
  const precedence = { NOT: 3, AND: 2, OR: 1 };
  const rightAssociative = { NOT: true };

  tokens.forEach((token) => {
    if (token.type === "operand") {
      output.push(token);
    } else if (token.value === "(") {
      stack.push(token);
    } else if (token.value === ")") {
      while (stack.length && stack[stack.length - 1].value !== "(") {
        output.push(stack.pop());
      }
      if (!stack.length) {
        throw new Error("Parenthèses déséquilibrées.");
      }
      stack.pop();
    } else {
      while (
        stack.length &&
        stack[stack.length - 1].type === "operator" &&
        stack[stack.length - 1].value !== "(" &&
        (precedence[stack[stack.length - 1].value] > precedence[token.value] ||
          (precedence[stack[stack.length - 1].value] === precedence[token.value] &&
            !rightAssociative[token.value]))
      ) {
        output.push(stack.pop());
      }
      stack.push(token);
    }
  });

  while (stack.length) {
    const op = stack.pop();
    if (op.value === "(" || op.value === ")") {
      throw new Error("Parenthèses déséquilibrées.");
    }
    output.push(op);
  }

  return output;
}

function matchRow(rowIndex, keyword, { caseSensitive, exactMatch }) {
  const source = caseSensitive ? rowTextCache[rowIndex] : lowerRowTextCache[rowIndex];
  const query = caseSensitive ? keyword : keyword.toLowerCase();
  if (!query) return false;

  if (exactMatch) {
    const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const regex = new RegExp(`(^|\\b)${escaped}(\\b|$)`);
    return regex.test(source);
  }

  return source.includes(query);
}

function evaluateQuery(tokens, options) {
  if (!tokens.length) {
    return rawRows.map((_, index) => index);
  }

  const postfix = toPostfix(tokens);
  const matches = [];

  for (let index = 0; index < rawRows.length; index += 1) {
    const stack = [];
    for (const token of postfix) {
      if (token.type === "operand") {
        stack.push(matchRow(index, token.value, options));
      } else if (token.value === "NOT") {
        const value = stack.pop();
        stack.push(!value);
      } else {
        const right = stack.pop();
        const left = stack.pop();
        if (token.value === "AND") {
          stack.push(Boolean(Boolean(left) && Boolean(right)));
        } else if (token.value === "OR") {
          stack.push(Boolean(Boolean(left) || Boolean(right)));
        }
      }
    }
    const result = stack.pop();
    if (stack.length) {
      throw new Error("Expression booléenne invalide.");
    }
    if (result) {
      matches.push(index);
    }
  }

  return matches;
}

function performSearch() {
  clearError();
  const query = searchInput.value.trim();
  const options = {
    caseSensitive: caseSensitiveToggle.checked,
    exactMatch: exactMatchToggle.checked,
  };

  if (!query) {
    filteredRows = [...rawRows];
    renderPage(1);
    return;
  }

  try {
    const tokens = tokenizeQuery(query);
    const indexes = evaluateQuery(tokens, options);
    filteredRows = indexes.map((i) => rawRows[i]);
    renderPage(1);
  } catch (error) {
    console.error(error);
    showError(error.message || "Requête invalide");
  }
}

function resetSearch() {
  searchInput.value = "";
  caseSensitiveToggle.checked = false;
  exactMatchToggle.checked = false;
  filteredRows = [...rawRows];
  renderPage(1);
}

function getCurrentPageRows() {
  if (!filteredRows.length) return [];
  const start = (currentPage - 1) * PAGE_SIZE;
  return filteredRows.slice(start, start + PAGE_SIZE);
}

async function copyToClipboard() {
  if (!filteredRows.length) return;
  const csvContent = convertRowsToCsv(headers, filteredRows);
  try {
    if (typeof navigator === "undefined" || !navigator.clipboard) {
      throw new Error("Clipboard API indisponible");
    }
    await navigator.clipboard.writeText(csvContent);
    showError("");
    updateProgress(100, "Résultats copiés dans le presse-papiers");
  } catch (error) {
    showError("Impossible de copier dans le presse-papiers.");
  }
}

function convertRowsToCsv(headers, rows) {
  const allRows = [headers, ...rows];
  return allRows
    .map((row) =>
      row
        .map((cell) => {
          const value = cell === null || cell === undefined ? "" : String(cell);
          if (value.includes("\"") || value.includes(",") || value.includes("\n")) {
            return `"${value.replace(/"/g, '""')}"`;
          }
          return value;
        })
        .join(",")
    )
    .join("\n");
}

function downloadBlob(content, filename, type) {
  if (!doc) return;
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = doc.createElement("a");
  link.href = url;
  link.download = filename;
  doc.body.appendChild(link);
  link.click();
  doc.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function exportCsv(rows) {
  if (!rows.length) return;
  const csvContent = convertRowsToCsv(headers, rows);
  const filename = `${currentFileName || "export"}_resultats.csv`;
  downloadBlob(csvContent, filename, "text/csv;charset=utf-8;");
}

function exportXlsx(rows) {
  if (!rows.length) return;
  const worksheetData = [headers, ...rows];
  const worksheet = XLSX.utils.aoa_to_sheet(worksheetData);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Résultats");
  const filename = `${currentFileName || "export"}_resultats.xlsx`;
  XLSX.writeFile(workbook, filename, { compression: true });
}

function attachEvents() {
  if (
    !fileInput ||
    !dropZone ||
    !searchButton ||
    !resetButton ||
    !prevPageBtn ||
    !nextPageBtn ||
    !copyButton ||
    !exportCsvButton ||
    !exportXlsxButton
  ) {
    return;
  }
  fileInput.addEventListener("change", (event) => {
    const files = event.target.files;
    handleFiles(files);
  });

  ;["dragenter", "dragover"].forEach((eventName) => {
    dropZone.addEventListener(eventName, (event) => {
      event.preventDefault();
      event.stopPropagation();
      dropZone.classList.add("dragover");
    });
  });

  ;["dragleave", "drop"].forEach((eventName) => {
    dropZone.addEventListener(eventName, (event) => {
      event.preventDefault();
      event.stopPropagation();
      dropZone.classList.remove("dragover");
    });
  });

  dropZone.addEventListener("drop", (event) => {
    const files = event.dataTransfer?.files;
    handleFiles(files);
  });

  searchButton.addEventListener("click", performSearch);
  searchInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      performSearch();
    }
  });

  resetButton.addEventListener("click", () => {
    resetSearch();
    clearError();
  });

  prevPageBtn.addEventListener("click", () => {
    if (currentPage > 1) {
      renderPage(currentPage - 1);
    }
  });

  nextPageBtn.addEventListener("click", () => {
    const totalPages = Math.ceil(filteredRows.length / PAGE_SIZE);
    if (currentPage < totalPages) {
      renderPage(currentPage + 1);
    }
  });

  copyButton.addEventListener("click", copyToClipboard);
  exportCsvButton.addEventListener("click", () => exportCsv(filteredRows));
  exportXlsxButton.addEventListener("click", () => exportXlsx(filteredRows));
}

if (doc) {
  if (doc.readyState === "loading") {
    doc.addEventListener("DOMContentLoaded", attachEvents);
  } else {
    attachEvents();
  }
}

function __setTestState(state) {
  if (state.headers) {
    headers = state.headers;
  }
  if (state.rawRows) {
    rawRows = state.rawRows;
  }
  if (state.filteredRows) {
    filteredRows = state.filteredRows;
  }
  if (state.rowTextCache) {
    rowTextCache = state.rowTextCache;
  }
  if (state.lowerRowTextCache) {
    lowerRowTextCache = state.lowerRowTextCache;
  }
  if (typeof state.currentPage === "number") {
    currentPage = state.currentPage;
  }
  if (typeof state.currentFileName === "string") {
    currentFileName = state.currentFileName;
  }
}

function __getTestState() {
  return {
    headers,
    rawRows,
    filteredRows,
    rowTextCache,
    lowerRowTextCache,
    currentPage,
    currentFileName,
  };
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    tokenizeQuery,
    toPostfix,
    evaluateQuery,
    matchRow,
    convertRowsToCsv,
    buildCaches,
    aggregateDatasets,
    __setTestState,
    __getTestState,
  };
}
