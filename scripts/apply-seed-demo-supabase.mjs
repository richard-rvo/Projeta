/**
 * Importa o conteúdo de scripts/seed-demo.js para o Supabase.
 *
 * Uso seguro:
 *   SEED_USER_ID=<uuid> node scripts/apply-seed-demo-supabase.mjs
 *   SEED_USER_ID=<uuid> SEED_APPLY=1 node scripts/apply-seed-demo-supabase.mjs
 *
 * Requer SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY no ambiente.
 * A service role é usada somente neste processo local/server-side.
 * O script nunca apaga dados e aborta se já encontrar um seed importado.
 */

import fs from 'node:fs/promises';
import vm from 'node:vm';
import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

const userId = process.env.SEED_USER_ID;
const supabaseUrl = process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const shouldApply = process.env.SEED_APPLY === '1';

if (!userId || !supabaseUrl || !serviceRoleKey) {
  throw new Error('Defina SEED_USER_ID, SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY.');
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

function requireData(result, label) {
  if (result.error) throw new Error(`${label}: ${result.error.message}`);
  return result.data;
}

async function captureLocalSeed() {
  const source = await fs.readFile(new URL('./seed-demo.js', import.meta.url), 'utf8');
  const stores = { projects: new Map(), tasks: new Map(), anomalies: new Map() };

  function transaction(storeNames) {
    let complete;
    let settled = false;
    const tx = {
      objectStore(name) {
        return {
          clear() { stores[name].clear(); },
          put(value) { stores[name].set(value.id, value); },
        };
      },
      set oncomplete(handler) {
        complete = handler;
        if (!settled) {
          settled = true;
          queueMicrotask(() => complete?.());
        }
      },
      set onerror(_handler) {},
    };
    for (const name of storeNames) if (!stores[name]) throw new Error(`Store desconhecido: ${name}`);
    return tx;
  }

  const indexedDB = {
    open() {
      const request = {};
      request.result = { transaction };
      setTimeout(() => request.onsuccess?.({
        target: {
          result: request.result,
        },
      }));
      return request;
    },
  };

  await new Promise((resolve, reject) => {
    try {
      vm.runInNewContext(source, {
        indexedDB,
        location: { reload() {} },
        setTimeout,
        console,
        Date,
      });
      setTimeout(resolve, 20);
    } catch (error) {
      reject(error);
    }
  });

  return {
    projects: [...stores.projects.values()],
    tasks: [...stores.tasks.values()],
    anomalies: [...stores.anomalies.values()],
  };
}

function mapSeedData(seed, workspaceId) {
  const ids = new Map();
  const uuidFor = (oldId) => {
    if (!ids.has(oldId)) ids.set(oldId, randomUUID());
    return ids.get(oldId);
  };
  const sourceMetadata = { seedSource: 'scripts/seed-demo.js', seedImportedAt: new Date().toISOString() };

  const projects = seed.projects.map((project) => ({
    id: uuidFor(project.id),
    workspace_id: workspaceId,
    name: project.name,
    description: project.description || '',
    start_date: project.startDate || null,
    end_date: project.endDate || null,
    status: project.status || 'Planejado',
    calendars: project.calendars || [],
    default_calendar_id: project.defaultCalendarId || null,
    calendar_settings: project.calendarSettings || { durationDisplay: 'auto' },
    metadata: { ...(project.metadata || {}), ...sourceMetadata },
  }));

  const tasks = seed.tasks.map((task) => {
    const { id, projectId, dependsOn, startDate, endDate, baselineStart, baselineEnd,
      progress, scheduleMode, calendarId, indentLevel, order, resources, ...metadata } = task;
    return {
      id: uuidFor(id),
      workspace_id: workspaceId,
      project_id: uuidFor(projectId),
      name: task.name || '',
      start_date: startDate || null,
      end_date: endDate || null,
      baseline_start: baselineStart || null,
      baseline_end: baselineEnd || null,
      progress: Number(progress || 0),
      schedule_mode: scheduleMode || 'auto',
      calendar_id: calendarId || null,
      depends_on: Array.isArray(dependsOn)
        ? dependsOn.map((dependency) => ({ ...dependency, id: uuidFor(dependency.id) }))
        : [],
      constraint_type: task.constraintType || null,
      constraint_date: task.constraintDate || null,
      indent_level: indentLevel || 0,
      order_index: order || 0,
      resources: resources || [],
      metadata: { ...metadata, ...sourceMetadata },
    };
  });

  const anomalies = seed.anomalies.map((anomaly) => {
    const { id, projectId, taskId, title, description, status, severity, photos,
      occurredAt, resolvedAt, ...metadata } = anomaly;
    return {
      id: uuidFor(id),
      workspace_id: workspaceId,
      project_id: uuidFor(projectId),
      task_id: taskId ? uuidFor(taskId) : null,
      title: title || '',
      description: description || '',
      status: status || 'aberta',
      severity: severity || null,
      photos: Array.isArray(photos) ? photos : [],
      occurred_at: occurredAt || null,
      resolved_at: resolvedAt || null,
      metadata: { ...metadata, ...sourceMetadata },
    };
  });

  return { projects, tasks, anomalies };
}

const user = requireData(await supabase.auth.admin.getUserById(userId), 'Usuário');
if (!user?.user) throw new Error(`Usuário não encontrado: ${userId}`);

const workspaces = requireData(
  await supabase.from('workspaces').select('id,name,owner_id').eq('owner_id', userId).order('created_at').limit(1),
  'Workspace'
);

let workspace = workspaces[0];
if (!workspace) {
  if (!shouldApply) {
    workspace = { id: '(será criado)', name: 'Projeta', owner_id: userId };
  } else {
    workspace = requireData(
      await supabase.from('workspaces').insert({ name: 'Projeta', owner_id: userId }).select('id,name,owner_id').single(),
      'Criação do workspace'
    );
  }
}

const seed = await captureLocalSeed();
const data = workspace.id === '(será criado)' ? null : mapSeedData(seed, workspace.id);

if (data) {
  const existing = requireData(
    await supabase.from('projects').select('id,name,metadata').eq('workspace_id', workspace.id),
    'Verificação de seed existente'
  );
  if (existing.some((project) => project.metadata?.seedSource === 'scripts/seed-demo.js')) {
    throw new Error('Este seed já foi importado neste workspace. Nenhum dado foi alterado.');
  }
}

console.log(JSON.stringify({
  mode: shouldApply ? 'APPLY' : 'DRY RUN',
  user: { id: user.user.id, email: user.user.email },
  workspace,
  totals: {
    projects: seed.projects.length,
    tasks: seed.tasks.length,
    anomalies: seed.anomalies.length,
  },
}, null, 2));

if (!shouldApply) {
  console.log('Simulação concluída. Para gravar, repita com SEED_APPLY=1.');
  process.exit(0);
}

const payload = data || mapSeedData(seed, workspace.id);
requireData(await supabase.from('projects').insert(payload.projects), 'Importação de projetos');
requireData(await supabase.from('tasks').insert(payload.tasks), 'Importação de tarefas');
requireData(await supabase.from('anomalies').insert(payload.anomalies), 'Importação de anomalias');

console.log('Seed importado sem apagar dados existentes.');
