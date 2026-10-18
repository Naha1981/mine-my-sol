import { createFileRoute } from "@tanstack/react-router";
import { EyeView } from "@/components/app/EyeView";

export const Route = createFileRoute("/_authenticated/admin/eye")({ component: EyeView });
