import { useEffect, useState } from "react";
import { getApiHealthState, subscribeApiHealth } from "@/lib/apiHealth";

export function useApiHealth() {
  const [state, setState] = useState(getApiHealthState());

  useEffect(() => subscribeApiHealth(setState), []);

  return state;
}
