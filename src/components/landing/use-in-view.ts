"use client";
// Flips to true the first time an element scrolls into view, then stops watching.
// The landing page uses it to start each section's one-off animation.
import { useEffect, useRef, useState } from "react";

export function useInView<T extends Element>() {
  const ref = useRef<T>(null);
  const [seen, setSeen] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el || seen) return;
    const watch = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return;
        setSeen(true);
        watch.disconnect();
      },
      { rootMargin: "0px 0px -18% 0px", threshold: 0.25 },
    );
    watch.observe(el);
    return () => watch.disconnect();
  }, [seen]);

  return [ref, seen] as const;
}
