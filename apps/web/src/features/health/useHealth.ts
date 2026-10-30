import { useQuery } from "@tanstack/react-query";
import { fetchHealth } from "@/lib/api";

/** Polls the backend health endpoint. */
export function useHealth() {
  return useQuery({
    queryKey: ["health"],
    queryFn: fetchHealth,
    refetchInterval: 15_000,
  });
}
