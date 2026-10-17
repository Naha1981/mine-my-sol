import { createFileRoute } from "@tanstack/react-router";
import { NotificationsPage } from "@/components/app/Notifications";

export const Route = createFileRoute("/_authenticated/admin/notifications")({ component: () => <NotificationsPage /> });
