import { Glass } from "./Glass";

const PLACEHOLDER = "Search an Austin address";

export function IntroSearch() {
  return (
    <Glass
      as="header"
      className="fixed top-(--gutter) left-(--gutter) z-3 w-[340px] rounded-[28px] px-[22px] pt-[22px] pb-[18px] phone:right-(--gutter) phone:w-auto phone:rounded-3xl phone:px-4 phone:py-3.5"
    >
      <h1 className="font-display text-[40px] leading-none tracking-[-0.01em] text-deep italic phone:text-[28px]">
        Building Record
      </h1>
      <p className="mt-2 mb-4 max-w-[26ch] text-slate phone:hidden">
        Austin apartments, seen through the city&apos;s own complaint files.
      </p>
      <div className="flex h-11 items-center gap-2.5 rounded-full border border-white/70 bg-white/50 px-4 focus-within:border-white focus-within:bg-white/78 focus-within:outline-[1.5px] focus-within:outline-offset-2 focus-within:outline-deep phone:mt-2.5">
        <svg
          aria-hidden
          width="16"
          height="16"
          viewBox="0 0 16 16"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.4"
          strokeLinecap="round"
          className="flex-none text-steel"
        >
          <circle cx="7" cy="7" r="4.6" />
          <path d="m10.6 10.6 3.4 3.4" />
        </svg>
        <input
          type="search"
          placeholder={PLACEHOLDER}
          aria-label={PLACEHOLDER}
          autoComplete="off"
          className="h-full min-w-0 flex-1 bg-transparent outline-none placeholder:text-steel"
        />
      </div>
    </Glass>
  );
}
