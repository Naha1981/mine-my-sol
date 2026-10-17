import { queryOptions } from "@tanstack/react-query";
import { db, type Row } from "@/lib/db";

export const myDocsQuery = queryOptions({
  queryKey: ["documents", "mine"],
  queryFn: async (): Promise<Row[]> => {
    const { data, error } = await db.from("documents").select("id,category,title,expires_at,current_version,verification");
    if (error) throw error;
    return data ?? [];
  },
});
