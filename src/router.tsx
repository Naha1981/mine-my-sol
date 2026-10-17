import { QueryClient } from "@tanstack/react-query";
import { createHashHistory, createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";

export const getRouter = () => {
  const queryClient = new QueryClient();

  const router = createRouter({
    routeTree,
    context: { queryClient },
    ...(import.meta.env["VITE_HASH_ROUTER"] === "1" && typeof window !== "undefined" ? { history: createHashHistory() } : {}),
    scrollRestoration: true,
    defaultPreloadStaleTime: 0,
  });

  return router;
};
