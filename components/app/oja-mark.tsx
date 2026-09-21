interface OjaMarkProps {
  size?: number;
  // True where the word "Oja" is already written beside the mark. The svg is
  // aria-hidden either way; this drops the sr-only label as well, so a screen
  // reader does not announce "Oja Oja".
  decorative?: boolean;
  // "mono" is the mark alone in currentColor, which takes --ink and follows
  // the theme - right where the mark stands in for the name, as on the 404.
  // "brand" is the tile the favicon serves: the mark reversed out of the
  // brand green, in colours that do NOT flip with the theme, because a logo
  // keeps its colours.
  variant?: "mono" | "brand";
  // Only needed when a single page renders the mark twice. The geometry is
  // identical so sharing one mask would still render correctly, but duplicate
  // element ids are invalid, so a second instance should pass its own.
  id?: string;
}

// The Oja mark: a stencil-cut O.
//
// Traced from docs/assets/logo-source.jpeg by measuring the raster rather than
// eyeballing it. The source is a 24bpp JPEG with the background baked in and no
// alpha channel, so it could not be used directly - it cannot take a colour,
// and keying the green out leaves compression fringing on the curves.
//
// The recovered geometry, and how it was checked:
//   outer   circle, centre (1024,1024), radius 486. Confirmed against three
//           scanlines: predicted left edge 702 / 616 / 554 against measured
//           703 / 617 / 554.
//   counter ellipse, rx 186, ry 412. A tall oval rather than a circle, which
//           is what gives the thick sides and thin top and bottom of a
//           high-contrast serif O.
//   cuts    two parallel bands, 50 wide, 15.6 degrees from vertical. They are
//           NOT one continuous line: extending the top cut's angle downward
//           lands about 230 units from where the bottom cut actually is.
//
// Sampling this model on the same grid as the source agreed on 99.84% of
// cells - five differing out of 3136, all on a cut edge where one sample cell
// straddles the boundary.
//
// It is a redraw, not a vectorisation. If an official vector of this mark ever
// turns up, that one should replace this.
export function OjaMark({
  size = 40,
  decorative = false,
  variant = "mono",
  id = "oja-mark",
}: OjaMarkProps) {
  const maskId = `${id}-cut`;

  return (
    <span className="inline-flex items-center">
      <svg
        width={size}
        height={size}
        viewBox="0 0 2048 2048"
        // Decorative: the accessible name is the sr-only text beside it, so a
        // screen reader hears the word rather than describing a shape.
        aria-hidden="true"
        focusable="false"
      >
        <mask
          id={maskId}
          maskUnits="userSpaceOnUse"
          x="0"
          y="0"
          width="2048"
          height="2048"
        >
          {/* A luminance mask: white keeps, black removes. These two are not
              design colours and cannot be tokens - they are mask values, and
              the mask is what carves the counter and the cuts out of the
              disc so the whole mark can be one currentColor shape. */}
          <circle cx="1024" cy="1024" r="486" fill="#fff" />
          <ellipse cx="1024" cy="1024" rx="186" ry="412" fill="#000" />
          <rect
            x="1003.5"
            y="480"
            width="50"
            height="240"
            fill="#000"
            transform="rotate(15.6 1028.5 600)"
          />
          <rect
            x="987"
            y="1360"
            width="50"
            height="240"
            fill="#000"
            transform="rotate(15.6 1012 1480)"
          />
        </mask>

        {variant === "brand" ? (
          <>
            {/* The same tile as app/icon.svg: the mark reversed out of the
                brand green. Both colours come from tokens that the dark theme
                deliberately does not redefine, so this looks identical in
                either mode - which is what makes it recognisable. */}
            <rect width="2048" height="2048" fill="var(--brand-ground)" />
            <rect
              width="2048"
              height="2048"
              fill="var(--brand-mark)"
              mask={`url(#${maskId})`}
            />
          </>
        ) : (
          /* currentColor, so the mark takes --ink from whatever contains it
             and follows light and dark without a second asset. */
          <rect
            width="2048"
            height="2048"
            fill="currentColor"
            mask={`url(#${maskId})`}
          />
        )}
      </svg>

      {decorative ? null : <span className="sr-only">Oja</span>}
    </span>
  );
}
