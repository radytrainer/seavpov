import { z } from 'zod';

export const pageMetaSchema = z.object({
  page: z.number(),
  pageSize: z.number(),
  total: z.number(),
});

export function pageArgs(query: { page: number; pageSize: number }) {
  return { skip: (query.page - 1) * query.pageSize, take: query.pageSize };
}

export function listResponse<T extends z.ZodType>(item: T) {
  return z.object({ data: z.array(item), meta: pageMetaSchema });
}
