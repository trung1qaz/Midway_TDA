"use client";

import dynamic from "next/dynamic";

// ssr:false is only allowed from a Client Component, hence this wrapper.
const ResultsMapLoader = dynamic(() => import("./ResultsMap"), {
  ssr: false,
  loading: () => (
    <div className="flex h-[460px] w-full items-center justify-center rounded-lg border border-zinc-200 text-sm text-zinc-500 dark:border-zinc-800">
      Loading map…
    </div>
  ),
});

export default ResultsMapLoader;
