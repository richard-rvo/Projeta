import React, { useState, useRef } from 'react';
import { cn } from '@/lib/utils';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { Camera, X, ChevronLeft, ChevronRight, Check } from 'lucide-react';
import {
  SEVERITY_OPTIONS, SEVERITY_DOT, STATUS_OPTIONS, TYPE_OPTIONS,
  DISCIPLINES, FORM_STEPS, MAX_PHOTOS, compressImage,
} from './anomalyConfig';

/* ═══════════════════════════════════════════════════════════════
   Formulário de anomalia em 4 passos.

   Passos existem porque o registro nasce em CAMPO, no celular: uma
   tela única com quinze campos é impraticável de mão enluvada. Cada
   passo cabe numa tela.

   Era código duplicado entre a central global e a tela do projeto.
   ═══════════════════════════════════════════════════════════════ */

export default function AnomalyForm({
  open, onOpenChange, initial, tasks = [], onSave, onError,
}) {
  const [step, setStep] = useState(0);
  const [form, setForm] = useState(initial);
  const photoRef = useRef(null);

  /* Reinicia ao (re)abrir, para não herdar o rascunho anterior. */
  React.useEffect(() => {
    if (open) { setForm(initial); setStep(0); }
  }, [open, initial]);

  const set = (patch) => setForm((prev) => ({ ...prev, ...patch }));

  const addPhotos = async (e) => {
    const files = Array.from(e.target.files || []);
    if (form.photos.length + files.length > MAX_PHOTOS) {
      onError?.(`Máximo de ${MAX_PHOTOS} fotos por anomalia`);
      return;
    }
    const compressed = await Promise.all(files.map((f) => compressImage(f)));
    const validPhotos = compressed.filter(Boolean);
    if (validPhotos.length !== files.length) {
      onError?.('Não foi possível processar uma ou mais imagens. Use JPG, PNG ou WebP.');
    }
    if (validPhotos.length > 0) {
      setForm((current) => ({ ...current, photos: [...current.photos, ...validPhotos] }));
    }
    e.target.value = '';
  };

  const canAdvance = step !== 0 || (form.title.trim() && form.reportedBy.trim());

  const submit = () => {
    if (!form.title.trim()) { onError?.('Título é obrigatório'); setStep(0); return; }
    if (!form.reportedBy.trim()) { onError?.('Responsável pelo registro é obrigatório'); setStep(0); return; }
    onSave(form);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{initial?.id ? 'Editar anomalia' : 'Registrar anomalia'}</DialogTitle>
        </DialogHeader>

        {/* Trilha de passos */}
        <ol className="flex items-center gap-1">
          {FORM_STEPS.map((label, i) => (
            <li key={label} className="flex flex-1 items-center gap-1">
              <button
                type="button"
                onClick={() => i < step && setStep(i)}
                disabled={i > step}
                className={cn(
                  'flex h-6 flex-1 items-center justify-center rounded-[5px] text-micro font-medium transition-colors',
                  i === step ? 'bg-brand text-white'
                    : i < step ? 'bg-brand-soft text-brand'
                      : 'bg-surface-3 text-text-3'
                )}
              >
                {i < step ? <Check size={11} /> : null}
                <span className="ml-1">{label}</span>
              </button>
            </li>
          ))}
        </ol>

        <div className="flex min-h-64 flex-col gap-3">
          {step === 0 && (
            <>
              <Field label="Título" required>
                <Input autoFocus value={form.title}
                  onChange={(e) => set({ title: e.target.value })}
                  placeholder="Ex: Trinca em viga de sustentação" />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Severidade">
                  <ToggleGroup
                    type="single"
                    value={form.severity}
                    onValueChange={(severity) => severity && set({ severity })}
                    size="sm"
                    className="w-full"
                    aria-label="Severidade"
                  >
                    {SEVERITY_OPTIONS.map((s) => (
                      <ToggleGroupItem key={s} value={s} className="flex-1">
                        <span className={cn('size-2 rounded-full', SEVERITY_DOT[s])} />
                        {s}
                      </ToggleGroupItem>
                    ))}
                  </ToggleGroup>
                </Field>
                <Field label="Tipo">
                  <AnomalySelect value={form.type} onValueChange={(type) => set({ type })}>
                    {TYPE_OPTIONS.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                  </AnomalySelect>
                </Field>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Registrado por" required>
                  <Input value={form.reportedBy}
                    onChange={(e) => set({ reportedBy: e.target.value })} placeholder="Nome" />
                </Field>
                <Field label="Tarefa vinculada">
                  <AnomalySelect
                    value={form.taskId || '__none__'}
                    onValueChange={(taskId) => set({ taskId: taskId === '__none__' ? '' : taskId })}
                  >
                    <SelectItem value="__none__">Nenhuma</SelectItem>
                    {tasks.map((t) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
                  </AnomalySelect>
                </Field>
              </div>
            </>
          )}

          {step === 1 && (
            <>
              <Field label="Descrição">
                <Textarea rows={3}
                  value={form.description} onChange={(e) => set({ description: e.target.value })}
                  placeholder="O que foi observado?" />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Ordem de serviço">
                  <Input value={form.osNumber} onChange={(e) => set({ osNumber: e.target.value })} />
                </Field>
                <Field label="Equipamento / ativo">
                  <Input value={form.equipment} onChange={(e) => set({ equipment: e.target.value })} />
                </Field>
                <Field label="Localização">
                  <Input value={form.location} onChange={(e) => set({ location: e.target.value })} />
                </Field>
                <Field label="Disciplina">
                  <AnomalySelect
                    value={form.discipline || '__none__'}
                    onValueChange={(discipline) => set({ discipline: discipline === '__none__' ? '' : discipline })}
                  >
                    <SelectItem value="__none__">Não informada</SelectItem>
                    {DISCIPLINES.map((d) => <SelectItem key={d} value={d}>{d}</SelectItem>)}
                  </AnomalySelect>
                </Field>
              </div>
              <Field label="Causa raiz">
                <Input value={form.rootCause} onChange={(e) => set({ rootCause: e.target.value })} />
              </Field>
              <Field label="Ação corretiva">
                <Input value={form.correctiveAction}
                  onChange={(e) => set({ correctiveAction: e.target.value })} />
              </Field>
              <Field label="Status">
                <AnomalySelect value={form.status} onValueChange={(status) => set({ status })}>
                  {STATUS_OPTIONS.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </AnomalySelect>
              </Field>
            </>
          )}

          {step === 2 && (
            <>
              <div className="grid grid-cols-3 gap-2">
                {form.photos.map((src, i) => (
                  <div key={i} className="group relative aspect-square overflow-hidden rounded-[8px] border border-line">
                    <img src={src} alt={`Foto ${i + 1}`} className="size-full object-cover" />
                    <button type="button"
                      onClick={() => set({ photos: form.photos.filter((_, j) => j !== i) })}
                      className="absolute right-1 top-1 grid size-6 place-items-center rounded-full bg-black/60 text-white opacity-0 transition-opacity group-hover:opacity-100">
                      <X size={12} />
                    </button>
                  </div>
                ))}
                {form.photos.length < MAX_PHOTOS && (
                  <button type="button" onClick={() => photoRef.current?.click()}
                    className="flex aspect-square flex-col items-center justify-center gap-1 rounded-[8px] border border-dashed border-line-strong text-text-3 transition-colors hover:border-brand hover:text-brand">
                    <Camera size={20} strokeWidth={1.6} />
                    <span className="text-micro">Adicionar</span>
                  </button>
                )}
              </div>
              <input ref={photoRef} type="file" accept="image/*" capture="environment"
                multiple onChange={addPhotos} className="hidden" />
              <p className="text-micro text-text-3">
                Até {MAX_PHOTOS} fotos, comprimidas para ~300 KB e guardadas só neste dispositivo.
              </p>
            </>
          )}

          {step === 3 && (
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-small">
              <Review label="Título" value={form.title} />
              <Review label="Severidade" value={form.severity} />
              <Review label="Tipo" value={form.type} />
              <Review label="Status" value={form.status} />
              <Review label="Registrado por" value={form.reportedBy} />
              {form.equipment && <Review label="Equipamento" value={form.equipment} />}
              {form.location && <Review label="Local" value={form.location} />}
              {form.osNumber && <Review label="OS" value={form.osNumber} />}
              {form.description && <Review label="Descrição" value={form.description} />}
              <Review label="Fotos" value={`${form.photos.length}`} />
            </dl>
          )}
        </div>

        <div className="flex items-center gap-2 border-t border-line pt-3">
          <Button type="button" onClick={() => setStep((s) => Math.max(0, s - 1))}
            disabled={step === 0} variant="outline">
            <ChevronLeft data-icon="inline-start" /> Voltar
          </Button>
          <span className="ml-auto text-micro text-text-3">
            Passo {step + 1} de {FORM_STEPS.length}
          </span>
          {step < FORM_STEPS.length - 1 ? (
            <Button type="button" onClick={() => setStep((s) => s + 1)} disabled={!canAdvance}>
              Avançar <ChevronRight data-icon="inline-end" />
            </Button>
          ) : (
            <Button type="button" onClick={submit}>
              <Check data-icon="inline-start" /> Salvar
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function AnomalySelect({ children, ...props }) {
  return (
    <Select {...props}>
      <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
      <SelectContent position="popper" align="start">
        <SelectGroup>{children}</SelectGroup>
      </SelectContent>
    </Select>
  );
}

function Field({ label, required, children }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-micro font-medium uppercase tracking-wide text-text-3">
        {label}{required && <span className="ml-0.5 text-sched-late">*</span>}
      </span>
      {children}
    </label>
  );
}

function Review({ label, value }) {
  return (
    <>
      <dt className="text-text-3">{label}</dt>
      <dd className="text-text-1">{value || '—'}</dd>
    </>
  );
}
