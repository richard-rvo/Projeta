import React, { createContext, useReducer, useEffect, useCallback, useRef } from 'react';
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import {
  ensureWorkspace, loadWorkspaceData, saveProject as dbSaveProject,
  deleteProject as dbDeleteProject, saveTask as dbSaveTask,
  deleteTask as dbDeleteTask, saveAnomaly as dbSaveAnomaly,
  deleteAnomaly as dbDeleteAnomaly, updateWorkspace as dbUpdateWorkspace,
  verifyWorkspaceData, friendlyDbError, toFriendlyError, isAccessRevoked,
} from '../utils/supabaseRepository';

const authRedirectUrl = import.meta.env.VITE_SITE_URL || window.location.origin;

/* ── initial state ──────────────────────────────────────────── */
/* O link do convite chega com type=invite no hash; o supabase-js limpa o hash ao processá-lo,
   então a leitura é síncrona, na carga do módulo e na montagem do provider. */
export function isInviteHash(hash) {
  return new URLSearchParams(String(hash || '').replace(/^#/, '')).get('type') === 'invite';
}
const BOOT_INVITE = typeof window !== 'undefined' && isInviteHash(window.location.hash);

const initialState = {
  projects: [],
  tasks: [],
  anomalies: [],
  auth: {
    status: 'loading', // loading | ready | error
    user: null,
    workspace: null,
    error: null,
    recovery: false,
    mustSetPassword: false,
    errorCode: null,
  },
  activeProjectId: null,
  activeProjectTab: 'overview',   // 'overview' | 'gantt' | 'kanban' | 'scurve' | 'anomalies'
  activePage: 'pagePortfolio',    // global page when no project workspace is open
  theme: 'light',
  toast: null,
  save: {
    status: 'saved', // 'saved' | 'saving' | 'checking' | 'error'
    pending: 0,
    lastSavedAt: null,
    error: null,
  },

  /* Shell: o rail fica em 64px e sobrepõe ao passar o mouse. Fixá-lo
     reserva a largura de verdade no layout. */
  railPinned: false,

  /* Histórico de edição de tarefas. Não é persistido: desfazer vale
     para a sessão, como em qualquer editor. */
  history: { past: [], future: [] },
  inspectorTaskId: null,
  focusMinuteId: null,            // ata a abrir ao entrar na aba Atas (sem router, Fase 2 troca por URL)
  isCommandPaletteOpen: false,
};

/* ── action types ───────────────────────────────────────────── */
export const ACTIONS = {
  SET_PROJECTS: 'SET_PROJECTS',
  ADD_PROJECT: 'ADD_PROJECT',
  UPDATE_PROJECT: 'UPDATE_PROJECT',
  REMOVE_PROJECT: 'REMOVE_PROJECT',
  SET_TASKS: 'SET_TASKS',
  ADD_TASK: 'ADD_TASK',
  UPDATE_TASK: 'UPDATE_TASK',
  UPDATE_TASKS_BATCH: 'UPDATE_TASKS_BATCH',
  REMOVE_TASK: 'REMOVE_TASK',
  SET_ANOMALIES: 'SET_ANOMALIES',
  AUTH_READY: 'AUTH_READY',
  AUTH_SET_RECOVERY: 'AUTH_SET_RECOVERY',
  AUTH_SET_MUST_SET_PASSWORD: 'AUTH_SET_MUST_SET_PASSWORD',
  AUTH_ERROR: 'AUTH_ERROR',
  AUTH_RETRY: 'AUTH_RETRY',
  AUTH_SIGNED_OUT: 'AUTH_SIGNED_OUT',
  AUTH_WORKSPACE_UPDATED: 'AUTH_WORKSPACE_UPDATED',
  ADD_ANOMALY: 'ADD_ANOMALY',
  UPDATE_ANOMALY: 'UPDATE_ANOMALY',
  REMOVE_ANOMALY: 'REMOVE_ANOMALY',
  SET_ACTIVE_PAGE: 'SET_ACTIVE_PAGE',
  SET_ACTIVE_PROJECT: 'SET_ACTIVE_PROJECT',
  SET_ACTIVE_PROJECT_TAB: 'SET_ACTIVE_PROJECT_TAB',
  SET_THEME: 'SET_THEME',
  SET_TOAST: 'SET_TOAST',
  TOGGLE_RAIL_PINNED: 'TOGGLE_RAIL_PINNED',
  PUSH_HISTORY: 'PUSH_HISTORY',
  UNDO: 'UNDO',
  REDO: 'REDO',
  SET_INSPECTOR_TASK: 'SET_INSPECTOR_TASK',
  OPEN_MINUTE: 'OPEN_MINUTE',
  CLEAR_FOCUS_MINUTE: 'CLEAR_FOCUS_MINUTE',
  TOGGLE_COMMAND_PALETTE: 'TOGGLE_COMMAND_PALETTE',
  SAVE_STARTED: 'SAVE_STARTED',
  SAVE_SUCCEEDED: 'SAVE_SUCCEEDED',
  SAVE_FAILED: 'SAVE_FAILED',
  SAVE_CHECK_STARTED: 'SAVE_CHECK_STARTED',
  SAVE_CHECK_SUCCEEDED: 'SAVE_CHECK_SUCCEEDED',
  SAVE_CHECK_FAILED: 'SAVE_CHECK_FAILED',
};

/* ── reducer ────────────────────────────────────────────────── */
export function reducer(state, action) {
  switch (action.type) {
    case ACTIONS.SET_PROJECTS:
      return { ...state, projects: action.payload };
    case ACTIONS.ADD_PROJECT:
      return { ...state, projects: [...state.projects, action.payload] };
    case ACTIONS.UPDATE_PROJECT:
      return {
        ...state,
        projects: state.projects.map((p) =>
          p.id === action.payload.id ? action.payload : p
        ),
      };
    case ACTIONS.REMOVE_PROJECT:
      return {
        ...state,
        projects: state.projects.filter((p) => p.id !== action.payload),
        tasks: state.tasks.filter((t) => t.projectId !== action.payload),
        anomalies: state.anomalies.filter((a) => a.projectId !== action.payload),
        activeProjectId:
          state.activeProjectId === action.payload ? null : state.activeProjectId,
        activePage:
          state.activeProjectId === action.payload ? 'pagePortfolio' : state.activePage,
      };
    case ACTIONS.SET_TASKS:
      return { ...state, tasks: action.payload };
    case ACTIONS.ADD_TASK:
      return { ...state, tasks: [...state.tasks, action.payload] };
    case ACTIONS.UPDATE_TASK:
      return {
        ...state,
        tasks: state.tasks.map((t) =>
          t.id === action.payload.id ? action.payload : t
        ),
      };
    case ACTIONS.UPDATE_TASKS_BATCH: {
      const updateMap = new Map(action.payload.map(t => [t.id, t]));
      return {
        ...state,
        tasks: state.tasks.map(t => updateMap.has(t.id) ? updateMap.get(t.id) : t),
      };
    }
    case ACTIONS.REMOVE_TASK:
      return {
        ...state,
        tasks: state.tasks.filter((t) => t.id !== action.payload),
      };
    case ACTIONS.SET_ANOMALIES:
      return { ...state, anomalies: action.payload };
    case ACTIONS.AUTH_READY:
      return {
        ...state,
        auth: { status: 'ready', user: action.payload.user, workspace: action.payload.workspace, error: null, recovery: state.auth.recovery, mustSetPassword: state.auth.mustSetPassword, errorCode: null },
        projects: action.payload.data.projects,
        tasks: action.payload.data.tasks,
        anomalies: action.payload.data.anomalies,
      };
    case ACTIONS.AUTH_SET_RECOVERY:
      return { ...state, auth: { ...state.auth, recovery: Boolean(action.payload) } };
    case ACTIONS.AUTH_SET_MUST_SET_PASSWORD:
      return { ...state, auth: { ...state.auth, mustSetPassword: Boolean(action.payload) } };
    case ACTIONS.AUTH_ERROR:
      return {
        ...state,
        auth: { status: 'error', user: null, workspace: null, error: action.payload, recovery: false, mustSetPassword: action.code === 'access_revoked' ? false : state.auth.mustSetPassword, errorCode: action.code || null },
        projects: [], tasks: [], anomalies: [],
      };
    case ACTIONS.AUTH_RETRY:
      return { ...state, auth: { ...state.auth, status: 'loading', error: null } };
    case ACTIONS.AUTH_SIGNED_OUT:
      return {
        ...state,
        auth: { status: 'ready', user: null, workspace: null, error: null, recovery: false, mustSetPassword: false, errorCode: null },
        projects: [], tasks: [], anomalies: [], activeProjectId: null,
        activePage: 'pagePortfolio',
      };
    case ACTIONS.AUTH_WORKSPACE_UPDATED:
      return { ...state, auth: { ...state.auth, workspace: action.payload } };
    case ACTIONS.ADD_ANOMALY:
      return { ...state, anomalies: [...state.anomalies, action.payload] };
    case ACTIONS.UPDATE_ANOMALY:
      return {
        ...state,
        anomalies: state.anomalies.map((a) =>
          a.id === action.payload.id ? action.payload : a
        ),
      };
    case ACTIONS.REMOVE_ANOMALY:
      return {
        ...state,
        anomalies: state.anomalies.filter((a) => a.id !== action.payload),
      };
    case ACTIONS.SET_ACTIVE_PAGE:
      return { ...state, activePage: action.payload };
    case ACTIONS.SET_ACTIVE_PROJECT:
      return {
        ...state,
        activeProjectId: action.payload,
        activeProjectTab: 'overview',
        activePage: action.payload ? 'pageProjectWorkspace' : 'pagePortfolio',
      };
    case ACTIONS.SET_ACTIVE_PROJECT_TAB:
      return { ...state, activeProjectTab: action.payload };
    case ACTIONS.SET_THEME:
      return { ...state, theme: action.payload };
    case ACTIONS.SET_TOAST:
      return { ...state, toast: action.payload };
    case ACTIONS.TOGGLE_RAIL_PINNED:
      return { ...state, railPinned: !state.railPinned };

    /* Uma ação nova invalida o futuro — é o comportamento esperado
       de qualquer editor. Teto de 60 passos para não crescer sem fim. */
    case ACTIONS.PUSH_HISTORY:
      return {
        ...state,
        history: {
          past: [...state.history.past, action.payload].slice(-60),
          future: [],
        },
      };
    case ACTIONS.UNDO: {
      const entry = state.history.past.at(-1);
      if (!entry) return state;
      return {
        ...state,
        history: {
          past: state.history.past.slice(0, -1),
          future: [...state.history.future, entry],
        },
      };
    }
    case ACTIONS.REDO: {
      const entry = state.history.future.at(-1);
      if (!entry) return state;
      return {
        ...state,
        history: {
          past: [...state.history.past, entry],
          future: state.history.future.slice(0, -1),
        },
      };
    }
    case ACTIONS.OPEN_MINUTE:
      return { ...state, focusMinuteId: action.payload, activeProjectTab: 'minutes' };
    case ACTIONS.CLEAR_FOCUS_MINUTE:
      return { ...state, focusMinuteId: null };
    case ACTIONS.SET_INSPECTOR_TASK:
      return { ...state, inspectorTaskId: action.payload };
    case ACTIONS.TOGGLE_COMMAND_PALETTE:
      return { ...state, isCommandPaletteOpen: action.payload !== undefined ? action.payload : !state.isCommandPaletteOpen };
    case ACTIONS.SAVE_STARTED:
      return {
        ...state,
        save: {
          ...state.save,
          status: 'saving',
          pending: state.save.pending + 1,
          error: null,
        },
      };
    case ACTIONS.SAVE_SUCCEEDED: {
      const pending = Math.max(0, state.save.pending - 1);
      return {
        ...state,
        save: {
          status: pending > 0 ? 'saving' : 'saved',
          pending,
          lastSavedAt: action.payload.savedAt,
          error: null,
        },
      };
    }
    case ACTIONS.SAVE_FAILED:
      return {
        ...state,
        save: {
          ...state.save,
          status: 'error',
          pending: Math.max(0, state.save.pending - 1),
          error: action.payload.error,
        },
      };
    case ACTIONS.SAVE_CHECK_STARTED:
      return {
        ...state,
        save: {
          ...state.save,
          status: 'checking',
          error: null,
        },
      };
    case ACTIONS.SAVE_CHECK_SUCCEEDED:
      return {
        ...state,
        save: {
          status: 'saved',
          pending: 0,
          lastSavedAt: action.payload.savedAt,
          error: null,
        },
      };
    case ACTIONS.SAVE_CHECK_FAILED:
      return {
        ...state,
        save: {
          ...state.save,
          status: 'error',
          pending: 0,
          error: action.payload.error,
        },
      };
    default:
      return state;
  }
}

/* ── context ────────────────────────────────────────────────── */
export const AppContext = createContext();

function saveErrorMessage(error) {
  return friendlyDbError(error);
}

function orderById(list) {
  return [...list].sort((a, b) => String(a.id).localeCompare(String(b.id)));
}

function sameCollection(a, b) {
  return JSON.stringify(orderById(a)) === JSON.stringify(orderById(b));
}

export function AppProvider({ children }) {
  const [state, dispatch] = useReducer(reducer, initialState, (base) => (
    BOOT_INVITE || (typeof window !== 'undefined' && isInviteHash(window.location.hash))
      ? { ...base, auth: { ...base.auth, mustSetPassword: true } }
      : base
  ));

  /* Espelhos do estado para os callbacks estáveis. Sem eles, um
     useCallback com deps [] leria sempre o primeiro render. */
  const tasksRef = useRef(state.tasks);
  const projectsRef = useRef(state.projects);
  const historyRef = useRef(state.history);
  const workspaceRef = useRef(state.auth.workspace);
  const loadUserRef = useRef(null);
  useEffect(() => { projectsRef.current = state.projects; }, [state.projects]);
  useEffect(() => { tasksRef.current = state.tasks; }, [state.tasks]);
  useEffect(() => { historyRef.current = state.history; }, [state.history]);

  /* Boot: authenticate first, then load only the active workspace. */
  useEffect(() => {
    if (!isSupabaseConfigured || !supabase) {
      dispatch({ type: ACTIONS.AUTH_ERROR, payload: 'Supabase não está configurado.' });
      return undefined;
    }

    let cancelled = false;
    let loadingUserId = null;
    const loadUser = async (user) => {
      if (!user) {
        workspaceRef.current = null;
        if (!cancelled) dispatch({ type: ACTIONS.AUTH_SIGNED_OUT });
        return;
      }
      if (loadingUserId === user.id) return;
      loadingUserId = user.id;
      try {
        const workspace = await ensureWorkspace(user);
        const data = await loadWorkspaceData(workspace.id);
        if (cancelled) return;
        workspaceRef.current = workspace;
        dispatch({ type: ACTIONS.AUTH_READY, payload: { user, workspace, data } });
      } catch (error) {
        if (!cancelled) dispatch({ type: ACTIONS.AUTH_ERROR, payload: friendlyDbError(error), code: isAccessRevoked(error) ? 'access_revoked' : null });
      } finally {
        if (loadingUserId === user.id) loadingUserId = null;
      }
    };
    loadUserRef.current = loadUser;

    supabase.auth.getSession().then(({ data: { session } }) => loadUser(session?.user || null));
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY') dispatch({ type: ACTIONS.AUTH_SET_RECOVERY, payload: true });
      window.setTimeout(() => loadUser(session?.user || null), 0);
    });
    return () => {
      cancelled = true;
      loadUserRef.current = null;
      subscription.unsubscribe();
    };
  }, []);

  /* Tela de erro do carregamento: refaz a carga para o usuário da sessão atual. */
  const retryLoad = useCallback(async () => {
    if (!supabase || !loadUserRef.current) return;
    dispatch({ type: ACTIONS.AUTH_RETRY });
    let session;
    try {
      const { data, error } = await supabase.auth.getSession();
      if (error) throw error;
      session = data?.session;
    } catch (error) {
      // Sem conseguir ler a sessão (ex.: offline), continua no erro em vez de cair na página pública.
      dispatch({ type: ACTIONS.AUTH_ERROR, payload: friendlyDbError(error), code: isAccessRevoked(error) ? 'access_revoked' : null });
      return;
    }
    await loadUserRef.current?.(session?.user || null);
  }, []);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', state.theme);
  }, [state.theme]);

  /* Auto-dismiss toast */
  useEffect(() => {
    if (state.toast) {
      const id = setTimeout(() => {
        dispatch({ type: ACTIONS.SET_TOAST, payload: null });
      }, 3500);
      return () => clearTimeout(id);
    }
  }, [state.toast]);

  useEffect(() => {
    if (state.save.pending <= 0) return undefined;
    const warnBeforeClosing = (event) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', warnBeforeClosing);
    return () => window.removeEventListener('beforeunload', warnBeforeClosing);
  }, [state.save.pending]);

  const withPersistence = useCallback(async (operation) => {
    dispatch({ type: ACTIONS.SAVE_STARTED });
    try {
      const result = await operation();
      dispatch({
        type: ACTIONS.SAVE_SUCCEEDED,
        payload: { savedAt: new Date().toISOString() },
      });
      return result;
    } catch (error) {
      // Diálogos mostram error.message: a tradução precisa chegar até eles, não só ao state.save.
      const friendly = toFriendlyError(error);
      dispatch({
        type: ACTIONS.SAVE_FAILED,
        payload: { error: friendly.message },
      });
      throw friendly;
    }
  }, []);

  const confirmLocalSave = useCallback(() => {
    dispatch({
      type: ACTIONS.SAVE_CHECK_SUCCEEDED,
      payload: { savedAt: new Date().toISOString() },
    });
  }, []);

  const reportLocalSaveError = useCallback((error) => {
    dispatch({
      type: ACTIONS.SAVE_CHECK_FAILED,
      payload: { error: saveErrorMessage(error) },
    });
  }, []);

  const verifyLocalSave = useCallback(async () => {
    dispatch({ type: ACTIONS.SAVE_CHECK_STARTED });
    try {
      await verifyWorkspaceData(workspaceRef.current?.id, state);
      confirmLocalSave();
      return true;
    } catch (error) {
      const friendly = toFriendlyError(error);
      reportLocalSaveError(friendly);
      throw friendly;
    }
  }, [confirmLocalSave, reportLocalSaveError, state.anomalies, state.projects, state.tasks]);

  /* ── helper actions (persist + dispatch) ─────────────────── */
  const addProject = useCallback(async (project) => {
    const saved = await withPersistence(() => dbSaveProject(project, workspaceRef.current?.id));
    dispatch({ type: ACTIONS.ADD_PROJECT, payload: saved });
    dispatch({ type: ACTIONS.SET_TOAST, payload: { message: 'Projeto criado!', type: 'success' } });
    return saved;
  }, [withPersistence]);

  const updateProject = useCallback(async (project) => {
    const saved = await withPersistence(() => dbSaveProject(project, workspaceRef.current?.id));
    projectsRef.current = projectsRef.current.map((p) => p.id === saved.id ? saved : p);
    dispatch({ type: ACTIONS.UPDATE_PROJECT, payload: saved });
  }, [withPersistence]);

  /* Atualizações do calendário acontecem em sequência enquanto o usuário
     edita campos. O merge usa o último projeto conhecido para uma alteração
     não apagar outra que acabou de ser confirmada. */
  const updateProjectPatch = useCallback(async (id, patch) => {
    const current = projectsRef.current.find((project) => project.id === id);
    if (!current) return;
    const { calendarChanges, ...projectPatch } = patch;
    const next = {
      ...current,
      ...projectPatch,
      ...(calendarChanges ? {
        calendars: (current.calendars || []).map((calendar) =>
          calendar.id === calendarChanges.id
            ? { ...calendar, ...calendarChanges.changes }
            : calendar
        ),
      } : {}),
      updatedAt: new Date().toISOString(),
    };
    projectsRef.current = projectsRef.current.map((project) => project.id === id ? next : project);
    const saved = await withPersistence(() => dbSaveProject(next, workspaceRef.current?.id));
    dispatch({ type: ACTIONS.UPDATE_PROJECT, payload: saved });
  }, [withPersistence]);

  const removeProject = useCallback(async (id) => {
    await withPersistence(() => dbDeleteProject(id, workspaceRef.current?.id));
    dispatch({ type: ACTIONS.REMOVE_PROJECT, payload: id });
    dispatch({ type: ACTIONS.SET_TOAST, payload: { message: 'Projeto removido', type: 'info' } });
  }, [withPersistence]);

  /* ── Tarefas + histórico de desfazer ──────────────────────────
     O histórico guarda DADOS, não funções: cada entrada carrega o
     estado anterior e o posterior das tarefas afetadas. Desfazer é
     regravar `before`; refazer é regravar `after`. Serializável e
     sem closures presas a um render antigo.

     As primitivas `commit*` são as que realmente escrevem; as
     públicas apenas gravam a entrada de histórico antes. É assim que
     undo/redo não entram no próprio histórico.                     */

  const commitUpsert = useCallback(async (list) => {
    await withPersistence(async () => {
      await Promise.all(list.map((t) => dbSaveTask(t, workspaceRef.current?.id)));
    });
    dispatch({ type: ACTIONS.UPDATE_TASKS_BATCH, payload: list });
  }, [withPersistence]);

  const commitInsert = useCallback(async (list) => {
    await withPersistence(async () => {
      await Promise.all(list.map((t) => dbSaveTask(t, workspaceRef.current?.id)));
    });
    for (const t of list) dispatch({ type: ACTIONS.ADD_TASK, payload: t });
  }, [withPersistence]);

  const commitDelete = useCallback(async (ids) => {
    await withPersistence(async () => {
      await Promise.all(ids.map((id) => dbDeleteTask(id, workspaceRef.current?.id)));
    });
    for (const id of ids) dispatch({ type: ACTIONS.REMOVE_TASK, payload: id });
  }, [withPersistence]);

  const record = useCallback((entry) => {
    dispatch({ type: ACTIONS.PUSH_HISTORY, payload: entry });
  }, []);

  const addTask = useCallback(async (task) => {
    await commitInsert([task]);
    record({ label: 'Adicionar tarefa', added: [task], before: [], after: [] });
    return task;
  }, [commitInsert, record]);

  const addTasks = useCallback(async (list) => {
    if (!list.length) return;
    await commitInsert(list);
    record({ label: 'Adicionar tarefas', added: list, before: [], after: [] });
  }, [commitInsert, record]);

  const updateTasksBatch = useCallback(async (tasksToUpdate, label = 'Editar tarefas') => {
    if (!tasksToUpdate?.length) return;
    const current = tasksRef.current;
    const before = tasksToUpdate
      .map((t) => current.find((x) => x.id === t.id))
      .filter(Boolean);
    await commitUpsert(tasksToUpdate);
    record({ label, before, after: tasksToUpdate, added: [] });
  }, [commitUpsert, record]);

  const updateTask = useCallback(
    (task) => updateTasksBatch([task], 'Editar tarefa'),
    [updateTasksBatch]
  );

  const removeTasks = useCallback(async (ids, label = 'Excluir tarefas') => {
    const current = tasksRef.current;
    const removed = ids.map((id) => current.find((t) => t.id === id)).filter(Boolean);
    if (!removed.length) return;
    await commitDelete(ids);
    record({ label, removed, before: [], after: [] });
  }, [commitDelete, record]);

  const removeTask = useCallback((id) => removeTasks([id], 'Excluir tarefa'), [removeTasks]);

  const undo = useCallback(async () => {
    const entry = historyRef.current.past.at(-1);
    if (!entry) return;
    if (entry.added?.length) await commitDelete(entry.added.map((t) => t.id));
    if (entry.removed?.length) await commitInsert(entry.removed);
    if (entry.before?.length) await commitUpsert(entry.before);
    dispatch({ type: ACTIONS.UNDO });
  }, [commitDelete, commitInsert, commitUpsert]);

  const redo = useCallback(async () => {
    const entry = historyRef.current.future.at(-1);
    if (!entry) return;
    if (entry.added?.length) await commitInsert(entry.added);
    if (entry.removed?.length) await commitDelete(entry.removed.map((t) => t.id));
    if (entry.after?.length) await commitUpsert(entry.after);
    dispatch({ type: ACTIONS.REDO });
  }, [commitInsert, commitDelete, commitUpsert]);

  const addAnomaly = useCallback(async (anomaly) => {
    const saved = await withPersistence(() => dbSaveAnomaly(anomaly, workspaceRef.current?.id));
    dispatch({ type: ACTIONS.ADD_ANOMALY, payload: saved });
    dispatch({ type: ACTIONS.SET_TOAST, payload: { message: 'Anomalia registrada!', type: 'success' } });
    return saved;
  }, [withPersistence]);

  const updateAnomaly = useCallback(async (anomaly) => {
    const saved = await withPersistence(() => dbSaveAnomaly(anomaly, workspaceRef.current?.id));
    dispatch({ type: ACTIONS.UPDATE_ANOMALY, payload: saved });
    dispatch({ type: ACTIONS.SET_TOAST, payload: { message: 'Anomalia atualizada!', type: 'success' } });
  }, [withPersistence]);

  const removeAnomaly = useCallback(async (id) => {
    await withPersistence(() => dbDeleteAnomaly(id, workspaceRef.current?.id));
    dispatch({ type: ACTIONS.REMOVE_ANOMALY, payload: id });
  }, [withPersistence]);

  const navigate = useCallback((page) => {
    dispatch({ type: ACTIONS.SET_ACTIVE_PAGE, payload: page });
  }, []);

  const selectProject = useCallback((id) => {
    dispatch({ type: ACTIONS.SET_ACTIVE_PROJECT, payload: id });
  }, []);

  const setProjectTab = useCallback((tab) => {
    dispatch({ type: ACTIONS.SET_ACTIVE_PROJECT_TAB, payload: tab });
  }, []);

  const openMinuteFromOverview = useCallback((minuteId) => {
    dispatch({ type: ACTIONS.OPEN_MINUTE, payload: minuteId });
  }, []);

  const clearFocusMinute = useCallback(() => {
    dispatch({ type: ACTIONS.CLEAR_FOCUS_MINUTE });
  }, []);

  const showToast = useCallback((message, type = 'info') => {
    dispatch({ type: ACTIONS.SET_TOAST, payload: { message, type } });
  }, []);

  const openTaskInspector = useCallback((taskId) => {
    dispatch({ type: ACTIONS.SET_INSPECTOR_TASK, payload: taskId });
  }, []);

  const closeTaskInspector = useCallback(() => {
    dispatch({ type: ACTIONS.SET_INSPECTOR_TASK, payload: null });
  }, []);

  const toggleCommandPalette = useCallback((isOpen) => {
    dispatch({ type: ACTIONS.TOGGLE_COMMAND_PALETTE, payload: isOpen });
  }, []);

  const toggleRailPinned = useCallback(() => {
    dispatch({ type: ACTIONS.TOGGLE_RAIL_PINNED });
  }, []);

  const setTheme = useCallback((theme) => {
    dispatch({ type: ACTIONS.SET_THEME, payload: theme });
  }, []);

  const updateWorkspace = useCallback(async (patch) => {
    const workspace = workspaceRef.current;
    if (!workspace) return;
    const saved = await withPersistence(() => dbUpdateWorkspace(workspace.id, {
      name: patch.name ?? workspace.name,
      timezone: patch.timezone ?? workspace.timezone,
    }));
    workspaceRef.current = saved;
    dispatch({ type: ACTIONS.AUTH_WORKSPACE_UPDATED, payload: saved });
  }, [withPersistence]);

  const signIn = useCallback((email, password) => {
    if (!supabase) return Promise.reject(new Error('Supabase não está configurado.'));
    return supabase.auth.signInWithPassword({ email, password });
  }, []);

  const requestPasswordReset = useCallback((email) => {
    if (!supabase) return Promise.reject(new Error('Supabase não está configurado.'));
    return supabase.auth.resetPasswordForEmail(email, { redirectTo: authRedirectUrl });
  }, []);

  const updatePassword = useCallback(async (password) => {
    if (!supabase) throw new Error('Supabase não está configurado.');
    const result = await supabase.auth.updateUser({ password });
    if (!result?.error) {
      dispatch({ type: ACTIONS.AUTH_SET_RECOVERY, payload: false });
      dispatch({ type: ACTIONS.AUTH_SET_MUST_SET_PASSWORD, payload: false });
    }
    return result;
  }, []);

  const signOut = useCallback(() => supabase?.auth.signOut(), []);

  const value = {
    state,
    dispatch,
    ACTIONS,
    addProject,
    updateProject,
    updateProjectPatch,
    removeProject,
    addTask,
    addTasks,
    updateTask,
    updateTasksBatch,
    removeTask,
    removeTasks,
    undo,
    redo,
    canUndo: state.history.past.length > 0,
    canRedo: state.history.future.length > 0,
    addAnomaly,
    updateAnomaly,
    removeAnomaly,
    navigate,
    selectProject,
    setProjectTab,
    openMinuteFromOverview,
    clearFocusMinute,
    showToast,
    openTaskInspector,
    closeTaskInspector,
    toggleCommandPalette,
    toggleRailPinned,
    setTheme,
    verifyLocalSave,
    confirmLocalSave,
    reportLocalSaveError,
    signIn,
    requestPasswordReset,
    updatePassword,
    signOut,
    retryLoad,
    updateWorkspace,
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}
