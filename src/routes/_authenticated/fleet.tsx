import { createFileRoute, Link } from "@tanstack/react-router";
import { FleetPulseView } from "@/components/app/fleetpulse/FleetPulseView";
import { useMe } from "@/lib/session";

export const Route = createFileRoute("/_authenticated/fleet")({ component: FleetPage });
function FleetPage() {
  const me = useMe();
  return (
    <div className="min-h-screen bg-background">
      <div className="border-b bg-card px-3 py-2 text-sm">
        <Link to={me.isAdmin ? "/admin" : "/portal"} className="text-primary">
          ← Back to {me.isAdmin ? "administration" : "portal"}
        </Link>
      </div>
      <FleetPulseView />
    </div>
  );
}
