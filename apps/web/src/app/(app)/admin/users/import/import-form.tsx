'use client';

import { useState } from 'react';
import { CheckCircle2, Download, FileUp } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/lib/api/client';
import { errorMessage } from '@/lib/api/errors';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

interface ImportResult {
  dryRun: boolean;
  totalRows: number;
  valid: number;
  errors: { row: number; field: string; message: string }[];
  created: { studentCode: string; username: string; fullName: string; temporaryPassword: string }[];
}

const TEMPLATE =
  'student_id,full_name,username,email,gender,generation,class\r\nS2026-101,Sok Dara,sokdara,dara@example.edu,MALE,Generation 2026,Class A\r\n';

function download(name: string, content: string) {
  const url = URL.createObjectURL(
    new Blob([`\uFEFF${content}`], { type: 'text/csv;charset=utf-8' }),
  );
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

const cell = (v: string) => (/[",\r\n]/.test(v) ? `"${v.replaceAll('"', '""')}"` : v);

export function ImportForm() {
  const [csv, setCsv] = useState('');
  const [fileName, setFileName] = useState<string | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [pending, setPending] = useState<'check' | 'import' | null>(null);

  async function run(dryRun: boolean) {
    setPending(dryRun ? 'check' : 'import');
    try {
      const res = await api.post<{ data: ImportResult }>('/admin/users/import', { csv, dryRun });
      setResult(res.data);
      if (!dryRun && res.data.created.length > 0)
        toast.success(`${res.data.created.length} students created`);
    } catch (err) {
      setResult(null);
      toast.error(errorMessage(err));
    } finally {
      setPending(null);
    }
  }

  async function onFile(file: File | undefined) {
    if (!file) return;
    if (file.size > 1_000_000) {
      toast.error('The file is larger than 1 MB.');
      return;
    }
    setCsv(await file.text());
    setFileName(file.name);
    setResult(null);
  }

  const created = result && !result.dryRun ? result.created : [];

  return (
    <div className="grid gap-5">
      <Card>
        <CardHeader>
          <CardTitle>1. Choose a file</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 text-sm">
          <p className="text-muted-foreground">
            Required columns: <code>student_id</code>, <code>full_name</code>, <code>username</code>
            . Optional: <code>email</code>, <code>gender</code> (MALE, FEMALE, OTHER, UNDISCLOSED),{' '}
            <code>generation</code>, <code>class</code> (must already exist). Save the spreadsheet
            as “CSV UTF-8” to keep Khmer names.
          </p>
          <div className="flex flex-wrap gap-2">
            <label className="inline-flex h-10 cursor-pointer items-center gap-2 rounded-md border border-input bg-card px-4 text-sm font-medium shadow-xs hover:bg-muted has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring">
              <FileUp className="size-4" aria-hidden />
              {fileName ?? 'Select CSV file'}
              <input
                type="file"
                accept=".csv,text/csv"
                className="sr-only"
                onChange={(e) => onFile(e.target.files?.[0])}
              />
            </label>
            <Button variant="ghost" onClick={() => download('students-template.csv', TEMPLATE)}>
              <Download aria-hidden /> Template
            </Button>
          </div>
          <Button
            className="justify-self-start"
            disabled={!csv || pending !== null}
            loading={pending === 'check'}
            onClick={() => run(true)}
          >
            Check file
          </Button>
        </CardContent>
      </Card>

      {result && (
        <Card>
          <CardHeader>
            <CardTitle>2. {result.dryRun ? 'Check result' : 'Import result'}</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 text-sm">
            <p>
              {result.totalRows} rows · {result.valid} valid · {result.errors.length} problems
            </p>
            {result.errors.length > 0 ? (
              <>
                <p role="alert" className="text-destructive">
                  Fix these rows in your spreadsheet and check the file again. Nothing was created.
                </p>
                <div className="max-h-80 overflow-auto rounded-md border">
                  <table className="w-full text-left">
                    <thead className="sticky top-0 bg-muted text-xs">
                      <tr>
                        <th scope="col" className="px-2 py-1.5">
                          Row
                        </th>
                        <th scope="col" className="px-2 py-1.5">
                          Column
                        </th>
                        <th scope="col" className="px-2 py-1.5">
                          Problem
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {result.errors.map((e, i) => (
                        <tr key={i} className="border-t">
                          <td className="px-2 py-1.5 tabular-nums">{e.row}</td>
                          <td className="px-2 py-1.5 font-mono text-xs">{e.field}</td>
                          <td className="px-2 py-1.5">{e.message}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            ) : result.dryRun ? (
              <Button
                className="justify-self-start"
                loading={pending === 'import'}
                onClick={() => run(false)}
              >
                Create {result.valid} students
              </Button>
            ) : (
              <div className="grid gap-3">
                <p className="flex items-center gap-2 text-success">
                  <CheckCircle2 className="size-4" aria-hidden /> {created.length} students created.
                </p>
                <p className="text-muted-foreground">
                  Download the temporary passwords now — they are not shown again. Share them
                  privately; students must change them at first sign-in. Delete the file after
                  distributing.
                </p>
                <Button
                  className="justify-self-start"
                  onClick={() =>
                    download(
                      'student-credentials.csv',
                      [
                        'student_id,full_name,username,temporary_password',
                        ...created.map((c) =>
                          [c.studentCode, c.fullName, c.username, c.temporaryPassword]
                            .map(cell)
                            .join(','),
                        ),
                      ].join('\r\n'),
                    )
                  }
                >
                  <Download aria-hidden /> Download credentials
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
