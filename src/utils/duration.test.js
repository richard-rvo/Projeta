import { describe, it, expect } from 'vitest';
import { formatDuration, parseDuration, resolveDuration } from './duration';
import { CALENDAR_PRESETS, DEFAULT_CALENDAR } from './calendar';

const PADRAO = DEFAULT_CALENDAR;                                   // 480 min/dia
const H24 = CALENDAR_PRESETS.find((c) => c.id === '24h');          // 1440
const TURNO = { ...PADRAO, shifts: [{ from: '07:00', to: '13:00' }] }; // 360

describe('formatDuration', () => {
  it('mostra dias a partir de um dia cheio', () => {
    expect(formatDuration(480, PADRAO)).toBe('1d');
    expect(formatDuration(3 * 480, PADRAO)).toBe('3d');
  });

  it('abaixo de um dia mostra horas — "0,13d" não diz nada a ninguém', () => {
    expect(formatDuration(240, PADRAO)).toBe('4h');
    expect(formatDuration(60, PADRAO)).toBe('1h');
    expect(formatDuration(30, PADRAO)).toBe('30m');
  });

  it('marco tem duração zero', () => {
    expect(formatDuration(0, PADRAO)).toBe('0d');
  });

  it('o mesmo tempo de relógio vira números diferentes em calendários diferentes', () => {
    expect(formatDuration(1440, H24)).toBe('1d');
    expect(formatDuration(1440, PADRAO)).toBe('3d');
    expect(formatDuration(1440, TURNO)).toBe('4d');
  });

  it('usa vírgula decimal', () => {
    expect(formatDuration(720, PADRAO)).toBe('1,5d');
  });

  it('respeita a unidade de exibição do projeto sem alterar os minutos', () => {
    expect(formatDuration(240, PADRAO, { unit: 'hours' })).toBe('4h');
    expect(formatDuration(240, PADRAO, { unit: 'days' })).toBe('0,5d');
    expect(formatDuration(480, PADRAO, { unit: 'hours' })).toBe('8h');
  });
});

describe('parseDuration', () => {
  it('número solto é dia', () => {
    expect(parseDuration('3', PADRAO)).toBe(3 * 480);
  });

  it('número solto vira hora quando o projeto está fixo em horas', () => {
    expect(parseDuration('48', PADRAO, { defaultUnit: 'hours' })).toBe(48 * 60);
    expect(parseDuration('48', H24, { unit: 'hours' })).toBe(48 * 60);
  });

  it('entende a notação do MS Project', () => {
    expect(parseDuration('3d', PADRAO)).toBe(1440);
    expect(parseDuration('4h', PADRAO)).toBe(240);
    expect(parseDuration('90m', PADRAO)).toBe(90);
  });

  it('aceita vírgula, maiúscula e espaço', () => {
    expect(parseDuration('1,5 D', PADRAO)).toBe(720);
    expect(parseDuration(' 2H ', PADRAO)).toBe(120);
  });

  it('dia depende do calendário; hora e minuto, não', () => {
    expect(parseDuration('1d', H24)).toBe(1440);
    expect(parseDuration('1d', PADRAO)).toBe(480);
    expect(parseDuration('4h', H24)).toBe(240);
    expect(parseDuration('4h', PADRAO)).toBe(240);
  });

  it('devolve null no lixo, para o chamador manter o valor anterior', () => {
    expect(parseDuration('', PADRAO)).toBeNull();
    expect(parseDuration('abc', PADRAO)).toBeNull();
    expect(parseDuration('-2d', PADRAO)).toBeNull();
    expect(parseDuration(null, PADRAO)).toBeNull();
  });

});

describe('resolveDuration', () => {
  /* Era o bug original: o editor abria em dias CORRIDOS e gravava dias
     ÚTEIS, então abrir a duração de uma tarefa seg–sex e apertar Enter
     sem digitar nada a empurrava para a semana seguinte. */
  it('reabrir e confirmar sem digitar não muda a duração', () => {
    for (const cal of [PADRAO, H24, TURNO]) {
      for (const minutes of [480, 1440, 240, 30, 720, 1, 4321]) {
        const shown = formatDuration(minutes, cal);
        expect(resolveDuration(shown, cal, minutes)).toBe(minutes);
      }
    }
  });

  it('texto que muda o rótulo conta como edição', () => {
    expect(resolveDuration('5d', PADRAO, 480)).toBe(5 * 480);
    expect(resolveDuration('4h', PADRAO, 480)).toBe(240);
  });

  it('preserva a duração ao confirmar uma hora exibida sem sufixo adicional', () => {
    expect(resolveDuration('48', PADRAO, 48 * 60, { unit: 'hours', defaultUnit: 'hours' }))
      .toBe(48 * 60);
  });

  it('lixo não grava nada', () => {
    expect(resolveDuration('abc', PADRAO, 480)).toBeNull();
  });
});
