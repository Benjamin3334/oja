import type { ReactNode } from "react";

interface TableProps {
  children: ReactNode;
}

// Section 8.3: 44px rows, hairline separators, sticky header, text left and
// numbers right. The wrapper scrolls horizontally rather than forcing the page
// wide, which only works because the shell's main column carries min-w-0.
export function Table({ children }: TableProps) {
  return (
    <div className="w-full overflow-x-auto rounded-md border border-hairline bg-surface">
      <table className="w-full border-collapse text-left">{children}</table>
    </div>
  );
}

export function THead({ children }: TableProps) {
  return (
    <thead className="sticky top-0 bg-surface">
      <tr className="border-b border-hairline">{children}</tr>
    </thead>
  );
}

interface ThProps {
  children: ReactNode;
  numeric?: boolean;
}

export function Th({ children, numeric = false }: ThProps) {
  return (
    <th
      scope="col"
      className={[
        "h-[var(--row-h)] px-4 text-label text-ink-muted",
        numeric ? "text-right" : "text-left",
      ].join(" ")}
    >
      {children}
    </th>
  );
}

export function TBody({ children }: TableProps) {
  return <tbody>{children}</tbody>;
}

export function Tr({ children }: TableProps) {
  return <tr className="border-b border-hairline last:border-b-0">{children}</tr>;
}

interface TdProps {
  children: ReactNode;
  numeric?: boolean;
}

// Money and quantities get the mono face with tabular numerals and are right
// aligned, so columns line up to the decimal (section 8.2).
export function Td({ children, numeric = false }: TdProps) {
  return (
    <td
      className={[
        "h-[var(--row-h)] px-4 text-body text-ink",
        numeric ? "numeric text-right" : "text-left",
      ].join(" ")}
    >
      {children}
    </td>
  );
}

interface TableEmptyProps {
  colSpan: number;
  children: ReactNode;
}

// Section 8.3: the empty state lives inside the table body, not above it, so
// the header and column widths stay put.
export function TableEmpty({ colSpan, children }: TableEmptyProps) {
  return (
    <tr>
      <td colSpan={colSpan} className="px-4 py-8">
        {children}
      </td>
    </tr>
  );
}
