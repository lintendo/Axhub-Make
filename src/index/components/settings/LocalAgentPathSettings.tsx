import React from 'react';
import { Plus, Trash2 } from 'lucide-react';

import { Button } from '../../../components/ui/button';
import { Field, FieldDescription, FieldLabelWithHint } from '../../../components/ui/field';
import { Input } from '../../../components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../../../components/ui/select';
import type { LocalAgentPathEntry, LocalAgentPathOption } from './localAgentSettings';

export interface LocalAgentPathSettingsProps {
  group: 'desktop' | 'cli';
  options: readonly LocalAgentPathOption[];
  value: readonly LocalAgentPathEntry[];
  onChange: (value: LocalAgentPathEntry[]) => void;
}

function updateEntry(
  entries: readonly LocalAgentPathEntry[],
  index: number,
  patch: Partial<LocalAgentPathEntry>,
): LocalAgentPathEntry[] {
  return entries.map((entry, entryIndex) => entryIndex === index ? { ...entry, ...patch } : { ...entry });
}

export function LocalAgentPathSettings({ group, options, value, onChange }: LocalAgentPathSettingsProps) {
  const displayEntries = value.length ? value : [{ agent: '', path: '' }];
  const selectedAgents = new Set(value.map((entry) => entry.agent).filter(Boolean));
  const canAdd = !value.some((entry) => !entry.agent)
    && options.some((option) => !selectedAgents.has(option.agent));

  return (
    <Field data-local-agent-path-settings={group} className="gap-3">
      <div className="space-y-1">
        <FieldLabelWithHint hint="每一项只保存一个应用和它的本地启动路径；Windows 找不到应用时可手动填写。">
          指定应用路径
        </FieldLabelWithHint>
        <FieldDescription>
          {group === 'desktop'
            ? '用于从 Make 打开桌面 Agent。'
            : '用于从 Make 打开 CLI Agent；保存的路径也会用于版本检测。'}
        </FieldDescription>
      </div>

      <div className="space-y-2">
        {displayEntries.map((entry, index) => {
          const rowOptions = options.filter((option) => option.agent === entry.agent || !selectedAgents.has(option.agent));
          return (
            <div key={`${group}-${index}`} className="grid grid-cols-[minmax(130px,0.8fr)_minmax(0,1.8fr)_auto] items-center gap-2">
              <Select
                value={entry.agent || undefined}
                onValueChange={(agent) => onChange(updateEntry(value.length ? value : displayEntries, index, { agent, path: '' }))}
              >
                <SelectTrigger aria-label={`${group === 'desktop' ? '本地桌面' : '本地 CLI'} Agent 应用`}>
                  <SelectValue placeholder="选择应用" />
                </SelectTrigger>
                <SelectContent>
                  {rowOptions.map((option) => (
                    <SelectItem key={option.agent} value={option.agent}>{option.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Input
                value={entry.path}
                onChange={(event) => onChange(updateEntry(value.length ? value : displayEntries, index, { path: event.target.value }))}
                placeholder={group === 'desktop' ? '例如 C:\\Program Files\\Cursor\\Cursor.exe' : '例如 C:\\Users\\...\\codex.cmd 或 /usr/local/bin/codex'}
                aria-label={`${group === 'desktop' ? '本地桌面' : '本地 CLI'} Agent 启动路径`}
              />
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                className="text-muted-foreground hover:text-destructive"
                onClick={() => onChange((value.length ? value : displayEntries).filter((_, entryIndex) => entryIndex !== index))}
                aria-label="删除应用路径配置"
                title="删除应用路径配置"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          );
        })}
      </div>

      <Button
        type="button"
        variant="link"
        size="sm"
        className="h-auto w-fit gap-1.5 px-0 py-0 text-xs"
        onClick={() => onChange([...value, { agent: '', path: '' }])}
        disabled={!canAdd}
      >
        <Plus className="h-3.5 w-3.5" />
        新增一项
      </Button>
    </Field>
  );
}
