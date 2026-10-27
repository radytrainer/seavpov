import type { FilterOptions } from '@/lib/trainer';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';

/** GET form for class / generation / date-range filters (works without JavaScript). */
export function StudentFilters({
  options,
  values,
  showSearch = false,
  showInactive = false,
  extra,
}: {
  options: FilterOptions;
  values: Record<string, string | undefined>;
  showSearch?: boolean;
  showInactive?: boolean;
  extra?: React.ReactNode;
}) {
  return (
    <form method="get" className="mb-4 grid grid-cols-2 gap-2 md:flex md:flex-wrap md:items-end">
      {showSearch && (
        <label className="col-span-2 grid gap-1 text-xs text-muted-foreground md:min-w-56 md:flex-1">
          Search
          <Input name="search" defaultValue={values.search} placeholder="Name or student ID" />
        </label>
      )}
      <label className="grid gap-1 text-xs text-muted-foreground">
        Class
        <Select name="classId" defaultValue={values.classId ?? ''}>
          <option value="">All classes</option>
          {options.classes.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name} · {c.generation.name}
            </option>
          ))}
        </Select>
      </label>
      <label className="grid gap-1 text-xs text-muted-foreground">
        Generation
        <Select name="generationId" defaultValue={values.generationId ?? ''}>
          <option value="">All generations</option>
          {options.generations.map((g) => (
            <option key={g.id} value={g.id}>
              {g.name}
            </option>
          ))}
        </Select>
      </label>
      <label className="grid gap-1 text-xs text-muted-foreground">
        From
        <Input type="date" name="from" defaultValue={values.from} />
      </label>
      <label className="grid gap-1 text-xs text-muted-foreground">
        To
        <Input type="date" name="to" defaultValue={values.to} />
      </label>
      {showInactive && (
        <label className="col-span-2 flex h-10 items-center gap-2 text-sm md:col-span-1">
          <input
            type="checkbox"
            name="inactiveOnly"
            value="true"
            defaultChecked={values.inactiveOnly === 'true'}
            className="size-4 accent-[var(--primary)]"
          />
          Only students who may need encouragement
        </label>
      )}
      {extra}
      <Button type="submit" variant="secondary" className="col-span-2 md:col-span-1">
        Apply
      </Button>
    </form>
  );
}
