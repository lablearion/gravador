"use client";

import { ThemeProvider as NextThemesProvider } from "next-themes";

// Provider de tema (claro/escuro) com persistência via next-themes (localStorage + classe .dark no <html>).
export function ThemeProvider({
  children,
  ...props
}: React.ComponentProps<typeof NextThemesProvider>) {
  return <NextThemesProvider {...props}>{children}</NextThemesProvider>;
}
