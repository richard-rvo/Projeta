import React, { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';

const EMPTY_PROJECT = {
  name: '',
  description: '',
  startDate: '',
  endDate: '',
  status: 'Planejado',
};

const STATUS_OPTIONS = ['Planejado', 'Em Andamento', 'Concluído', 'Pausado'];

function editableFields(project) {
  return {
    name: project?.name || '',
    description: project?.description || '',
    startDate: project?.startDate || '',
    endDate: project?.endDate || '',
    status: project?.status || 'Planejado',
  };
}

export default function ProjectDialog({ open, onOpenChange, project, onSave }) {
  const [form, setForm] = useState(EMPTY_PROJECT);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const editing = Boolean(project);

  useEffect(() => {
    if (!open) return;
    setForm(project ? editableFields(project) : EMPTY_PROJECT);
    setError('');
    setSaving(false);
  }, [open, project]);

  const set = (field) => (event) => {
    setError('');
    setForm((current) => ({ ...current, [field]: event.target.value }));
  };

  const submit = async () => {
    const name = form.name.trim();
    if (!name) {
      setError('Informe o nome do projeto.');
      return;
    }
    if (form.startDate && form.endDate && form.startDate > form.endDate) {
      setError('O término deve ser igual ou posterior ao início.');
      return;
    }

    setSaving(true);
    try {
      await onSave({
        ...form,
        name,
        description: form.description.trim(),
      });
      onOpenChange(false);
    } catch (saveError) {
      setError(saveError?.message || 'Não foi possível salvar o projeto.');
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !saving && onOpenChange(next)}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{editing ? 'Editar projeto' : 'Novo projeto'}</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-3">
          <Field label="Nome do projeto" required>
            <Input
              autoFocus
              maxLength={200}
              value={form.name}
              onChange={set('name')}
              onKeyDown={(event) => event.key === 'Enter' && submit()}
              placeholder="Ex: Revamp da Absorvedora de NH3"
            />
          </Field>

          <Field label="Descrição">
            <Textarea
              rows={3}
              maxLength={5000}
              value={form.description}
              onChange={set('description')}
              placeholder="Escopo e objetivo principal do projeto"
            />
          </Field>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Início">
              <Input type="date" value={form.startDate} onChange={set('startDate')} />
            </Field>
            <Field label="Término">
              <Input type="date" value={form.endDate} onChange={set('endDate')} />
            </Field>
          </div>

          <Field label="Status">
            <Select
              value={form.status}
              onValueChange={(status) => {
                setError('');
                setForm((current) => ({ ...current, status }));
              }}
            >
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent position="popper">
                <SelectGroup>
                  {STATUS_OPTIONS.map((status) => (
                    <SelectItem key={status} value={status}>{status}</SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </Field>

          {error && (
            <p role="alert" className="text-small font-medium text-sched-late">
              {error}
            </p>
          )}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancelar
          </Button>
          <Button type="button" onClick={submit} disabled={saving}>
            {saving ? 'Salvando…' : editing ? 'Salvar alterações' : 'Criar projeto'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, required, children }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-micro font-medium uppercase tracking-wide text-text-3">
        {label}
        {required && <span className="ml-0.5 text-sched-late">*</span>}
      </span>
      {children}
    </label>
  );
}
