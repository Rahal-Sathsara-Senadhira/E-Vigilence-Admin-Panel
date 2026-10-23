// The station map, loaded only when a screen shows it (it is the largest
// library in the panel). While it loads, a grey placeholder holds its space.
// If it can't load (offline, or the library is missing), the screen keeps
// working and says so in the map's place.

import { MapPinOff } from "lucide-react";
import { Component, Suspense, lazy } from "react";
import { Skeleton } from "@/ui/index.js";

const LazyMap = lazy(() => import("./StationMap.jsx"));

/** @param {Parameters<typeof import("./StationMap.jsx").default>[0]} props */
export function StationMap(props) {
  const box = props.className ?? "h-80 w-full rounded-lg";
  return (
    <MapBoundary className={box}>
      <Suspense fallback={<Skeleton className={box} />}>
        <LazyMap {...props} />
      </Suspense>
    </MapBoundary>
  );
}

/** Catches a map that fails to load, so the rest of the page still works. */
class MapBoundary extends Component {
  /** @param {{ className: string, children: import("react").ReactNode }} props */
  constructor(props) {
    super(props);
    this.state = { failed: false };
  }

  static getDerivedStateFromError() {
    return { failed: true };
  }

  render() {
    const { className, children } =
      /** @type {{ className: string, children: import("react").ReactNode }} */ (this.props);
    if (!(/** @type {{ failed: boolean }} */ (this.state).failed)) return children;
    return (
      <div
        className={`${className} grid place-items-center rounded-lg border border-dashed border-border bg-sunken p-6`}
      >
        <div className="flex max-w-sm flex-col items-center gap-2 text-center text-sm text-text-muted">
          <MapPinOff className="size-5" aria-hidden />
          <p>The map couldn&apos;t load. Everything else on this page still works.</p>
        </div>
      </div>
    );
  }
}
