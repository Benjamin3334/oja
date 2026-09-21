import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Geist, Instrument_Serif, JetBrains_Mono } from "next/font/google";
import "./globals.css";

// The three families named in docs/01_PRD.md section 8.2. Each one publishes a
// CSS variable whose name matches the stack that globals.css already declares,
// so the stylesheet needs no change when these are attached to <html> below.

// Display and KPI figures. Instrument Serif ships a single 400 weight, so the
// weight must be stated explicitly; it has no variable axis to infer it from.
const instrumentSerif = Instrument_Serif({
  variable: "--font-instrument-serif",
  subsets: ["latin"],
  weight: "400",
  display: "swap",
});

// Interface text. Geist has a variable axis, which is what makes the 560 title
// weight in the type scale reachable at all - it is not a named static weight.
const geist = Geist({
  variable: "--font-geist",
  subsets: ["latin"],
  display: "swap",
});

// Money and quantities, always tabular. Also variable.
const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  subsets: ["latin"],
  display: "swap",
});

// A page that sets its own title overrides this; the default covers the ones
// that do not, such as /onboarding.
export const metadata: Metadata = {
  title: "Oja",
  description:
    "Operations console for small Nigerian businesses: stock, sales and customers in one place.",
};

interface RootLayoutProps {
  children: ReactNode;
}

export default function RootLayout({ children }: RootLayoutProps) {
  return (
    <html
      lang="en"
      className={`${instrumentSerif.variable} ${geist.variable} ${jetbrainsMono.variable} h-full antialiased`}
    >
      <head>
        {/*
          Applies the stored theme BEFORE the browser paints. Without this the
          page renders in the light theme for one frame and then flips, which
          is the flash of wrong theme every themed site gets wrong.

          It has to be inline and synchronous - a React effect runs after paint,
          and an external script would be a second round trip. Wrapped in
          try/catch because localStorage throws in private browsing rather than
          returning null, and a theme preference is not worth an error page.

          "system" is stored as an explicit choice but sets no attribute, which
          lets the prefers-color-scheme rule in globals.css take over.
        */}
        <script
          dangerouslySetInnerHTML={{
            __html: [
              "try{",
              "var t=localStorage.getItem('oja-theme');",
              "if(t==='light'||t==='dark'){",
              "document.documentElement.setAttribute('data-theme',t)",
              "}",
              "}catch(e){}",
            ].join(""),
          }}
        />
      </head>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
