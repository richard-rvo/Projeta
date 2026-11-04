import { describe, it, expect } from 'vitest';
import { buildNewTask } from './taskFactory';

const project = { id: 'p1' };

describe('buildNewTask', () => {
  it('nasce no próximo início de jornada e dura 5 dias úteis', () => {
    const t = buildNewTask(project, { name: 'A', order: 0, startDay: '2026-11-06' });
    expect(t.startDate).toBe('2026-11-06T08:00');
    expect(t.endDate).toBe('2026-11-12T17:00');
  });

  it('com workingDays 1 termina no mesmo dia', () => {
    const t = buildNewTask(project, { name: 'A', order: 0, startDay: '2026-11-04', workingDays: 1 });
    expect(t.endDate).toBe('2026-11-04T17:00');
  });

  it('usa o nome e a ordem', () => {
    const t = buildNewTask(project, { name: 'Revisar', order: 3, startDay: '2026-11-04' });
    expect(t.name).toBe('Revisar');
    expect(t.order).toBe(3);
    expect(typeof t.id).toBe('string');
    expect(t.id.length).toBeGreaterThan(0);
  });
});
