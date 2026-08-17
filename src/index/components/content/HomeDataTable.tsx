import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Download, Edit3, Loader2, RefreshCw, Save, Trash2, Upload, X } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { decodeCsvBytes } from '@/data/utils/csvEncoding';
import { useAppDialog } from '../dialogs/AppDialogProvider';
import { requireProjectScope, withProjectScope } from '../../services/projectScope';
import { cn } from '@/lib/utils';

interface DataRecord {
    id: string | number;
    [key: string]: any;
}

interface HomeDataTableProps {
    projectId: string;
    fileName: string;
    tableName: string;
}

const PAGE_SIZE_OPTIONS = [20, 50, 100];

function toEditableValue(value: any): string {
    if (value === null || value === undefined) return '';
    if (typeof value === 'object') {
        try {
            return JSON.stringify(value);
        } catch {
            return String(value);
        }
    }
    return String(value);
}

function coerceEditedValue(raw: string, sample: any): any {
    const trimmed = raw.trim();
    if (trimmed === '') {
        return '';
    }

    if (typeof sample === 'number') {
        const parsed = Number(trimmed);
        return Number.isNaN(parsed) ? sample : parsed;
    }

    if (typeof sample === 'boolean') {
        if (trimmed === 'true') return true;
        if (trimmed === 'false') return false;
        return sample;
    }

    if (sample && typeof sample === 'object') {
        try {
            return JSON.parse(raw);
        } catch {
            return sample;
        }
    }

    return raw;
}

function renderCellValue(value: any): string {
    if (value === null || value === undefined || value === '') {
        return '-';
    }
    if (typeof value === 'object') {
        try {
            return JSON.stringify(value);
        } catch {
            return String(value);
        }
    }
    return String(value);
}

export default function HomeDataTable({ projectId, fileName, tableName }: HomeDataTableProps) {
    const appDialog = useAppDialog();
    const [loading, setLoading] = useState(false);
    const [records, setRecords] = useState<DataRecord[]>([]);
    const [editingId, setEditingId] = useState<string | number | null>(null);
    const [editingValues, setEditingValues] = useState<Record<string, string>>({});
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(20);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const buildDataUrl = useCallback(
        (url: string) => withProjectScope(url, requireProjectScope(projectId)),
        [projectId],
    );

    const loadData = useCallback(async () => {
        setLoading(true);
        try {
            const response = await fetch(buildDataUrl(`/api/data/${encodeURIComponent(fileName)}`));
            if (!response.ok) {
                throw new Error('加载数据失败');
            }
            const result = await response.json();
            setRecords(Array.isArray(result) ? result : []);
        } catch (error: any) {
            toast.error(error?.message || '加载数据失败');
            setRecords([]);
        } finally {
            setLoading(false);
        }
    }, [buildDataUrl, fileName]);

    useEffect(() => {
        void loadData();
    }, [loadData]);

    const columns = useMemo(() => {
        if (records.length === 0) return [] as string[];

        const orderedKeys = [...Object.keys(records[0])];
        const seenKeys = new Set(orderedKeys);

        records.slice(1).forEach((record) => {
            Object.keys(record).forEach((key) => {
                if (!seenKeys.has(key)) {
                    seenKeys.add(key);
                    orderedKeys.push(key);
                }
            });
        });

        return orderedKeys;
    }, [records]);

    const totalPages = Math.max(1, Math.ceil(records.length / pageSize));

    useEffect(() => {
        if (page > totalPages) {
            setPage(totalPages);
        }
    }, [page, totalPages]);

    const pagedRecords = useMemo(() => {
        const start = (page - 1) * pageSize;
        return records.slice(start, start + pageSize);
    }, [records, page, pageSize]);

    const handleEdit = (record: DataRecord) => {
        const nextValues: Record<string, string> = {};
        Object.keys(record).forEach((key) => {
            nextValues[key] = toEditableValue(record[key]);
        });
        setEditingId(record.id);
        setEditingValues(nextValues);
    };

    const handleCancelEdit = () => {
        setEditingId(null);
        setEditingValues({});
    };

    const handleSave = async () => {
        if (editingId === null) return;
        const current = records.find((item) => String(item.id) === String(editingId));
        if (!current) {
            handleCancelEdit();
            return;
        }

        const payload: Record<string, any> = {};
        Object.keys(editingValues).forEach((key) => {
            if (key === 'id') return;
            payload[key] = coerceEditedValue(editingValues[key], current[key]);
        });

        const toastId = toast.loading('正在保存...');
        try {
            const response = await fetch(
                buildDataUrl(`/api/data/${encodeURIComponent(fileName)}/${encodeURIComponent(String(editingId))}`),
                {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload),
                },
            );
            if (!response.ok) {
                const data = await response.json().catch(() => ({}));
                throw new Error(data?.error || '保存失败');
            }
            toast.success('保存成功', { id: toastId });
            handleCancelEdit();
            await loadData();
        } catch (error: any) {
            toast.error(error?.message || '保存失败', { id: toastId });
        }
    };

    const handleDelete = async (id: string | number) => {
        const confirmed = await appDialog.confirm({
            title: `删除「${tableName}」中的这条记录？`,
            description: '删除后无法恢复，请确认是否继续。',
            confirmText: '确认删除',
            cancelText: '取消',
            tone: 'destructive',
            dismissible: false,
        });
        if (!confirmed) return;

        const toastId = toast.loading('正在删除...');
        try {
            const response = await fetch(
                buildDataUrl(`/api/data/${encodeURIComponent(fileName)}/${encodeURIComponent(String(id))}`),
                { method: 'DELETE' },
            );
            if (!response.ok) {
                const data = await response.json().catch(() => ({}));
                throw new Error(data?.error || '删除失败');
            }
            toast.success('删除成功', { id: toastId });
            if (editingId !== null && String(editingId) === String(id)) {
                handleCancelEdit();
            }
            await loadData();
        } catch (error: any) {
            toast.error(error?.message || '删除失败', { id: toastId });
        }
    };

    const handleExportCsv = async () => {
        const toastId = toast.loading('正在导出...');
        try {
            const response = await fetch(buildDataUrl(`/api/data/${encodeURIComponent(fileName)}/export`));
            if (!response.ok) {
                const data = await response.json().catch(() => ({}));
                throw new Error(data?.error || '导出失败');
            }
            const blob = await response.blob();
            const downloadUrl = URL.createObjectURL(blob);
            const anchor = document.createElement('a');
            anchor.href = downloadUrl;
            anchor.download = `${fileName}.csv`;
            anchor.click();
            URL.revokeObjectURL(downloadUrl);
            toast.success('导出成功', { id: toastId });
        } catch (error: any) {
            toast.error(error?.message || '导出失败', { id: toastId });
        }
    };

    const handleImportCsvFile = async (file: File) => {
        const toastId = toast.loading('正在导入...');
        try {
            const buffer = await file.arrayBuffer();
            const csvData = decodeCsvBytes(new Uint8Array(buffer)).text;
            const response = await fetch(buildDataUrl(`/api/data/${encodeURIComponent(fileName)}/import`), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ csvData }),
            });
            if (!response.ok) {
                const data = await response.json().catch(() => ({}));
                throw new Error(data?.error || '导入失败');
            }
            toast.success('导入成功', { id: toastId });
            await loadData();
        } catch (error: any) {
            toast.error(error?.message || '导入失败', { id: toastId });
        }
    };

    const onImportButtonClick = () => {
        fileInputRef.current?.click();
    };

    const onImportInputChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;
        await handleImportCsvFile(file);
        event.target.value = '';
    };

    return (
        <div className="flex h-full min-h-0 flex-col gap-3">
            <div className="flex items-center justify-between gap-3">
                <h3 className="m-0 text-sm font-semibold">数据表: {tableName}</h3>
                <div className="flex items-center gap-2">
                    <input
                        ref={fileInputRef}
                        type="file"
                        accept=".csv,text/csv"
                        className="hidden"
                        onChange={(event) => {
                            void onImportInputChange(event);
                        }}
                    />
                    <Button size="xs" variant="outline" onClick={onImportButtonClick} disabled={loading || editingId !== null}>
                        <Upload className="h-3.5 w-3.5" />
                        导入 CSV
                    </Button>
                    <Button size="xs" variant="outline" onClick={() => void handleExportCsv()} disabled={loading}>
                        <Download className="h-3.5 w-3.5" />
                        导出 CSV
                    </Button>
                    <Button size="xs" variant="outline" onClick={() => void loadData()} disabled={loading}>
                        <RefreshCw className={cn('h-3.5 w-3.5', loading && 'animate-spin')} />
                        刷新
                    </Button>
                </div>
            </div>

            <div className="min-h-0 flex-1 rounded-md border bg-card">
                {loading ? (
                    <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        加载中...
                    </div>
                ) : records.length === 0 ? (
                    <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
                        暂无数据，请导入 CSV
                    </div>
                ) : (
                    <div className="h-full w-full overflow-auto">
                        <table className="w-max min-w-full caption-bottom text-xs">
                            <TableHeader>
                                <TableRow>
                                    {columns.map((column) => (
                                        <TableHead key={column} className="h-9 whitespace-nowrap px-2 py-1">
                                            {column}
                                        </TableHead>
                                    ))}
                                    <TableHead className="sticky right-0 z-30 h-9 whitespace-nowrap border-l bg-card px-2 py-1 text-right">
                                        操作
                                    </TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {pagedRecords.map((record) => {
                                    const isEditing = editingId !== null && String(editingId) === String(record.id);
                                    return (
                                        <TableRow key={String(record.id)} className="group">
                                            {columns.map((column) => {
                                                const isIdColumn = column === 'id';
                                                if (!isEditing || isIdColumn) {
                                                    return (
                                                        <TableCell key={column} className="px-2 py-1 whitespace-nowrap">
                                                            <span
                                                                className={cn(
                                                                    'block leading-5',
                                                                    renderCellValue(record[column]) === '-' && 'text-muted-foreground',
                                                                )}
                                                                title={renderCellValue(record[column])}
                                                            >
                                                                {renderCellValue(record[column])}
                                                            </span>
                                                        </TableCell>
                                                    );
                                                }

                                                return (
                                                    <TableCell key={column} className="px-2 py-1">
                                                        <Input
                                                            value={editingValues[column] ?? ''}
                                                            className="h-7 text-xs"
                                                            onChange={(event) => {
                                                                const value = event.target.value;
                                                                setEditingValues((previous) => ({
                                                                    ...previous,
                                                                    [column]: value,
                                                                }));
                                                            }}
                                                        />
                                                    </TableCell>
                                                );
                                            })}
                                            <TableCell className="sticky right-0 z-20 border-l bg-card px-2 py-1 text-right group-hover:bg-muted/50">
                                                <div className="flex items-center justify-end gap-1">
                                                    {isEditing ? (
                                                        <>
                                                            <Button
                                                                size="icon-xs"
                                                                variant="ghost"
                                                                onClick={() => void handleSave()}
                                                                aria-label="保存"
                                                            >
                                                                <Save className="h-3.5 w-3.5" />
                                                            </Button>
                                                            <Button
                                                                size="icon-xs"
                                                                variant="ghost"
                                                                onClick={handleCancelEdit}
                                                                aria-label="取消"
                                                            >
                                                                <X className="h-3.5 w-3.5" />
                                                            </Button>
                                                        </>
                                                    ) : (
                                                        <>
                                                            <Button
                                                                size="icon-xs"
                                                                variant="ghost"
                                                                onClick={() => handleEdit(record)}
                                                                disabled={editingId !== null}
                                                                aria-label="编辑"
                                                            >
                                                                <Edit3 className="h-3.5 w-3.5" />
                                                            </Button>
                                                            <Button
                                                                size="icon-xs"
                                                                variant="ghost"
                                                                onClick={() => void handleDelete(record.id)}
                                                                disabled={editingId !== null}
                                                                aria-label="删除"
                                                            >
                                                                <Trash2 className="h-3.5 w-3.5 text-destructive" />
                                                            </Button>
                                                        </>
                                                    )}
                                                </div>
                                            </TableCell>
                                        </TableRow>
                                    );
                                })}
                            </TableBody>
                        </table>
                    </div>
                )}
            </div>

            <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
                <div>
                    共 {records.length} 条记录
                </div>
                <div className="flex items-center gap-2">
                    <span>每页</span>
                    <select
                        className="h-7 rounded-md border bg-background px-2 text-xs"
                        value={String(pageSize)}
                        onChange={(event) => {
                            const nextPageSize = Number(event.target.value);
                            setPageSize(nextPageSize);
                            setPage(1);
                        }}
                    >
                        {PAGE_SIZE_OPTIONS.map((size) => (
                            <option key={size} value={size}>
                                {size}
                            </option>
                        ))}
                    </select>
                    <Button
                        size="xs"
                        variant="outline"
                        disabled={page <= 1}
                        onClick={() => setPage((previous) => Math.max(1, previous - 1))}
                    >
                        上一页
                    </Button>
                    <span>
                        {page} / {totalPages}
                    </span>
                    <Button
                        size="xs"
                        variant="outline"
                        disabled={page >= totalPages}
                        onClick={() => setPage((previous) => Math.min(totalPages, previous + 1))}
                    >
                        下一页
                    </Button>
                </div>
            </div>
        </div>
    );
}
