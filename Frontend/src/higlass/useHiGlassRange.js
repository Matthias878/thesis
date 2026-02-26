import { useCallback, useRef } from "react";

export function useHiGlassRange() {
  const lastRangeRef = useRef({ start1: null, end1: null, viewUid: "view-1" });

  const updateLastRangeFromApi = useCallback((api) => {
    const loc = api?.getLocation?.();
    const views = loc?.views ?? {};
    const preferred = lastRangeRef.current.viewUid;

    const viewUid =
      (preferred && views[preferred] ? preferred : null) ||
      Object.keys(views)[0] ||
      "view-1";

    lastRangeRef.current.viewUid = viewUid;

    const v = views[viewUid];
    const xd = v?.xDomain;
    if (!xd || xd.length !== 2) return;

    const start0 = Math.floor(xd[0]);
    const end0ex = Math.ceil(xd[1]);
    const start1 = start0 + 1;
    const end1 = Math.max(start1, end0ex);

    lastRangeRef.current.start1 = start1;
    lastRangeRef.current.end1 = end1;
  }, []);

  return { lastRangeRef, updateLastRangeFromApi };
}