import { type JSX, splitProps } from "solid-js";

type IconProps = JSX.SvgSVGAttributes<SVGSVGElement>;

function Stroke(props: IconProps & { children: JSX.Element }) {
  const [local, rest] = splitProps(props, ["children"]);
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="1.7"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
      {...rest}
    >
      {local.children}
    </svg>
  );
}

function Filled(props: IconProps & { children: JSX.Element }) {
  const [local, rest] = splitProps(props, ["children"]);
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      stroke="none"
      aria-hidden="true"
      {...rest}
    >
      {local.children}
    </svg>
  );
}

export const Icons = {
  Search: (p: IconProps) => (
    <Stroke {...p}>
      <circle cx="11" cy="11" r="7" />
      <path d="M21 21l-4.3-4.3" />
    </Stroke>
  ),
  Sun: (p: IconProps) => (
    <Stroke {...p}>
      <circle cx="12" cy="12" r="4.2" />
      <path d="M12 2v2.5M12 19.5V22M2 12h2.5M19.5 12H22M4.9 4.9l1.8 1.8M17.3 17.3l1.8 1.8M19.1 4.9l-1.8 1.8M6.7 17.3l-1.8 1.8" />
    </Stroke>
  ),
  Moon: (p: IconProps) => (
    <Stroke {...p}>
      <path d="M20 13.5A8 8 0 1 1 10.5 4a6.3 6.3 0 0 0 9.5 9.5z" />
    </Stroke>
  ),
  Edit: (p: IconProps) => (
    <Stroke {...p}>
      <path d="M4 20h4l10-10-4-4L4 16zM13.5 6.5l4 4" />
    </Stroke>
  ),
  Chevron: (p: IconProps) => (
    <Stroke {...p}>
      <path d="M6 9l6 6 6-6" />
    </Stroke>
  ),
  Bold: (p: IconProps) => (
    <Stroke {...p}>
      <path d="M6 4h6a3.5 3.5 0 0 1 0 7H6zM6 11h7a3.5 3.5 0 0 1 0 7H6z" />
    </Stroke>
  ),
  Italic: (p: IconProps) => (
    <Stroke {...p}>
      <path d="M10 4h7M7 20h7M14 4l-4 16" />
    </Stroke>
  ),
  H2: (p: IconProps) => (
    <Stroke {...p}>
      <path d="M4 6v12M4 12h7M11 6v12" />
      <path d="M16 10a2 2 0 1 1 3.4 1.4L16 18h4" />
    </Stroke>
  ),
  List: (p: IconProps) => (
    <Stroke {...p}>
      <path d="M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01" />
    </Stroke>
  ),
  Quote: (p: IconProps) => (
    <Stroke {...p}>
      <path d="M7 7H4v6h3l-1 4M17 7h-3v6h3l-1 4" />
    </Stroke>
  ),
  Code: (p: IconProps) => (
    <Stroke {...p}>
      <path d="M9 8l-4 4 4 4M15 8l4 4-4 4" />
    </Stroke>
  ),
  Info: (p: IconProps) => (
    <Stroke {...p}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v5M12 7.6v.2" />
    </Stroke>
  ),
  Warn: (p: IconProps) => (
    <Stroke {...p}>
      <path d="M12 3l9 16H3z" />
      <path d="M12 10v4M12 17v.2" />
    </Stroke>
  ),
  Menu: (p: IconProps) => (
    <Stroke {...p}>
      <path d="M4 7h16M4 12h16M4 17h16" />
    </Stroke>
  ),
  Close: (p: IconProps) => (
    <Stroke {...p}>
      <path d="M6 6l12 12M18 6L6 18" />
    </Stroke>
  ),
  Github: (p: IconProps) => (
    <Filled {...p}>
      <path d="M12 2a10 10 0 0 0-3.16 19.49c.5.09.68-.22.68-.48v-1.7c-2.78.6-3.37-1.34-3.37-1.34-.45-1.16-1.11-1.47-1.11-1.47-.91-.62.07-.6.07-.6 1 .07 1.53 1.03 1.53 1.03.9 1.53 2.36 1.09 2.93.83.09-.65.35-1.09.63-1.34-2.22-.25-4.55-1.11-4.55-4.94 0-1.09.39-1.98 1.03-2.68-.1-.25-.45-1.27.1-2.65 0 0 .84-.27 2.75 1.02a9.5 9.5 0 0 1 5 0c1.91-1.29 2.75-1.02 2.75-1.02.55 1.38.2 2.4.1 2.65.64.7 1.03 1.59 1.03 2.68 0 3.84-2.34 4.69-4.57 4.94.36.31.68.92.68 1.85v2.74c0 .27.18.58.69.48A10 10 0 0 0 12 2z" />
    </Filled>
  ),
};
