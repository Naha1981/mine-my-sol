// Minimal @tanstack/react-router stub for fixtures (no router context needed).
import React from "react";
export const createFileRoute = (_path: string) => (opts: any) => opts;
export const Link = ({ children, to, ...rest }: any) => React.createElement("a", { href: typeof to === "string" ? to : "#", ...rest }, children);
