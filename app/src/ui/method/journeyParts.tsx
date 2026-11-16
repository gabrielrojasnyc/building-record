"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

/**
 * The furthest step a reader has scrolled to, from 1. A step counts once its top has come up past the middle
 * of the window. Where the browser cannot watch for that, every step counts as reached, so nothing is held back.
 */
export function useFurthestStep(count: number) {
  const [furthest, setFurthest] = useState(1);
  const steps = useRef<(HTMLElement | null)[]>([]);

  useEffect(() => {
    const reach = (step: number) =>
      setFurthest((current) => Math.max(current, step));
    if (typeof IntersectionObserver === "undefined") {
      const whenIdle = setTimeout(() => reach(count), 0);
      return () => clearTimeout(whenIdle);
    }
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          reach(steps.current.indexOf(entry.target as HTMLElement) + 1);
        }
      },
      { rootMargin: "0px 0px -45% 0px" },
    );
    for (const step of steps.current) if (step) observer.observe(step);
    return () => observer.disconnect();
  }, [count]);

  /** Hands a step's element to the watcher. */
  const watch = (index: number) => (element: HTMLElement | null) => {
    steps.current[index] = element;
  };
  return { furthest, watch };
}

/** The panel a step's thing to try sits in. It rises into view as the page scrolls to it, from globals.css. */
export function Figure({ children }: { children: ReactNode }) {
  return (
    <div className="journey-figure mt-4 rounded-[22px] border border-white/60 bg-white/42 p-4 phone:p-3.5">
      {children}
    </div>
  );
}

/** What a step asks the reader to try. */
export const PROMPT = "mb-2.5 text-[14.5px] font-normal text-deep";

/** What the thing just tried came to, said aloud to a screen reader when it changes. */
export function Result({ children }: { children: ReactNode }) {
  return (
    <p
      aria-live="polite"
      className="mt-3.5 text-[14.5px] leading-normal text-pretty text-deep"
    >
      {children}
    </p>
  );
}

/** One choice among a few, drawn as the site's pills: real radio buttons, so the arrow keys move between them. */
export function Choice<T extends string>(props: {
  legend: string;
  name: string;
  options: { value: T; label: string }[];
  value: T;
  onChange(value: T): void;
}) {
  return (
    <fieldset>
      <legend className={PROMPT}>{props.legend}</legend>
      <div className="flex flex-wrap gap-2">
        {props.options.map(({ value, label }) => (
          <label key={value} className="cursor-pointer">
            <input
              type="radio"
              name={props.name}
              value={value}
              checked={props.value === value}
              onChange={() => props.onChange(value)}
              className="peer sr-only"
            />
            <span className="inline-flex h-[34px] items-center rounded-full border border-white/70 bg-white/50 px-3.5 text-[14px] font-normal whitespace-nowrap text-deep peer-checked:border-deep peer-checked:bg-deep peer-checked:text-ice peer-focus-visible:outline-[1.5px] peer-focus-visible:outline-offset-2 peer-focus-visible:outline-deep motion-safe:transition-colors motion-safe:duration-200">
              {label}
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

/** A yes or no about the complaint, as a checkbox with its label. */
export function Toggle(props: {
  label: string;
  checked: boolean;
  onChange(checked: boolean): void;
}) {
  return (
    <label className="flex cursor-pointer items-center gap-2.5 text-[14px] text-navy">
      <input
        type="checkbox"
        checked={props.checked}
        onChange={(event) => props.onChange(event.target.checked)}
        className="size-4 flex-none accent-deep"
      />
      {props.label}
    </label>
  );
}
