// App-wide providers: server data cache, session, routing.

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter } from "react-router";
import { ApiError } from "@/lib/api.js";
import { SessionProvider } from "@/lib/session.jsx";
import { TooltipProvider } from "@/ui/index.js";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      refetchOnWindowFocus: false,
      // Don't retry what won't change on retry (permissions, validation, missing records).
      retry: (count, err) =>
        !(err instanceof ApiError && err.status >= 400 && err.status < 500) && count < 2,
    },
  },
});

/** @param {{ children: import("react").ReactNode }} props */
export function Providers({ children }) {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <SessionProvider>
          <TooltipProvider>{children}</TooltipProvider>
        </SessionProvider>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
