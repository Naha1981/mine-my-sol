import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

/** Loosely typed handle for page queries with embedded selects. Table access is still enforced by the database. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const db = supabase as unknown as SupabaseClient<any, "public", any>;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Row = Record<string, any>;

export async function signedUrl(path: string, download?: string) {
  const { data, error } = await supabase.storage.from("documents").createSignedUrl(path, 300, download ? { download } : undefined);
  if (error) throw error;
  return data.signedUrl;
}
