const STORAGE_KEY = "hallazgos-cordillera-extra-v1";
const THEME_KEY = "hallazgos-cordillera-theme-v1";

const ROLE_META = {
  eor: {
    label: "Equipo EoR",
    short: "EoR",
    title: "Control operativo de hallazgos",
    subtitle: "Una vista consolidada para priorizar riesgos, responsables y planes de acción del tranque Cordillera.",
  },
  trp: {
    label: "Panel TRP-DSR",
    short: "TRP / DSR",
    title: "Revisión independiente de hallazgos",
    subtitle: "Seguimiento enfocado en recomendaciones y observaciones levantadas por los paneles TRP y DSR.",
  },
  management: {
    label: "Gerencia cliente",
    short: "Gerencia",
    title: "Resumen ejecutivo de hallazgos",
    subtitle: "Una lectura gerencial del estado, criticidad y avance del programa de gestión del tranque Cordillera.",
  },
};

const WALLS = [
  ["MO", "Muro Oeste"],
  ["MP", "Muro Principal"],
  ["ME", "Muro Este"],
  ["MPL", "Muro Planta"],
  ["General", "General"],
];

const SEVERITIES = ["Crítica", "Alta", "Media", "Baja"];
const STATUS = ["Abierto", "En proceso", "Cerrado"];
const SEVERITY_CLASS = { Crítica: "critical", Alta: "high", Media: "medium", Baja: "low" };

const state = {
  records: [],
  extraRecords: [],
  activeRole: "eor",
  view: "dashboard",
  theme: localStorage.getItem(THEME_KEY) || (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"),
  expandedId: null,
  filters: { search: "", muro: "", origen: "", severidad: "", status: "", responsable: "", desde: "", hasta: "" },
  ai: { stage: "idle", fileName: "", suggestions: [], selected: [] },
};

const $ = (selector, parent = document) => parent.querySelector(selector);

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function formatNumber(value) {
  return new Intl.NumberFormat("es-CL").format(value);
}

function formatDate(value) {
  if (!value) return "—";
  const date = new Date(`${value}T12:00:00`);
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat("es-CL", { day: "2-digit", month: "short", year: "numeric" }).format(date);
}

function statusFromProgress(progress) {
  const value = Number(progress) || 0;
  return value === 0 ? "Abierto" : value === 100 ? "Cerrado" : "En proceso";
}

function statusClass(status) {
  return status === "Cerrado" ? "status-closed" : status === "En proceso" ? "status-process" : "status-open";
}

function badge(value, className) {
  return `<span class="badge ${className}">${escapeHtml(value)}</span>`;
}

function toast(message, type = "success") {
  const region = $("#toast-region");
  const node = document.createElement("div");
  node.className = `toast ${type === "error" ? "error" : ""}`;
  node.textContent = message;
  region.append(node);
  window.setTimeout(() => node.remove(), 4200);
}

function saveExtraRecords() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state.extraRecords));
}

function applyTheme() {
  document.documentElement.dataset.theme = state.theme;
}

function loadExtraRecords() {
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
    return Array.isArray(stored) ? stored : [];
  } catch {
    return [];
  }
}

function recordsForRole() {
  return state.activeRole === "trp" ? state.records.filter((record) => ["TRP", "DSR"].includes(record.origen)) : state.records;
}

function uniqueId(prefix, records = state.records) {
  let index = 1;
  let candidate = prefix;
  while (records.some((record) => record.id === candidate)) {
    const match = prefix.match(/(.*-)(\d+)$/);
    candidate = match ? `${match[1]}${String(Number(match[2]) + index).padStart(match[2].length, "0")}` : `${prefix}-${String(index).padStart(3, "0")}`;
    index += 1;
  }
  return candidate;
}

function suggestedId(origin, wall, year) {
  const shortYear = String(year).slice(-2);
  if (origin === "EoR") {
    const count = state.records.filter((record) => record.origen === origin && record.muro === wall && record.id.includes(`-${year}-`)).length + 1;
    return uniqueId(`H-${wall}-${year}-${String(count).padStart(3, "0")}`);
  }
  const count = state.records.filter((record) => record.origen === origin && record.id.startsWith(`${origin}${shortYear}-LT-`)).length + 1;
  return uniqueId(`${origin}${shortYear}-LT-${String(count).padStart(2, "0")}`);
}

function renderHeader() {
  const internal = state.activeRole !== "management";
  const tabs = [
    ["dashboard", "Dashboard"],
    ["list", "Hallazgos"],
    ...(internal ? [["new", "Nuevo hallazgo"], ["ai", "Detectar con IA"]] : []),
  ];

  return `
    <header class="topbar">
      <div class="page-width topbar-inner">
        <div class="brand-block">
          <div class="brand-mark" aria-hidden="true">N·V</div>
          <div>
            <div class="brand-kicker">NAVA · DEMO COMERCIAL</div>
            <div class="brand-name">Hallazgos Cordillera</div>
          </div>
        </div>
        <div class="topbar-actions">
          <div class="role-switcher" aria-label="Selector de rol">
            ${Object.entries(ROLE_META).map(([key, role]) => `<button class="${state.activeRole === key ? "active" : ""}" data-role="${key}">${role.short}</button>`).join("")}
          </div>
          <button class="icon-button" data-action="toggle-theme" aria-label="Cambiar modo de color">${state.theme === "dark" ? "☼" : "☾"}</button>
        </div>
      </div>
    </header>
    <nav class="page-width tabs" aria-label="Navegación principal">
      ${tabs.map(([key, label]) => `<button class="tab ${state.view === key ? "active" : ""}" data-view="${key}">${label}</button>`).join("")}
    </nav>
  `;
}

function renderHero() {
  const role = ROLE_META[state.activeRole];
  return `
    <section class="page-width hero">
      <div>
        <div class="eyebrow">Tranques · Vicuña / Cordillera</div>
        <h1>${escapeHtml(role.title)}</h1>
        <p class="hero-subtitle">${escapeHtml(role.subtitle)}</p>
      </div>
      <div class="hero-meta">${escapeHtml(role.label)}<br />Datos de demostración · actualización local</div>
    </section>
  `;
}

function renderKpi(label, value, foot) {
  return `<article class="kpi-card"><div class="kpi-label">${escapeHtml(label)}</div><div class="kpi-value">${escapeHtml(value)}</div><div class="kpi-foot">${escapeHtml(foot)}</div></article>`;
}

function renderWallChart(records) {
  const counts = WALLS.map(([code, label]) => {
    const subset = records.filter((record) => record.muro === code);
    return { code, label, total: subset.length, values: Object.fromEntries(SEVERITIES.map((severity) => [severity, subset.filter((record) => record.severidad === severity).length])) };
  });

  return `<div class="bar-chart">${counts.map((item) => `
    <div class="bar-row">
      <div class="bar-label">${escapeHtml(item.label)}</div>
      <div class="bar-track" title="${item.total} hallazgos">
        ${SEVERITIES.map((severity) => `<span class="bar-segment ${SEVERITY_CLASS[severity]}" style="width:${item.total ? (item.values[severity] / item.total) * 100 : 0}%" title="${severity}: ${item.values[severity]}"></span>`).join("")}
      </div>
      <div class="bar-total">${item.total}</div>
    </div>`).join("")}</div>
    <div class="legend">${SEVERITIES.map((severity) => `<span class="legend-item"><i class="legend-dot ${SEVERITY_CLASS[severity]}"></i>${severity}</span>`).join("")}</div>`;
}

function renderDonut(records) {
  const values = Object.fromEntries(SEVERITIES.map((severity) => [severity, records.filter((record) => record.severidad === severity).length]));
  const total = records.length;
  let cursor = 0;
  const stops = SEVERITIES.map((severity) => {
    const start = cursor;
    cursor += total ? (values[severity] / total) * 100 : 0;
    return `var(--${SEVERITY_CLASS[severity]}) ${start}% ${cursor}%`;
  }).join(", ");

  return `<div class="donut-wrap"><div class="donut" style="background:conic-gradient(${total ? stops : "var(--surface-soft)"})"><div class="donut-center"><span class="donut-total">${formatNumber(total)}</span><span class="donut-caption">hallazgos</span></div></div><div class="donut-legend">${SEVERITIES.map((severity) => `<div class="legend-item"><span><i class="legend-dot ${SEVERITY_CLASS[severity]}"></i> ${severity}</span><span class="legend-value">${values[severity]} · ${total ? Math.round((values[severity] / total) * 100) : 0}%</span></div>`).join("")}</div></div>`;
}

function renderTrend(records) {
  const months = [...new Set(records.map((record) => record.fecha.slice(0, 7)))].sort();
  if (!months.length) return `<div class="empty-state"><div class="empty-icon">—</div><div>Sin datos disponibles</div></div>`;
  const width = 720;
  const height = 190;
  const margin = { top: 12, right: 18, bottom: 28, left: 28 };
  const monthData = months.map((month) => ({ month, registered: records.filter((record) => record.fecha.slice(0, 7) === month).length, closed: records.filter((record) => record.fecha.slice(0, 7) === month && record.status === "Cerrado").length }));
  const max = Math.max(1, ...monthData.map((item) => Math.max(item.registered, item.closed)));
  const x = (index) => margin.left + (months.length === 1 ? (width - margin.left - margin.right) / 2 : (index / (months.length - 1)) * (width - margin.left - margin.right));
  const y = (value) => height - margin.bottom - (value / max) * (height - margin.top - margin.bottom);
  const path = (key) => monthData.map((item, index) => `${index ? "L" : "M"}${x(index).toFixed(1)},${y(item[key]).toFixed(1)}`).join(" ");

  return `<div class="trend-chart"><svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Tendencia mensual de hallazgos registrados y cerrados">
    ${[0, .5, 1].map((ratio) => `<line class="chart-gridline" x1="${margin.left}" y1="${y(max * ratio)}" x2="${width - margin.right}" y2="${y(max * ratio)}" />`).join("")}
    <path class="chart-line-registered" d="${path("registered")}" />
    <path class="chart-line-closed" d="${path("closed")}" />
    ${monthData.map((item, index) => `<circle class="chart-dot-registered" cx="${x(index)}" cy="${y(item.registered)}" r="3.5" /><circle class="chart-dot-closed" cx="${x(index)}" cy="${y(item.closed)}" r="3.5" /><text class="chart-label" x="${x(index)}" y="${height - 7}" text-anchor="middle">${escapeHtml(item.month.slice(2))}</text>`).join("")}
  </svg><div class="legend"><span class="legend-item"><i class="legend-dot" style="background:var(--brand)"></i>Registrados</span><span class="legend-item"><i class="legend-dot" style="background:var(--gold)"></i>Cerrados</span></div></div>`;
}

function renderResponsible(records) {
  const names = [...new Set(records.map((record) => record.responsable))];
  const items = names.map((name) => {
    const subset = records.filter((record) => record.responsable === name);
    const percent = subset.length ? Math.round((subset.filter((record) => record.status === "Cerrado").length / subset.length) * 100) : 0;
    return { name, percent, count: subset.length };
  }).sort((a, b) => b.percent - a.percent);
  return `<div class="responsible-list">${items.map((item) => `<div class="responsible-row"><div class="responsible-name" title="${escapeHtml(item.name)}">${escapeHtml(item.name)}</div><div class="responsible-track"><div class="responsible-fill" style="width:${item.percent}%"></div></div><div class="responsible-percent">${item.percent}%</div></div>`).join("")}</div>`;
}

function renderFocus(records) {
  const focus = records.filter((record) => record.severidad === "Crítica" && record.status !== "Cerrado").sort((a, b) => a.fecha.localeCompare(b.fecha)).slice(0, 5);
  if (!focus.length) return `<div class="empty-state"><div class="empty-icon">✓</div><div>No hay hallazgos críticos abiertos.</div><small>El foco gerencial está despejado.</small></div>`;
  return `<div class="focus-list">${focus.map((record) => `<div class="focus-item"><i class="focus-marker"></i><div><div class="focus-title">${escapeHtml(record.nombre)}</div><div class="focus-meta">${escapeHtml(record.id)} · ${escapeHtml(record.muroLabel)} · ${record.progreso}% avance</div></div><div class="focus-date">${formatDate(record.fecha)}</div></div>`).join("")}</div>`;
}

function renderDashboard() {
  const records = recordsForRole();
  const open = records.filter((record) => record.status !== "Cerrado").length;
  const criticalOpen = records.filter((record) => record.severidad === "Crítica" && record.status !== "Cerrado").length;
  const average = records.length ? Math.round(records.reduce((sum, record) => sum + record.progreso, 0) / records.length) : 0;
  return `
    <section class="page-width kpi-grid">
      ${renderKpi("Total de hallazgos", formatNumber(records.length), state.activeRole === "trp" ? "Origen TRP y DSR" : "Universo considerado")}
      ${renderKpi("Abiertos / en proceso", formatNumber(open), records.length ? `${Math.round((open / records.length) * 100)}% del universo` : "Sin datos disponibles")}
      ${renderKpi("Críticos sin cerrar", formatNumber(criticalOpen), criticalOpen ? "Requieren foco gerencial" : "Sin pendientes críticos")}
      ${renderKpi("Avance promedio", `${average}%`, "Según progreso de gestión")}
    </section>
    <section class="page-width dashboard-grid">
      <article class="panel"><div class="panel-head"><div><div class="panel-title">Hallazgos por muro</div><div class="panel-note">Composición por severidad</div></div><span class="tag">${formatNumber(records.length)} registros</span></div>${renderWallChart(records)}</article>
      <article class="panel"><div class="panel-head"><div><div class="panel-title">Distribución de severidad</div><div class="panel-note">Sobre el universo de la vista</div></div></div>${renderDonut(records)}</article>
      <article class="panel span-2"><div class="panel-head"><div><div class="panel-title">Tendencia de gestión</div><div class="panel-note">Registro mensual aproximado · cierre según estado vigente</div></div></div>${renderTrend(records)}</article>
      <article class="panel"><div class="panel-head"><div><div class="panel-title">Cumplimiento por responsable</div><div class="panel-note">Porcentaje de hallazgos cerrados</div></div></div>${renderResponsible(records)}</article>
      <article class="panel"><div class="panel-head"><div><div class="panel-title">Foco gerencial</div><div class="panel-note">Críticos abiertos más antiguos</div></div><span class="tag">prioridad</span></div>${renderFocus(records)}</article>
    </section>
  `;
}

function filteredRecords() {
  const { search, muro, origen, severidad, status, responsable, desde, hasta } = state.filters;
  const query = search.trim().toLocaleLowerCase("es");
  return state.records.filter((record) => {
    if (query && ![record.id, record.nombre, record.descripcion, record.responsable].join(" ").toLocaleLowerCase("es").includes(query)) return false;
    if (muro && record.muro !== muro) return false;
    if (origen && record.origen !== origen) return false;
    if (severidad && record.severidad !== severidad) return false;
    if (status && record.status !== status) return false;
    if (responsable && record.responsable !== responsable) return false;
    if (desde && record.fecha < desde) return false;
    if (hasta && record.fecha > hasta) return false;
    return true;
  });
}

function renderFilters() {
  const responsibleOptions = [...new Set(state.records.map((record) => record.responsable))].sort();
  const value = (key) => escapeHtml(state.filters[key]);
  return `<div class="filters">
    <div class="field search-field"><label for="filter-search">Buscar</label><input id="filter-search" data-filter="search" value="${value("search")}" placeholder="ID, título, descripción o responsable" /></div>
    <div class="field"><label for="filter-wall">Muro</label><select id="filter-wall" data-filter="muro"><option value="">Todos</option>${WALLS.map(([code, label]) => `<option value="${code}" ${state.filters.muro === code ? "selected" : ""}>${label}</option>`).join("")}</select></div>
    <div class="field"><label for="filter-origin">Origen</label><select id="filter-origin" data-filter="origen"><option value="">Todos</option>${["EoR", "TRP", "DSR"].map((item) => `<option ${state.filters.origen === item ? "selected" : ""}>${item}</option>`).join("")}</select></div>
    <div class="field"><label for="filter-severity">Severidad</label><select id="filter-severity" data-filter="severidad"><option value="">Todas</option>${SEVERITIES.map((item) => `<option ${state.filters.severidad === item ? "selected" : ""}>${item}</option>`).join("")}</select></div>
    <div class="field"><label for="filter-status">Estado</label><select id="filter-status" data-filter="status"><option value="">Todos</option>${STATUS.map((item) => `<option ${state.filters.status === item ? "selected" : ""}>${item}</option>`).join("")}</select></div>
    <div class="field"><label for="filter-responsible">Responsable</label><select id="filter-responsible" data-filter="responsable"><option value="">Todos</option>${responsibleOptions.map((item) => `<option ${state.filters.responsable === item ? "selected" : ""}>${escapeHtml(item)}</option>`).join("")}</select></div>
    <div class="field"><label for="filter-from">Desde</label><input id="filter-from" type="date" data-filter="desde" value="${value("desde")}" /></div>
    <div class="field"><label for="filter-to">Hasta</label><input id="filter-to" type="date" data-filter="hasta" value="${value("hasta")}" /></div>
  </div>`;
}

function renderTable(records) {
  if (!records.length) return `<div class="empty-state"><div class="empty-icon">⌕</div><strong>No hay hallazgos que coincidan con los filtros seleccionados.</strong><small>Prueba limpiando uno o más filtros.</small></div>`;
  return `<div class="table-wrap"><table class="data-table"><thead><tr><th>ID</th><th>Hallazgo</th><th>Muro</th><th>Origen</th><th>Severidad</th><th>Estado</th><th>Avance</th><th>Fecha</th></tr></thead><tbody>${records.map((record) => {
    const expanded = state.expandedId === record.id;
    return `<tr class="data-row ${expanded ? "expanded" : ""}" data-expand="${escapeHtml(record.id)}"><td class="id-cell">${escapeHtml(record.id)}</td><td class="title-cell">${escapeHtml(record.nombre)}<small>${escapeHtml(record.responsable)}</small></td><td>${escapeHtml(record.muroLabel)}</td><td>${escapeHtml(record.origen)}</td><td>${badge(record.severidad, SEVERITY_CLASS[record.severidad])}</td><td>${badge(record.status, statusClass(record.status))}</td><td><div class="progress-mini"><div class="progress-track"><div class="progress-fill" style="width:${record.progreso}%"></div></div><span class="id-cell">${record.progreso}%</span></div></td><td class="id-cell">${formatDate(record.fecha)}</td></tr>${expanded ? `<tr class="detail-row"><td colspan="8"><div class="detail-content"><div><div class="detail-label">Descripción</div><div class="detail-value">${escapeHtml(record.descripcion)}</div></div><div><div class="detail-label">Plan de acción</div><div class="detail-value">${record.planAccion ? "Definido" : "Pendiente"}</div></div><div><div class="detail-label">Muro / origen</div><div class="detail-value">${escapeHtml(record.muroLabel)} · ${escapeHtml(record.origen)}</div></div><div><div class="detail-label">Responsable</div><div class="detail-value">${escapeHtml(record.responsable)}</div></div></div></td></tr>` : ""}`;
  }).join("")}</tbody></table></div>`;
}

function renderList() {
  const records = filteredRecords();
  return `<section class="page-width"><article class="panel"><div class="panel-head"><div><div class="panel-title">Listado de hallazgos</div><div class="panel-note">Filtra, expande el detalle y exporta el universo visible.</div></div><span class="tag">AND · filtros combinados</span></div>${renderFilters()}<div class="filter-actions"><div class="result-count">${formatNumber(records.length)} de ${formatNumber(state.records.length)} hallazgos</div><div class="button-row"><button class="button small" data-action="clear-filters">Limpiar</button><button class="button small primary" data-action="export-csv">Exportar CSV</button></div></div>${renderTable(records)}</article></section>`;
}

function renderNewForm() {
  const today = new Date().toISOString().slice(0, 10);
  const id = suggestedId("EoR", "MP", new Date().getFullYear());
  return `<section class="page-width form-layout"><article class="panel form-card"><div class="panel-head"><div><div class="panel-title">Registrar nuevo hallazgo</div><div class="panel-note">La información se guarda solo en este navegador.</div></div><span class="tag">captura manual</span></div><form id="new-finding-form"><div class="form-grid">
    <div class="field"><label>ID sugerido</label><input value="${escapeHtml(id)}" readonly aria-label="ID sugerido por el sistema" /></div>
    <div class="field"><label class="required" for="new-date">Fecha de detección</label><input id="new-date" name="fecha" type="date" value="${today}" required /></div>
    <div class="field"><label class="required" for="new-wall">Muro</label><select id="new-wall" name="muro" required>${WALLS.map(([code, label]) => `<option value="${code}" ${code === "MP" ? "selected" : ""}>${label}</option>`).join("")}</select></div>
    <div class="field"><label class="required" for="new-origin">Origen</label><select id="new-origin" name="origen" required><option>EoR</option><option>TRP</option><option>DSR</option></select></div>
    <div class="field full"><label class="required" for="new-name">Nombre del hallazgo</label><input id="new-name" name="nombre" required placeholder="Ej. Filtración en talud aguas abajo" /></div>
    <div class="field full"><label class="required" for="new-description">Descripción</label><textarea id="new-description" name="descripcion" required placeholder="Describe la condición observada y su impacto."></textarea></div>
    <div class="field"><label class="required" for="new-severity">Severidad</label><select id="new-severity" name="severidad" required>${SEVERITIES.map((item) => `<option>${item}</option>`).join("")}</select></div>
    <div class="field"><label class="required" for="new-responsible">Responsable</label><input id="new-responsible" name="responsable" required value="Equipo Geotecnia" /></div>
    <div class="field"><label for="new-progress">Avance de gestión <strong id="progress-value">0%</strong></label><input id="new-progress" name="progreso" type="range" min="0" max="100" step="5" value="0" /></div>
    <div class="field"><label>Estado derivado</label><div class="status-preview"><span>Se actualizará con el avance</span><span id="new-status">${badge("Abierto", "status-open")}</span></div></div>
    <div class="field full"><label class="switch-field"><input name="planAccion" type="checkbox" /> Existe un plan de acción definido</label></div>
  </div><div class="form-footer"><span class="helper">Los campos marcados con * son obligatorios.</span><button class="button primary" type="submit">Guardar hallazgo</button></div></form></article><aside class="side-note"><h3>Captura estructurada</h3><p>El estado se deriva automáticamente del avance para mantener consistencia en el dashboard y el listado.</p><ul class="check-list"><li>ID correlativo sin repetir</li><li>Estado calculado por progreso</li><li>Disponible inmediatamente en Hallazgos</li><li>Persistencia local de demostración</li></ul></aside></section>`;
}

function aiSuggestions() {
  return [
    { nombre: "Drenaje con señales de obstrucción", descripcion: "Se observan indicios de reducción de capacidad en un tramo del sistema de drenaje. Requiere inspección y registro de caudal.", severidad: "Alta", muro: "MP" },
    { nombre: "Instrumentación sin lectura reciente", descripcion: "El instrumento no presenta una lectura vigente en el registro revisado. Se recomienda verificar alimentación, comunicación y condición en terreno.", severidad: "Media", muro: "MO" },
    { nombre: "Playa operativa bajo ancho objetivo", descripcion: "La medición de playa se encuentra bajo el umbral operativo definido para el sector inspeccionado.", severidad: "Crítica", muro: "ME" },
  ];
}

function renderAi() {
  if (state.ai.stage === "analyzing") return `<section class="page-width"><article class="panel"><div class="analysis-state"><div class="spinner"></div><h2>Analizando documento…</h2><p>La demo está preparando hallazgos de ejemplo.</p></div></article></section>`;
  const results = state.ai.stage === "results";
  return `<section class="page-width"><div class="demo-banner"><div class="demo-banner-icon">i</div><div><strong>Función de demostración</strong><p>Este módulo simula la detección desde un documento. No lee ni procesa el contenido real del archivo cargado y no realiza una llamada a un modelo de IA.</p></div></div><article class="panel"><div class="panel-head"><div><div class="panel-title">Detectar hallazgos con IA</div><div class="panel-note">Carga un documento para iniciar el flujo de ejemplo.</div></div><span class="tag">simulado</span></div>${results ? renderAiResults() : `<div class="upload-zone" data-dropzone><div class="upload-icon">↥</div><h3>${state.ai.fileName ? "Documento listo" : "Carga un documento"}</h3><p>${state.ai.fileName ? "Puedes iniciar el análisis simulado." : "Arrastra un PDF o Word aquí, o selecciónalo desde tu equipo."}</p>${state.ai.fileName ? `<div class="file-name">${escapeHtml(state.ai.fileName)}</div>` : ""}<label class="button secondary" for="ai-file">${state.ai.fileName ? "Cambiar archivo" : "Seleccionar archivo"}</label><input id="ai-file" class="file-input" type="file" accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document" /></div><div class="ia-actions"><span class="helper">Se acepta cualquier archivo para esta simulación.</span><button class="button primary" data-action="analyze" ${state.ai.fileName ? "" : "disabled"}>Analizar documento</button></div>`}</article><div class="roadmap"><div class="roadmap-item"><strong>Extracción documental real</strong><span>Próximamente · requiere backend</span></div><div class="roadmap-item"><strong>Alertas automáticas</strong><span>Próximamente · fuera de esta demo</span></div><div class="roadmap-item"><strong>Historial multiusuario</strong><span>Próximamente · requiere persistencia compartida</span></div></div></section>`;
}

function renderAiResults() {
  const selectedCount = state.ai.selected.length;
  return `<div><div class="demo-banner"><div class="demo-banner-icon">✓</div><div><strong>3 hallazgos de ejemplo preparados</strong><p>Selecciona los que quieras importar al listado. Todos quedarán como abiertos y con 0% de avance.</p></div></div><div class="suggestion-list">${state.ai.suggestions.map((item, index) => `<label class="suggestion"><input type="checkbox" data-ai-index="${index}" ${state.ai.selected.includes(index) ? "checked" : ""} /><span><div class="suggestion-title">${escapeHtml(item.nombre)} · ${badge(item.severidad, SEVERITY_CLASS[item.severidad])}</div><div class="suggestion-description">${escapeHtml(item.descripcion)}</div></span></label>`).join("")}</div><div class="ia-actions"><button class="button" data-action="discard-ai">Descartar</button><div class="button-row"><span class="helper">${selectedCount} seleccionados</span><button class="button primary" data-action="import-ai" ${selectedCount ? "" : "disabled"}>Importar seleccionados</button></div></div></div>`;
}

function renderFooter() {
  return `<footer class="page-width footer">Demo comercial para Nava · Los datos y los flujos de IA son demostrativos. La selección de rol no constituye autenticación real.</footer>`;
}

function render() {
  applyTheme();
  const view = state.view === "dashboard" ? renderDashboard() : state.view === "list" ? renderList() : state.view === "new" ? renderNewForm() : renderAi();
  $("#app").innerHTML = `${renderHeader()}<main class="main">${renderHero()}${view}</main>${renderFooter()}`;
}

function readFormData(form) {
  const data = new FormData(form);
  return {
    fecha: data.get("fecha"),
    muro: data.get("muro"),
    origen: data.get("origen"),
    nombre: String(data.get("nombre") || "").trim(),
    descripcion: String(data.get("descripcion") || "").trim(),
    severidad: data.get("severidad"),
    responsable: String(data.get("responsable") || "").trim(),
    progreso: Number(data.get("progreso") || 0),
    planAccion: data.get("planAccion") === "on",
  };
}

function addRecords(records) {
  state.records.push(...records);
  state.extraRecords.push(...records);
  saveExtraRecords();
}

function exportCsv() {
  const rows = filteredRecords();
  if (!rows.length && !window.confirm("No hay hallazgos que coincidan con los filtros. ¿Deseas generar un CSV vacío?")) return;
  try {
    const headers = ["ID", "Origen", "Muro", "Nombre", "Progreso", "Descripción", "Responsable", "Plan de acción", "Estado", "Severidad", "Fecha"];
    const escapeCell = (value) => `"${String(value ?? "").replaceAll('"', '""')}"`;
    const lines = [headers, ...rows.map((record) => [record.id, record.origen, record.muroLabel, record.nombre, `${record.progreso}%`, record.descripcion, record.responsable, record.planAccion ? "Sí" : "No", record.status, record.severidad, record.fecha])].map((row) => row.map(escapeCell).join(";"));
    const blob = new Blob(["\ufeff", lines.join("\r\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `hallazgos-cordillera-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    toast("CSV exportado con codificación UTF-8 y separador ;");
  } catch {
    toast("La exportación de archivos no está disponible en esta vista previa.", "error");
  }
}

function processFile(file) {
  if (!file) return;
  state.ai.fileName = file.name;
  state.ai.stage = "ready";
  state.ai.suggestions = [];
  state.ai.selected = [];
  render();
}

function handleClick(event) {
  const roleButton = event.target.closest("[data-role]");
  if (roleButton) {
    state.activeRole = roleButton.dataset.role;
    if (state.activeRole === "management" && ["new", "ai"].includes(state.view)) state.view = "dashboard";
    render();
    return;
  }
  const viewButton = event.target.closest("[data-view]");
  if (viewButton) {
    state.view = viewButton.dataset.view;
    render();
    return;
  }
  const action = event.target.closest("[data-action]")?.dataset.action;
  if (action === "toggle-theme") {
    state.theme = state.theme === "dark" ? "light" : "dark";
    localStorage.setItem(THEME_KEY, state.theme);
    render();
    return;
  }
  if (action === "clear-filters") {
    state.filters = { search: "", muro: "", origen: "", severidad: "", status: "", responsable: "", desde: "", hasta: "" };
    render();
    return;
  }
  if (action === "export-csv") {
    exportCsv();
    return;
  }
  if (action === "analyze") {
    if (!state.ai.fileName) return;
    state.ai.stage = "analyzing";
    render();
    window.setTimeout(() => {
      state.ai.stage = "results";
      state.ai.suggestions = aiSuggestions();
      state.ai.selected = [];
      render();
    }, 1400);
    return;
  }
  if (action === "discard-ai") {
    state.ai = { stage: "idle", fileName: "", suggestions: [], selected: [] };
    render();
    return;
  }
  if (action === "import-ai") {
    const selected = state.ai.suggestions.filter((_, index) => state.ai.selected.includes(index));
    if (!selected.length) {
      toast("Selecciona al menos un hallazgo", "error");
      return;
    }
    const today = new Date().toISOString().slice(0, 10);
    const imported = selected.map((item, index) => ({
      id: uniqueId(`H-${item.muro}-${new Date().getFullYear()}-${String(state.records.length + index + 1).padStart(3, "0")}`),
      origen: "EoR",
      muro: item.muro,
      muroLabel: WALLS.find(([code]) => code === item.muro)?.[1] || "General",
      nombre: item.nombre,
      descripcion: item.descripcion,
      severidad: item.severidad,
      progreso: 0,
      status: "Abierto",
      responsable: "Equipo Geotecnia",
      fecha: today,
      planAccion: false,
    }));
    addRecords(imported);
    state.ai = { stage: "idle", fileName: "", suggestions: [], selected: [] };
    state.filters = { search: "", muro: "", origen: "", severidad: "", status: "", responsable: "", desde: "", hasta: "" };
    state.expandedId = null;
    state.view = "list";
    render();
    toast(`${imported.length} hallazgo${imported.length === 1 ? "" : "s"} importado${imported.length === 1 ? "" : "s"} al listado.`);
    return;
  }
  const expandable = event.target.closest("[data-expand]");
  if (expandable) {
    state.expandedId = state.expandedId === expandable.dataset.expand ? null : expandable.dataset.expand;
    render();
  }
}

function handleInput(event) {
  const filter = event.target.closest("[data-filter]");
  if (filter) {
    state.filters[filter.dataset.filter] = filter.value;
    render();
    const current = $(`#${filter.id}`);
    if (current) {
      current.focus();
      current.setSelectionRange(current.value.length, current.value.length);
    }
    return;
  }
  if (event.target.id === "new-progress") {
    const value = Number(event.target.value);
    const progressLabel = $("#progress-value");
    const statusLabel = $("#new-status");
    if (progressLabel) progressLabel.textContent = `${value}%`;
    if (statusLabel) statusLabel.innerHTML = badge(statusFromProgress(value), statusClass(statusFromProgress(value)));
  }
}

function handleChange(event) {
  if (event.target.matches("[data-filter]")) {
    state.filters[event.target.dataset.filter] = event.target.value;
    render();
    return;
  }
  if (event.target.matches("[data-ai-index]")) {
    const index = Number(event.target.dataset.aiIndex);
    state.ai.selected = event.target.checked ? [...new Set([...state.ai.selected, index])] : state.ai.selected.filter((item) => item !== index);
    render();
    return;
  }
  if (event.target.id === "ai-file") processFile(event.target.files?.[0]);
}

function handleSubmit(event) {
  if (event.target.id !== "new-finding-form") return;
  event.preventDefault();
  const data = readFormData(event.target);
  if (!data.nombre || !data.descripcion || !data.severidad || !data.responsable || !data.origen) {
    toast("Completa los campos obligatorios.", "error");
    return;
  }
  const year = data.fecha?.slice(0, 4) || String(new Date().getFullYear());
  const id = suggestedId(data.origen, data.muro, year);
  const record = { id, ...data, muroLabel: WALLS.find(([code]) => code === data.muro)?.[1] || "General", status: statusFromProgress(data.progreso) };
  addRecords([record]);
  state.filters = { search: "", muro: "", origen: "", severidad: "", status: "", responsable: "", desde: "", hasta: "" };
  state.expandedId = null;
  state.view = "list";
  render();
  toast(`Hallazgo ${id} guardado correctamente.`);
}

function handleDrag(event) {
  const dropzone = event.target.closest("[data-dropzone]");
  if (!dropzone) return;
  event.preventDefault();
  if (event.type === "dragover") dropzone.classList.add("dragover");
  if (event.type === "dragleave") dropzone.classList.remove("dragover");
  if (event.type === "drop") {
    dropzone.classList.remove("dragover");
    processFile(event.dataTransfer.files?.[0]);
  }
}

async function init() {
  try {
    const response = await fetch("./data/hallazgos.json");
    if (!response.ok) throw new Error("No se pudo cargar el dataset");
    const baseRecords = await response.json();
    state.extraRecords = loadExtraRecords();
    state.records = [...baseRecords, ...state.extraRecords];
    render();
  } catch (error) {
    $("#app").innerHTML = `<main class="main"><section class="page-width"><article class="panel empty-state"><div class="empty-icon">!</div><h2>No se pudo cargar la demo</h2><p>Abre el proyecto mediante un servidor local o GitHub Pages para cargar el dataset JSON.</p><small>${escapeHtml(error.message)}</small></article></section></main>`;
  }
}

document.addEventListener("click", handleClick);
document.addEventListener("input", handleInput);
document.addEventListener("change", handleChange);
document.addEventListener("submit", handleSubmit);
document.addEventListener("dragover", handleDrag);
document.addEventListener("dragleave", handleDrag);
document.addEventListener("drop", handleDrag);
init();
