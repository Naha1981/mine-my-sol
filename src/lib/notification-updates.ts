import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

// Refresh both the list and badge after an event for this user. RLS still
// controls every subsequent read. No timer or account-wide polling is needed.
export function useNotificationUpdates(userId: string) {
  const qc = useQueryClient();
  useEffect(() => {
    const channel = supabase
      .channel(`notifications:${userId}`)
      .on("postgres_changes", {
        event: "*", schema: "public", table: "notifications",
        filter: `user_id=eq.${userId}`,
      }, () => { void qc.invalidateQueries({ queryKey: ["notifications"] }); })
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [qc, userId]);
}
