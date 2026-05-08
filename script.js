import {
  auth,
  db,
  isFirebaseConfigured,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  sendPasswordResetEmail,
  onAuthStateChanged,
  signOut,
  deleteUser,
  updateProfile,
  EmailAuthProvider,
  reauthenticateWithCredential,
  doc,
  collection,
  query,
  orderBy,
  getDoc,
  getDocs,
  setDoc,
  addDoc,
  updateDoc,
  deleteDoc,
  writeBatch,
  onSnapshot,
  serverTimestamp
} from "./firebase.js";

const page = document.body.dataset.page;
const mask = "••••••••";
const defaultCategories = ["Salário", "Alimentação", "Transporte", "Moradia", "Saúde", "Lazer", "Educação", "Investimentos", "Outros"];
const money = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const dateFmt = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });

const app = {
  user: null,
  profile: null,
  preferences: getDefaultPreferences(),
  categories: [],
  movements: [],
  unsubscribers: [],
  charts: {
    category: null,
    flow: null,
    monthly: null
  }
};

const $ = (id) => document.getElementById(id);

document.documentElement.dataset.theme = "dark";

if (page === "login") {
  initLoginPage();
} else {
  initProtectedPage();
}

function getDefaultPreferences() {
  return {
    theme: "dark",
    hiddenValues: {
      income: false,
      investment: false,
      balance: false
    },
    showCharts: true,
    showCards: true,
    exportRespectHidden: false,
    filters: {
      types: [],
      category: "",
      start: "",
      end: ""
    }
  };
}

function initLoginPage() {
  if (!isFirebaseConfigured) {
    $("firebaseConfigWarning").textContent = "Configure o Firebase em firebase.js antes de usar autenticação e Firestore.";
    $("firebaseConfigWarning").classList.remove("hidden");
  }

  $("showLoginBtn").addEventListener("click", () => setAuthMode("login"));
  $("showRegisterBtn").addEventListener("click", () => setAuthMode("register"));
  $("showRecoveryBtn").addEventListener("click", () => setAuthMode("recovery"));
  $("loginForm").addEventListener("submit", handleLogin);
  $("registerForm").addEventListener("submit", handleRegister);
  $("recoveryForm").addEventListener("submit", handleRecovery);
  ["loginCpf", "registerCpf", "recoveryCpf"].forEach((id) => $(id).addEventListener("input", formatCpfField));

  onAuthStateChanged(auth, (user) => {
    if (user) {
      window.location.href = "dashboard.html";
    }
  });
}

function initProtectedPage() {
  onAuthStateChanged(auth, async (user) => {
    if (!user) {
      window.location.href = "index.html";
      return;
    }

    app.user = user;
    bindSharedEvents();
    await ensureUserBaseData(user);
    subscribeUserData(user.uid);
  });
}

function bindSharedEvents() {
  $("logoutBtn")?.addEventListener("click", handleLogout);
  $("mobileLogoutBtn")?.addEventListener("click", handleLogout);

  if (page === "dashboard") {
    bindDashboardEvents();
  }

  if (page === "settings") {
    bindSettingsEvents();
  }
}

function bindDashboardEvents() {
  $("movementForm").addEventListener("submit", saveMovement);
  $("cancelMovementEditBtn").addEventListener("click", resetMovementForm);
  $("movementsList").addEventListener("click", handleMovementListClick);
  $("clearFiltersBtn").addEventListener("click", clearFilters);
  $("exportPdfBtn").addEventListener("click", exportPdf);
  $("pdfRespectHidden").addEventListener("change", (event) => updatePreferences({ exportRespectHidden: event.target.checked }));
  document.querySelectorAll("[data-hide-card]").forEach((button) => {
    button.addEventListener("click", () => toggleCardPrivacy(button.dataset.hideCard));
  });
  ["filterIncome", "filterExpense", "filterInvestment", "filterCategory", "filterStart", "filterEnd"].forEach((id) => {
    $(id).addEventListener("input", saveFiltersFromUi);
    $(id).addEventListener("change", saveFiltersFromUi);
  });
}

function bindSettingsEvents() {
  $("categoryForm").addEventListener("submit", saveCategory);
  $("cancelCategoryEditBtn").addEventListener("click", resetCategoryForm);
  $("categoriesList").addEventListener("click", handleCategoryListClick);
  $("themeToggle").addEventListener("change", (event) => updatePreferences({ theme: event.target.checked ? "light" : "dark" }));
  $("showChartsToggle").addEventListener("change", (event) => updatePreferences({ showCharts: event.target.checked }));
  $("showCardsToggle").addEventListener("change", (event) => updatePreferences({ showCards: event.target.checked }));
  $("exportHiddenToggle").addEventListener("change", (event) => updatePreferences({ exportRespectHidden: event.target.checked }));
  document.querySelectorAll("[data-privacy]").forEach((input) => {
    input.addEventListener("change", () => {
      updatePreferences({
        hiddenValues: {
          ...app.preferences.hiddenValues,
          [input.dataset.privacy]: input.checked
        }
      });
    });
  });
  $("exportJsonBtn").addEventListener("click", exportJson);
  $("clearDataBtn").addEventListener("click", clearFinancialData);
  $("deleteAccountBtn").addEventListener("click", deleteAccount);
}

function setAuthMode(mode) {
  const login = mode === "login";
  const register = mode === "register";
  const recovery = mode === "recovery";
  $("loginForm").classList.toggle("hidden", !login);
  $("registerForm").classList.toggle("hidden", !register);
  $("recoveryForm").classList.toggle("hidden", !recovery);
  $("showLoginBtn").classList.toggle("active", login);
  $("showRegisterBtn").classList.toggle("active", register);
  $("showRecoveryBtn").classList.toggle("active", recovery);
  clearAuthFields();
  setFeedback($("authFeedback"), "");
}

async function handleRegister(event) {
  event.preventDefault();
  const name = $("registerName").value.trim();
  const cpf = onlyDigits($("registerCpf").value);
  const phone = $("registerPhone").value.trim();
  const password = $("registerPassword").value;
  let createdUser = null;

  if (!isFirebaseConfigured) {
    setFeedback($("authFeedback"), "Configure o Firebase em firebase.js.", "error");
    return;
  }

  if (!name || !phone || !isValidCpf(cpf) || !password.trim()) {
    setFeedback($("authFeedback"), "Preencha cadastro, CPF válido e senha.", "error");
    clearPasswords();
    return;
  }

  try {
    const credential = await createUserWithEmailAndPassword(auth, cpfToEmail(cpf), password);
    createdUser = credential.user;
    await updateProfile(credential.user, { displayName: name });
    await createUserDocuments(credential.user.uid, { name, cpf, phone });
    window.location.href = "dashboard.html";
  } catch (error) {
    if (createdUser) {
      await deleteUser(createdUser).catch(() => {});
    }
    clearPasswords();
    setFeedback($("authFeedback"), authErrorMessage(error), "error");
  }
}

async function handleLogin(event) {
  event.preventDefault();
  const cpf = onlyDigits($("loginCpf").value);
  const password = $("loginPassword").value;

  if (!isFirebaseConfigured) {
    setFeedback($("authFeedback"), "Configure o Firebase em firebase.js.", "error");
    return;
  }

  if (!isValidCpf(cpf) || !password.trim()) {
    setFeedback($("authFeedback"), "Informe CPF válido e senha.", "error");
    clearPasswords();
    return;
  }

  try {
    await signInWithEmailAndPassword(auth, cpfToEmail(cpf), password);
    window.location.href = "dashboard.html";
  } catch (error) {
    clearPasswords();
    setFeedback($("authFeedback"), "Senha incorreta", "error");
  }
}

async function handleRecovery(event) {
  event.preventDefault();
  const cpf = onlyDigits($("recoveryCpf").value);

  if (!isFirebaseConfigured) {
    setFeedback($("authFeedback"), "Configure o Firebase em firebase.js.", "error");
    return;
  }

  if (!isValidCpf(cpf)) {
    setFeedback($("authFeedback"), "Informe um CPF válido.", "error");
    return;
  }

  try {
    await sendPasswordResetEmail(auth, cpfToEmail(cpf));
  } catch (error) {
    // Evita revelar se o CPF está cadastrado.
  }

  clearAuthFields();
  setFeedback($("authFeedback"), "Se o CPF estiver cadastrado, a recuperação foi enviada.", "success");
}

async function createUserDocuments(uid, profile) {
  const batch = writeBatch(db);
  const userRef = doc(db, "users", uid);
  const prefsRef = doc(db, "users", uid, "preferences", "main");
  const cpfRef = doc(db, "cpfIndex", profile.cpf);

  batch.set(userRef, {
    name: profile.name,
    cpf: profile.cpf,
    phone: profile.phone,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  });
  batch.set(prefsRef, getDefaultPreferences());
  batch.set(cpfRef, { uid, createdAt: serverTimestamp() });
  defaultCategories.forEach((name) => {
    const categoryRef = doc(collection(db, "users", uid, "categories"));
    batch.set(categoryRef, { name, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
  });
  await batch.commit();
}

async function ensureUserBaseData(user) {
  const profileRef = doc(db, "users", user.uid);
  const profileSnap = await getDoc(profileRef);

  if (!profileSnap.exists()) {
    await setDoc(profileRef, {
      name: user.displayName || "Usuário",
      cpf: emailToCpf(user.email),
      phone: "",
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });
  }

  const prefsRef = doc(db, "users", user.uid, "preferences", "main");
  const prefsSnap = await getDoc(prefsRef);
  if (!prefsSnap.exists()) {
    await setDoc(prefsRef, getDefaultPreferences());
  }

  const categorySnap = await getDocs(collection(db, "users", user.uid, "categories"));
  if (categorySnap.empty) {
    const batch = writeBatch(db);
    defaultCategories.forEach((name) => {
      const categoryRef = doc(collection(db, "users", user.uid, "categories"));
      batch.set(categoryRef, { name, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
    });
    await batch.commit();
  }
}

function subscribeUserData(uid) {
  app.unsubscribers.forEach((unsubscribe) => unsubscribe());
  app.unsubscribers = [];

  app.unsubscribers.push(onSnapshot(doc(db, "users", uid), (snapshot) => {
    app.profile = snapshot.exists() ? { id: snapshot.id, ...snapshot.data() } : null;
    renderCurrentPage();
  }));

  app.unsubscribers.push(onSnapshot(doc(db, "users", uid, "preferences", "main"), (snapshot) => {
    app.preferences = {
      ...getDefaultPreferences(),
      ...(snapshot.exists() ? snapshot.data() : {})
    };
    app.preferences.hiddenValues = {
      ...getDefaultPreferences().hiddenValues,
      ...(app.preferences.hiddenValues || {})
    };
    app.preferences.filters = {
      ...getDefaultPreferences().filters,
      ...(app.preferences.filters || {})
    };
    applyTheme();
    renderCurrentPage();
  }));

  app.unsubscribers.push(onSnapshot(query(collection(db, "users", uid, "categories"), orderBy("name", "asc")), (snapshot) => {
    app.categories = snapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
    renderCurrentPage();
  }));

  app.unsubscribers.push(onSnapshot(query(collection(db, "users", uid, "movements"), orderBy("date", "desc")), (snapshot) => {
    app.movements = snapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
    renderCurrentPage();
  }));
}

function renderCurrentPage() {
  if (!app.user) {
    return;
  }
  applyTheme();
  if (page === "dashboard") {
    renderDashboard();
  }
  if (page === "settings") {
    renderSettings();
  }
}

function renderDashboard() {
  $("profileName").textContent = app.profile?.name || app.user.displayName || "Perfil ativo";
  $("cardsGrid").classList.toggle("hidden", !app.preferences.showCards);
  $("chartsPanel").classList.toggle("hidden", !app.preferences.showCharts);
  syncFiltersToUi();
  populateCategorySelects();

  const result = getFilteredMovements();
  const totals = calculateTotals(result.items);
  renderCards(totals);
  renderMovements(result.items);
  renderFilterStatus(result);
  renderReportSummary(result.items, totals);
  renderCharts(result.items);
  $("pdfRespectHidden").checked = Boolean(app.preferences.exportRespectHidden);
}

function renderSettings() {
  $("settingsProfileName").textContent = app.profile?.name || app.user.displayName || "Perfil ativo";
  $("themeToggle").checked = app.preferences.theme === "light";
  $("showChartsToggle").checked = Boolean(app.preferences.showCharts);
  $("showCardsToggle").checked = Boolean(app.preferences.showCards);
  $("exportHiddenToggle").checked = Boolean(app.preferences.exportRespectHidden);
  document.querySelectorAll("[data-privacy]").forEach((input) => {
    input.checked = Boolean(app.preferences.hiddenValues[input.dataset.privacy]);
  });
  renderCategories();
}

function applyTheme() {
  document.documentElement.dataset.theme = app.preferences.theme || "dark";
}

function populateCategorySelects() {
  const movementSelect = $("movementCategory");
  const filterSelect = $("filterCategory");
  const currentMovement = movementSelect.value;
  const currentFilter = app.preferences.filters.category || "";
  const categoryNames = getAllCategoryNames();
  const movementOptions = [["", app.categories.length ? "Selecione" : "Crie uma categoria em Configurações"], ...app.categories.map((cat) => [cat.name, cat.name])];

  if (currentMovement && !app.categories.some((category) => category.name === currentMovement) && categoryNames.includes(currentMovement)) {
    movementOptions.push([currentMovement, `${currentMovement} (removida)`]);
  }

  replaceOptions(movementSelect, movementOptions);
  movementSelect.value = movementOptions.some(([value]) => value === currentMovement) ? currentMovement : "";
  movementSelect.disabled = app.categories.length === 0;

  replaceOptions(filterSelect, [["", "Todas as categorias"], ...categoryNames.map((name) => [name, name])]);
  filterSelect.value = categoryNames.includes(currentFilter) ? currentFilter : "";
}

function renderCards(totals) {
  const hidden = app.preferences.hiddenValues;
  setCard("incomeTotal", totals.income, hidden.income);
  setCard("expenseTotal", totals.expense, false);
  setCard("investmentTotal", totals.investment, hidden.investment);
  setCard("balanceTotal", totals.balance, hidden.balance);
  document.querySelectorAll("[data-hide-card]").forEach((button) => {
    const card = button.dataset.hideCard;
    const isHidden = Boolean(hidden[card]);
    button.textContent = isHidden ? "Mostrar" : "Ocultar";
    button.setAttribute("aria-label", `${isHidden ? "Mostrar" : "Ocultar"} ${card}`);
  });
}

function setCard(id, value, hidden) {
  $(id).textContent = hidden ? mask : formatMoney(value);
}

function renderMovements(items) {
  const list = $("movementsList");
  clear(list);

  const sortedItems = [...items].sort((a, b) => b.date.localeCompare(a.date));

  $("movementCount").textContent = `${sortedItems.length} ${sortedItems.length === 1 ? "item" : "itens"}`;

  if (!sortedItems.length) {
    list.append(empty("Nenhuma movimentação encontrada."));
    return;
  }

  sortedItems.forEach((movement) => {
    list.append(createMovementItem(movement));
  });
}

function createMovementItem(movement) {
  const item = document.createElement("article");
  item.className = `list-item movement-item ${movement.type}`;

  const info = document.createElement("div");

  info.append(textEl("p", "item-title", movement.title));
  info.append(textEl("p", "item-meta", `${formatDate(movement.date)} • ${formatType(movement.type)} • ${movement.category}`));

  const value = textEl("strong", "item-value", formatSignedMoney(movement));

  const actions = document.createElement("div");
  actions.className = "item-actions";

  actions.append(actionButton("Editar", "edit", movement.id, "secondary-button"));
  actions.append(actionButton("Excluir", "delete", movement.id, "danger-button"));

  item.append(info, value, actions);

  return item;
}

function renderFilterStatus(result) {
  const status = $("filterStatus");
  const filters = app.preferences.filters;
  clear(status);

  if (result.invalidPeriod) {
    status.append(chip("Período inválido", "warning"));
    return;
  }

  const active = [];
  if (filters.types.length) active.push(`Tipo: ${filters.types.map(formatType).join(" e ")}`);
  if (filters.category) active.push(`Categoria: ${filters.category}`);
  if (filters.start || filters.end) active.push(`Período: ${periodText(filters)}`);

  if (!active.length) {
    status.append(chip("Relatório geral"));
    return;
  }

  active.forEach((text) => status.append(chip(text, "active")));
}

function renderReportSummary(items, totals) {
  const summary = $("reportSummary");
  clear(summary);
  const grid = document.createElement("div");
  grid.className = "summary-grid";
  grid.append(summaryCard("Entradas", totals.income));
  grid.append(summaryCard("Saídas", totals.expense));
  grid.append(summaryCard("Investido", totals.investment));
  grid.append(summaryCard("Saldo", totals.balance));
  summary.append(grid);

  const filters = app.preferences.filters;
  summary.append(chip(`Período: ${periodText(filters)}`, filters.start || filters.end ? "active" : ""));
  summary.append(chip(`Filtros: ${filtersText(filters)}`, filtersHaveValues(filters) ? "active" : ""));
  summary.append(chip(`${items.length} movimentações`));
}

function renderCharts(items) {
  destroyCharts();
  if (!app.preferences.showCharts) return;

  renderCategoryChart(items);
  renderFlowChart(items);
  renderMonthlyChart(items);
}

function renderCategoryChart(items) {
  const expenseItems = items.filter((item) => item.type === "saida");
  const grouped = expenseItems.reduce((acc, item) => {
    acc[item.category] = (acc[item.category] || 0) + Number(item.value);
    return acc;
  }, {});
  const labels = Object.keys(grouped);
  const data = Object.values(grouped);

  if (!window.Chart || !labels.length) {
    $("categoryChart").hidden = true;
    $("categoryChartEmpty").hidden = false;
    return;
  }

  $("categoryChart").hidden = false;
  $("categoryChartEmpty").hidden = true;
  app.charts.category = new Chart($("categoryChart"), {
    type: "doughnut",
    data: {
      labels,
      datasets: [{ data, backgroundColor: chartColors(), borderColor: getCss("--surface"), borderWidth: 2 }]
    },
    options: chartOptions("Gastos")
  });
}

function renderFlowChart(items) {
  const totals = calculateTotals(items);
  const labels = ["Entradas", "Saídas", "Investimentos"];
  const data = [totals.income, totals.expense, totals.investment];

  if (!window.Chart || data.every((value) => value <= 0)) {
    $("flowChart").hidden = true;
    $("flowChartEmpty").hidden = false;
    return;
  }

  $("flowChart").hidden = false;
  $("flowChartEmpty").hidden = true;
  app.charts.flow = new Chart($("flowChart"), {
    type: "pie",
    data: {
      labels,
      datasets: [{ data, backgroundColor: ["#34d399", "#fb7185", "#a78bfa"], borderColor: getCss("--surface"), borderWidth: 2 }]
    },
    options: chartOptions("Fluxo")
  });
}

function renderMonthlyChart(items) {
  const grouped = items.reduce((acc, item) => {
    const month = item.date.slice(0, 7);
    if (!acc[month]) {
      acc[month] = { income: 0, expense: 0, investment: 0 };
    }
    if (item.type === "entrada") acc[month].income += Number(item.value);
    if (item.type === "saida") acc[month].expense += Number(item.value);
    if (item.type === "investimento") acc[month].investment += Number(item.value);
    return acc;
  }, {});
  const labels = Object.keys(grouped).sort();

  if (!window.Chart || !labels.length) {
    $("monthlyChart").hidden = true;
    $("monthlyChartEmpty").hidden = false;
    return;
  }

  $("monthlyChart").hidden = false;
  $("monthlyChartEmpty").hidden = true;
  app.charts.monthly = new Chart($("monthlyChart"), {
    type: "bar",
    data: {
      labels: labels.map(formatMonth),
      datasets: [
        { label: "Entradas", data: labels.map((label) => grouped[label].income), backgroundColor: "#34d399" },
        { label: "Saídas", data: labels.map((label) => grouped[label].expense), backgroundColor: "#fb7185" },
        { label: "Investimentos", data: labels.map((label) => grouped[label].investment), backgroundColor: "#a78bfa" }
      ]
    },
    options: chartOptions("Mensal")
  });
}

function chartOptions(title) {
  return {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { position: "bottom", labels: { color: getCss("--text") } },
      tooltip: {
        callbacks: {
          label: (context) => {
            const parsed = typeof context.parsed === "object" ? context.parsed.y : context.parsed;
            const label = context.dataset?.label || context.label;
            return `${label}: ${formatMoney(parsed || 0)}`;
          }
        }
      },
      title: { display: true, text: title, color: getCss("--text") }
    }
  };
}

async function saveMovement(event) {
  event.preventDefault();
  const id = $("movementId").value;
  const title = $("movementName").value.trim();
  const rawValue = $("movementValue").value.trim();
  const value = Number(rawValue);
  const type = $("movementType").value;
  const category = $("movementCategory").value;
  const date = $("movementDate").value || today();

  if (!title || !rawValue || !type || !category) {
    setFeedback($("movementFeedback"), "Preencha todos os campos.", "error");
    return;
  }
  if (!Number.isFinite(value) || value < 0) {
    setFeedback($("movementFeedback"), "Valores negativos não são permitidos.", "error");
    return;
  }
  if (!isValidDate(date)) {
    setFeedback($("movementFeedback"), "Data inválida.", "error");
    return;
  }

  const payload = {
    title,
    value: roundMoney(value),
    type,
    category,
    date,
    updatedAt: serverTimestamp()
  };

  try {
    if (id) {
      await updateDoc(doc(db, "users", app.user.uid, "movements", id), payload);
      toast("Movimentação atualizada.", "success");
    } else {
      await addDoc(collection(db, "users", app.user.uid, "movements"), { ...payload, createdAt: serverTimestamp() });
      toast("Movimentação criada.", "success");
    }
    resetMovementForm();
  } catch (error) {
    setFeedback($("movementFeedback"), "Não foi possível salvar.", "error");
  }
}

function handleMovementListClick(event) {
  const button = event.target.closest("button[data-action]");
  if (!button) return;

  const movement = app.movements.find((item) => item.id === button.dataset.id);
  if (!movement) return;

  if (button.dataset.action === "edit") {
    $("movementId").value = movement.id;
    $("movementName").value = movement.title;
    $("movementValue").value = Number(movement.value).toFixed(2);
    $("movementType").value = movement.type;
    $("movementCategory").value = movement.category;
    $("movementDate").value = movement.date;
    $("saveMovementBtn").textContent = "Atualizar";
    $("cancelMovementEditBtn").classList.remove("hidden");
  }

  if (button.dataset.action === "delete") {
    deleteMovement(movement);
  }
}

async function deleteMovement(movement) {
  if (!window.confirm(`Excluir a movimentação "${movement.title}"?`)) return;
  await deleteDoc(doc(db, "users", app.user.uid, "movements", movement.id));
  toast("Movimentação excluída.", "success");
}

function resetMovementForm() {
  $("movementForm").reset();
  $("movementId").value = "";
  $("movementDate").value = today();
  $("saveMovementBtn").textContent = "Salvar";
  $("cancelMovementEditBtn").classList.add("hidden");
  setFeedback($("movementFeedback"), "");
  populateCategorySelects();
}

function saveFiltersFromUi() {
  const filters = {
    types: [
      $("filterIncome").checked ? "entrada" : "",
      $("filterExpense").checked ? "saida" : "",
      $("filterInvestment").checked ? "investimento" : ""
    ].filter(Boolean),
    category: $("filterCategory").value,
    start: isValidDate($("filterStart").value) ? $("filterStart").value : "",
    end: isValidDate($("filterEnd").value) ? $("filterEnd").value : ""
  };
  updatePreferences({ filters });
}

function syncFiltersToUi() {
  const filters = app.preferences.filters;
  $("filterIncome").checked = filters.types.includes("entrada");
  $("filterExpense").checked = filters.types.includes("saida");
  $("filterInvestment").checked = filters.types.includes("investimento");
  $("filterStart").value = filters.start || "";
  $("filterEnd").value = filters.end || "";
}

function clearFilters() {
  updatePreferences({ filters: getDefaultPreferences().filters });
}

function getFilteredMovements() {
  const filters = app.preferences.filters;
  const invalidPeriod = Boolean(filters.start && filters.end && filters.start > filters.end);
  if (invalidPeriod) return { items: [], invalidPeriod };

  const items = app.movements.filter((item) => {
    const typeOk = !filters.types.length || filters.types.includes(item.type);
    const categoryOk = !filters.category || item.category === filters.category;
    const startOk = !filters.start || item.date >= filters.start;
    const endOk = !filters.end || item.date <= filters.end;
    return typeOk && categoryOk && startOk && endOk;
  });
  return { items, invalidPeriod };
}

function calculateTotals(items) {
  return items.reduce((totals, item) => {
    const value = Number(item.value) || 0;
    if (item.type === "entrada") totals.income += value;
    if (item.type === "saida") totals.expense += value;
    if (item.type === "investimento") totals.investment += value;
    totals.balance = totals.income - totals.expense - totals.investment;
    return totals;
  }, { income: 0, expense: 0, investment: 0, balance: 0 });
}

async function saveCategory(event) {
  event.preventDefault();
  const id = $("categoryId").value;
  const name = $("categoryName").value.trim();
  if (!name) return;
  if (app.categories.some((cat) => cat.id !== id && same(cat.name, name))) {
    toast("Categoria duplicada.", "error");
    return;
  }

  if (id) {
    await updateDoc(doc(db, "users", app.user.uid, "categories", id), { name, updatedAt: serverTimestamp() });
    toast("Categoria atualizada.", "success");
  } else {
    await addDoc(collection(db, "users", app.user.uid, "categories"), { name, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
    toast("Categoria criada.", "success");
  }
  resetCategoryForm();
}

function renderCategories() {
  const list = $("categoriesList");
  clear(list);
  if (!app.categories.length) {
    list.append(empty("Nenhuma categoria cadastrada."));
    return;
  }

  app.categories.forEach((category) => {
    const item = document.createElement("article");
    item.className = "list-item";
    item.append(textEl("p", "item-title", category.name));
    const actions = document.createElement("div");
    actions.className = "item-actions";
    actions.append(actionButton("Editar", "edit-category", category.id, "secondary-button"));
    actions.append(actionButton("Remover", "delete-category", category.id, "danger-button"));
    item.append(actions);
    list.append(item);
  });
}

function handleCategoryListClick(event) {
  const button = event.target.closest("button[data-action]");
  if (!button) return;
  const category = app.categories.find((item) => item.id === button.dataset.id);
  if (!category) return;

  if (button.dataset.action === "edit-category") {
    $("categoryId").value = category.id;
    $("categoryName").value = category.name;
    $("saveCategoryBtn").textContent = "Atualizar categoria";
    $("cancelCategoryEditBtn").classList.remove("hidden");
  }

  if (button.dataset.action === "delete-category") {
    removeCategory(category);
  }
}

async function removeCategory(category) {
  if (!window.confirm(`Remover a categoria "${category.name}"? As movimentações antigas serão mantidas.`)) return;
  await deleteDoc(doc(db, "users", app.user.uid, "categories", category.id));
  toast("Categoria removida.", "success");
}

function resetCategoryForm() {
  $("categoryForm").reset();
  $("categoryId").value = "";
  $("saveCategoryBtn").textContent = "Salvar categoria";
  $("cancelCategoryEditBtn").classList.add("hidden");
}

async function toggleCardPrivacy(card) {
  await updatePreferences({
    hiddenValues: {
      ...app.preferences.hiddenValues,
      [card]: !app.preferences.hiddenValues[card]
    }
  });
}

async function updatePreferences(partial) {
  if (!app.user) return;
  app.preferences = {
    ...app.preferences,
    ...partial
  };
  applyTheme();
  await setDoc(doc(db, "users", app.user.uid, "preferences", "main"), app.preferences, { merge: true });
}

async function clearFinancialData() {
  if (!window.confirm("Limpar todas as movimentações e categorias? O perfil e preferências serão mantidos.")) return;
  const batch = writeBatch(db);
  app.movements.forEach((item) => batch.delete(doc(db, "users", app.user.uid, "movements", item.id)));
  app.categories.forEach((item) => batch.delete(doc(db, "users", app.user.uid, "categories", item.id)));
  await batch.commit();
  toast("Dados financeiros removidos.", "success");
}

async function deleteAccount() {
  const confirmed = window.confirm("Tem certeza que deseja excluir este perfil? Esta ação não poderá ser desfeita.");
  if (!confirmed) return;

  const password = window.prompt("Digite sua senha para confirmar a exclusão da conta.");
  if (!password) return;

  try {
    const credential = EmailAuthProvider.credential(app.user.email, password);
    await reauthenticateWithCredential(app.user, credential);
    await deleteAllUserData();
    await deleteUser(app.user);
    window.location.href = "index.html";
  } catch (error) {
    toast("Não foi possível excluir. Confira a senha e tente novamente.", "error");
  }
}

function exportJson() {
  const payload = {
    exportedAt: new Date().toISOString(),
    profile: app.profile,
    preferences: app.preferences,
    categories: app.categories,
    movements: app.movements
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `finance-pro-dados-${today()}.json`;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
  toast("Dados exportados em JSON.", "success");
}

async function deleteAllUserData() {
  const uid = app.user.uid;
  const batch = writeBatch(db);
  app.movements.forEach((item) => batch.delete(doc(db, "users", uid, "movements", item.id)));
  app.categories.forEach((item) => batch.delete(doc(db, "users", uid, "categories", item.id)));
  batch.delete(doc(db, "users", uid, "preferences", "main"));
  batch.delete(doc(db, "cpfIndex", app.profile?.cpf || emailToCpf(app.user.email)));
  batch.delete(doc(db, "users", uid));
  await batch.commit();
}

async function exportPdf() {
  if (!window.jspdf?.jsPDF) {
    toast("jsPDF não carregou.", "error");
    return;
  }
  const respectHidden = $("pdfRespectHidden").checked;
  const { jsPDF } = window.jspdf;
  const result = getFilteredMovements();
  const totals = calculateTotals(result.items);
  const filters = app.preferences.filters;
  const docPdf = new jsPDF({ unit: "pt", format: "a4" });
  const margin = 42;
  const width = docPdf.internal.pageSize.getWidth();
  const height = docPdf.internal.pageSize.getHeight();
  let y = margin;

  const add = (text, size = 10, bold = false) => {
    docPdf.setFont("helvetica", bold ? "bold" : "normal");
    docPdf.setFontSize(size);
    const lines = docPdf.splitTextToSize(text, width - margin * 2);
    if (y + lines.length * (size + 5) > height - margin) {
      docPdf.addPage();
      y = margin;
    }
    docPdf.text(lines, margin, y);
    y += lines.length * (size + 5);
  };

  add("Relatório financeiro", 18, true);
  add(`Usuário: ${app.profile?.name || app.user.displayName || "Usuário"}`, 11);
  add(`Data de geração: ${formatDate(today())}`, 11);
  add(`Período: ${periodText(filters)}`, 11);
  add(`Filtros: ${filtersText(filters)}`, 11);
  y += 10;
  add(`Entradas: ${pdfValue("income", totals.income, respectHidden)}`, 12, true);
  add(`Saídas: ${pdfValue("expense", totals.expense, respectHidden)}`, 12, true);
  add(`Investido: ${pdfValue("investment", totals.investment, respectHidden)}`, 12, true);
  add(`Saldo: ${pdfValue("balance", totals.balance, respectHidden)}`, 12, true);
  y += 10;
  add("Gráficos", 13, true);
  addChartToPdf(docPdf, $("categoryChart"), "Gastos por categoria", margin, width, height, () => y, (nextY) => { y = nextY; });
  addChartToPdf(docPdf, $("flowChart"), "Entradas vs saídas", margin, width, height, () => y, (nextY) => { y = nextY; });
  addChartToPdf(docPdf, $("monthlyChart"), "Gráfico mensal", margin, width, height, () => y, (nextY) => { y = nextY; });
  y += 10;
  add("Movimentações", 13, true);

  if (!result.items.length) {
    add("Nenhuma movimentação encontrada.");
  } else {
    result.items.forEach((item, index) => {
      add(`${index + 1}. ${formatDate(item.date)} | ${formatType(item.type)} | ${item.category}`, 10, true);
      add(`${item.title} | ${pdfMovementValue(item, respectHidden)}`, 10);
    });
  }

  docPdf.save(`relatorio-financeiro-${today()}.pdf`);
  await updatePreferences({ exportRespectHidden: respectHidden });
  toast("PDF exportado.", "success");
}

function pdfValue(card, value, respectHidden) {
  return respectHidden && app.preferences.hiddenValues[card] ? mask : formatMoney(value);
}

function pdfMovementValue(item, respectHidden) {
  const card = item.type === "entrada" ? "income" : item.type === "saida" ? "" : "investment";
  return respectHidden && app.preferences.hiddenValues[card] ? mask : formatSignedMoney(item);
}

function addChartToPdf(docPdf, canvas, title, margin, width, height, getY, setY) {
  if (!canvas || canvas.hidden) return;
  let y = getY();
  if (y + 210 > height - margin) {
    docPdf.addPage();
    y = margin;
  }
  docPdf.setFont("helvetica", "bold");
  docPdf.setFontSize(11);
  docPdf.text(title, margin, y);
  y += 10;
  const image = canvas.toDataURL("image/png", 1);
  docPdf.addImage(image, "PNG", margin, y, width - margin * 2, 170);
  setY(y + 190);
}

async function handleLogout() {
  app.unsubscribers.forEach((unsubscribe) => unsubscribe());
  await signOut(auth);
  window.location.href = "index.html";
}

function destroyCharts() {
  Object.keys(app.charts).forEach((key) => {
    if (app.charts[key]) {
      app.charts[key].destroy();
      app.charts[key] = null;
    }
  });
}

function getAllCategoryNames() {
  return [...new Set([...app.categories.map((item) => item.name), ...app.movements.map((item) => item.category)])]
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b, "pt-BR"));
}

function replaceOptions(select, options) {
  clear(select);
  options.forEach(([value, label]) => {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = label;
    select.append(option);
  });
}

function actionButton(label, action, id, className) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = className;
  button.dataset.action = action;
  button.dataset.id = id;
  button.textContent = label;
  return button;
}

function summaryCard(label, value) {
  const card = document.createElement("article");
  card.className = "summary-card";
  card.append(textEl("span", "", label));
  card.append(textEl("strong", "", formatMoney(value)));
  return card;
}

function chip(text, variant = "") {
  const item = document.createElement("span");
  item.className = `chip ${variant}`.trim();
  item.textContent = text;
  return item;
}

function empty(text) {
  return textEl("p", "empty-state", text);
}

function textEl(tag, className, text) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  element.textContent = text;
  return element;
}

function clear(element) {
  while (element.firstChild) element.removeChild(element.firstChild);
}

function setFeedback(element, text, type = "") {
  element.textContent = text;
  element.className = `feedback ${type}`.trim();
}

function toast(message, type = "") {
  const area = $("toastArea");
  if (!area) return;
  const item = document.createElement("div");
  item.className = `toast ${type}`.trim();
  item.textContent = message;
  area.append(item);
  setTimeout(() => item.remove(), 3200);
}

function clearPasswords() {
  ["loginPassword", "registerPassword"].forEach((id) => {
    if ($(id)) $(id).value = "";
  });
}

function clearAuthFields() {
  ["loginCpf", "loginPassword", "registerName", "registerCpf", "registerPhone", "registerPassword", "recoveryCpf"].forEach((id) => {
    if ($(id)) $(id).value = "";
  });
}

function authErrorMessage(error) {
  if (error.code === "auth/email-already-in-use") return "CPF já cadastrado.";
  if (error.code === "auth/weak-password") return "A senha deve ter pelo menos 6 caracteres.";
  return "Não foi possível concluir a autenticação.";
}

function cpfToEmail(cpf) {
  return `${onlyDigits(cpf)}@app.local`;
}

function emailToCpf(email = "") {
  return email.split("@")[0].replace(/\D/g, "");
}

function onlyDigits(value) {
  return String(value || "").replace(/\D/g, "");
}

function formatCpfField(event) {
  const value = onlyDigits(event.target.value).slice(0, 11);
  event.target.value = value
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d{1,2})$/, "$1-$2");
}

function isValidCpf(cpf) {
  const value = onlyDigits(cpf);
  if (value.length !== 11 || /^(\d)\1{10}$/.test(value)) return false;
  const calc = (base) => {
    let sum = 0;
    for (let i = 0; i < base; i += 1) sum += Number(value[i]) * (base + 1 - i);
    const mod = (sum * 10) % 11;
    return mod === 10 ? 0 : mod;
  };
  return calc(9) === Number(value[9]) && calc(10) === Number(value[10]);
}

function isValidDate(value) {
  if (!value) return false;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return parsed.getUTCFullYear() === year && parsed.getUTCMonth() === month - 1 && parsed.getUTCDate() === day;
}

function today() {
  const now = new Date();
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
}

function formatDate(value) {
  if (!isValidDate(value)) return "";
  const [year, month, day] = value.split("-").map(Number);
  return dateFmt.format(new Date(year, month - 1, day));
}

function formatMonth(value) {
  const [year, month] = value.split("-").map(Number);
  return new Intl.DateTimeFormat("pt-BR", { month: "short", year: "2-digit" }).format(new Date(year, month - 1, 1));
}

function formatType(type) {
  if (type === "saida") return "Saída";
  if (type === "investimento") return "Investimento";
  return "Entrada";
}

function formatMoney(value) {
  return money.format(roundMoney(value));
}

function formatSignedMoney(item) {
  const sign = item.type === "entrada" ? "+" : "-";
  return `${sign}${formatMoney(item.value)}`;
}

function roundMoney(value) {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}

function periodText(filters) {
  if (filters.start && filters.end) return `${formatDate(filters.start)} a ${formatDate(filters.end)}`;
  if (filters.start) return `A partir de ${formatDate(filters.start)}`;
  if (filters.end) return `Até ${formatDate(filters.end)}`;
  return "Todo o período";
}

function filtersText(filters) {
  const parts = [];
  if (filters.types.length) parts.push(`tipo ${filters.types.map(formatType).join(" e ")}`);
  if (filters.category) parts.push(`categoria ${filters.category}`);
  return parts.length ? parts.join(", ") : "sem filtros ativos";
}

function filtersHaveValues(filters) {
  return Boolean(filters.types.length || filters.category || filters.start || filters.end);
}

function same(a, b) {
  return String(a).trim().toLocaleLowerCase("pt-BR") === String(b).trim().toLocaleLowerCase("pt-BR");
}

function chartColors() {
  return ["#60a5fa", "#34d399", "#fb7185", "#a78bfa", "#fbbf24", "#22d3ee", "#f472b6", "#84cc16", "#818cf8", "#f97316"];
}

function getCss(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

// Segurança local da interface: CPF vira e-mail técnico apenas para o Firebase Auth.
// A senha nunca é salva no código ou no Firestore; a proteção real é feita pelo Firebase Authentication.
