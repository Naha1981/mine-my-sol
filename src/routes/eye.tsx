import { createFileRoute } from "@tanstack/react-router";
import { EyeView } from "@/components/app/EyeView";

export const Route = createFileRoute("/eye")({
  component: () => (<div className="mx-auto max-w-3xl p-3"><EyeView /></div>),
});
