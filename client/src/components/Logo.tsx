/**
 * The Kiln mark: a brick kiln seen from the front. A navy dome, an arched firing door that glows
 * sun-yellow, and one coral flame inside. It sits on an orange tile so it reads on light and dark pages.
 */
export default function Logo({ size = 28, tile = true }: { size?: number; tile?: boolean }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden="true" focusable="false">
      {tile && <rect x="2.5" y="2.5" width="43" height="43" rx="13" fill="#FF8A3D" stroke="#14163B" strokeWidth="3" />}
      {/* dome and base */}
      <path d="M10 37V25C10 16.2 16.2 10.5 24 10.5S38 16.2 38 25V37Z" fill="#14163B" />
      {/* brick courses */}
      <path d="M10.4 30.5H17M31 30.5h6.6M12 24H15.5M32.5 24H36" stroke="#FF8A3D" strokeWidth="1.6" strokeLinecap="round" opacity=".55" />
      {/* glowing firing door */}
      <path d="M17.5 37V29.5C17.5 25.8 20.4 23 24 23S30.5 25.8 30.5 29.5V37Z" fill="#FFC43D" />
      {/* flame */}
      <path d="M24 36C21.6 36 20.6 34.4 21.2 32.6 21.7 31.3 23 30.6 23.1 28.8 25.6 30 27.2 31.9 27.2 33.7 27.2 35 26 36 24 36Z" fill="#FF5A7A" />
      {/* spark leaving the vent */}
      <circle cx="24" cy="6.6" r="1.7" fill="#14163B" />
    </svg>
  );
}

/** Same mark as a data URI, for the favicon (kept in sync with index.html). */
export const LOGO_FAVICON_NOTE = 'client/index.html carries a copy of this mark as an inline SVG favicon.';
