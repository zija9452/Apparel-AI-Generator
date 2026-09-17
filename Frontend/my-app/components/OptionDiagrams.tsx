import type { ReactNode } from "react";

/* ---------------------------------------------------------------------------
 * One schematic per checkbox in docs chapter 06.
 *
 * Every figure is the same shape: the left half is the job WITHOUT the option,
 * the right half is the same job WITH it. Nothing here is a screenshot - they
 * are drawn from the theme tokens, so they follow light/dark and never need an
 * asset in public/. Geometry is illustrative, not to scale; the numbers that
 * matter (2.25in, 14mm, 19mm, 3in) are written on the drawing.
 * ------------------------------------------------------------------------ */

const OUT = "var(--line-strong)"; // cut-piece outline
const FILL = "var(--surface-2)"; // cut-piece body
const ART = "var(--brand)"; // the mockup artwork being placed
const GOOD = "var(--ok)"; // what the option fixed
const BAD = "var(--danger)"; // what is wrong without it
const SEAM = "var(--faint)"; // a sewing seam, always dashed
const LBL = "var(--faint)"; // drawing labels
const TXT = "var(--muted)"; // text inside a piece

/* ------------------------------------------------------------- primitives */

function Figure({
  caption,
  off,
  on,
  offLabel = "Unchecked",
  onLabel = "Checked",
  neutral = false,
}: {
  caption: string;
  off: ReactNode;
  on: ReactNode;
  offLabel?: string;
  onLabel?: string;
  /** Two equally valid modes rather than off/on - do not paint the right one green. */
  neutral?: boolean;
}) {
  return (
    <figure className="overflow-hidden rounded-xl border border-line bg-surface">
      <svg
        viewBox="0 0 620 210"
        className="block h-auto w-full"
        role="img"
        aria-label={caption}
      >
        <text x={10} y={15} fontSize={10} fontWeight={700} fill={LBL} letterSpacing="0.09em">
          {offLabel.toUpperCase()}
        </text>
        <text
          x={350}
          y={15}
          fontSize={10}
          fontWeight={700}
          fill={neutral ? LBL : GOOD}
          letterSpacing="0.09em"
        >
          {onLabel.toUpperCase()}
        </text>
        <path
          d="M294 110h22m-7-7 7 7-7 7"
          fill="none"
          stroke={LBL}
          strokeWidth={1.6}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {/* Each half draws inside its own 260 x 165 box. */}
        <g transform="translate(10,26)">{off}</g>
        <g transform="translate(350,26)">{on}</g>
      </svg>
      <figcaption className="border-t border-line bg-surface-2 px-4 py-2.5 text-xs leading-relaxed text-muted">
        {caption}
      </figcaption>
    </figure>
  );
}

/** One canvas instead of two halves, for an option that is a set of modes. */
function WideFigure({ caption, children }: { caption: string; children: ReactNode }) {
  return (
    <figure className="overflow-hidden rounded-xl border border-line bg-surface">
      <svg viewBox="0 0 620 170" className="block h-auto w-full" role="img" aria-label={caption}>
        {children}
      </svg>
      <figcaption className="border-t border-line bg-surface-2 px-4 py-2.5 text-xs leading-relaxed text-muted">
        {caption}
      </figcaption>
    </figure>
  );
}

/** A jersey silhouette, 120 wide by 150 tall. Torso is x 28-92, y 39-148. */
const TEE =
  "M6 32 L34 5 L44 5 C50 15 70 15 76 5 L86 5 L114 32 L100 47 L92 39 L92 148 L28 148 L28 39 L20 47 Z";

function Tee({ children }: { children?: ReactNode }) {
  return (
    <g transform="translate(70,4)">
      <path d={TEE} fill={FILL} stroke={OUT} strokeWidth={2} strokeLinejoin="round" />
      {children}
    </g>
  );
}

function Cap({ x, y, children, fill = LBL, anchor = "middle" }: {
  x: number;
  y: number;
  children: ReactNode;
  fill?: string;
  anchor?: "start" | "middle" | "end";
}) {
  return (
    <text x={x} y={y} fontSize={10} fontWeight={600} textAnchor={anchor} fill={fill}>
      {children}
    </text>
  );
}

/** A named cut piece in the plan.
 *  `new`   the option added it
 *  `gone`  the option removes it - it is not built at all */
type ChipTone = "base" | "new" | "gone";

const CHIP_TONES: Record<ChipTone, { stroke: string; fill: string; ink: string }> = {
  base: { stroke: OUT, fill: FILL, ink: TXT },
  new: { stroke: GOOD, fill: "var(--ok-soft)", ink: "var(--ok-ink)" },
  gone: { stroke: BAD, fill: "var(--danger-soft)", ink: "var(--danger-ink)" },
};

function Chip({
  x,
  y,
  label,
  tone = "base",
}: {
  x: number;
  y: number;
  label: string;
  tone?: ChipTone;
}) {
  const t = CHIP_TONES[tone];
  return (
    <g>
      <rect x={x} y={y} width={78} height={24} rx={7} fill={t.fill} stroke={t.stroke} strokeWidth={1.4} />
      <text x={x + 39} y={y + 16} fontSize={9.5} fontWeight={600} textAnchor="middle" fill={t.ink}>
        {label}
      </text>
      {tone === "gone" && (
        <line x1={x + 9} y1={y + 12} x2={x + 69} y2={y + 12} stroke={BAD} strokeWidth={1.3} />
      )}
    </g>
  );
}

/** Three per row, centred in the 165-tall half so short lists are not top-heavy. */
function Chips({ items }: { items: Array<[string, ChipTone]> }) {
  const rows = Math.ceil(items.length / 3);
  return (
    <g transform={`translate(0,${Math.round((165 - (rows * 32 - 8)) / 2)})`}>
      {items.map(([label, tone], i) => (
        <Chip key={label} x={(i % 3) * 86} y={Math.floor(i / 3) * 32} label={label} tone={tone} />
      ))}
    </g>
  );
}

/** A dashed sewing seam. */
function Seam({ x1, y1, x2, y2 }: { x1: number; y1: number; x2: number; y2: number }) {
  return (
    <line
      x1={x1}
      y1={y1}
      x2={x2}
      y2={y2}
      stroke={SEAM}
      strokeWidth={1.4}
      strokeDasharray="4 4"
    />
  );
}

/** Two front halves with the placket gap between them, used by the seam options. */
function Halves({ children }: { children?: ReactNode }) {
  return (
    <g>
      <rect x={8} y={10} width={100} height={140} rx={4} fill={FILL} stroke={OUT} strokeWidth={2} />
      <rect x={128} y={10} width={100} height={140} rx={4} fill={FILL} stroke={OUT} strokeWidth={2} />
      <Seam x1={118} y1={6} x2={118} y2={154} />
      {children}
    </g>
  );
}

/* ------------------------------------------------------------- 01 garment */

function FullButtonJersey() {
  return (
    <Figure
      caption="The single Front panel becomes Front Left and Front Right, and a Patti button strip is added and graded per size."
      off={
        <Tee>
          <Cap x={60} y={100} fill={TXT}>
            FRONT
          </Cap>
          <Cap x={60} y={114}>
            one piece
          </Cap>
        </Tee>
      }
      on={
        <Tee>
          <Seam x1={60} y1={8} x2={60} y2={148} />
          <rect x={56} y={22} width={8} height={126} fill={ART} opacity={0.85} rx={2} />
          <Cap x={42} y={100} fill={TXT}>
            FL
          </Cap>
          <Cap x={78} y={100} fill={TXT}>
            FR
          </Cap>
          <Cap x={60} y={162} fill={GOOD}>
            + Patti
          </Cap>
        </Tee>
      }
    />
  );
}

function Hoodie() {
  return (
    <Figure
      caption="Outside Hood, Inside Hood, Border and Pocket are added to the plan, plus one Rib and Cuff per size; the Neck piece is dropped because a hoodie has no neckline."
      off={
        <Chips
          items={[
            ["Front", "base"],
            ["Back", "base"],
            ["Sleeve", "base"],
            ["Neck", "base"],
          ]}
        />
      }
      on={
        <Chips
          items={[
            ["Front", "base"],
            ["Back", "base"],
            ["Sleeve", "base"],
            ["Neck", "gone"],
            ["Outside Hood", "new"],
            ["Inside Hood", "new"],
            ["Border", "new"],
            ["Pocket", "new"],
            ["Rib & Cuff", "new"],
          ]}
        />
      }
    />
  );
}

function HoodieJersey() {
  return (
    <Figure
      caption="The Pocket is the only difference. Both garments drop the Neck, and both get one Rib and Cuff per size added automatically."
      offLabel="Hoodie"
      onLabel="Hoodie Jersey"
      neutral
      off={
        <>
          <Chips
            items={[
              ["Outside Hood", "base"],
              ["Inside Hood", "base"],
              ["Border", "base"],
              ["Pocket", "base"],
              ["Rib & Cuff", "new"],
              ["Neck", "gone"],
            ]}
          />
          <Cap x={130} y={150}>
            with the Pocket
          </Cap>
        </>
      }
      on={
        <>
          <Chips
            items={[
              ["Outside Hood", "base"],
              ["Inside Hood", "base"],
              ["Border", "base"],
              ["Pocket", "gone"],
              ["Rib & Cuff", "new"],
              ["Neck", "gone"],
            ]}
          />
          <Cap x={130} y={150}>
            no Pocket, so the Local Tag is not shifted
          </Cap>
        </>
      }
    />
  );
}

function ExtraParts() {
  return (
    <Figure
      caption="Placket, Twill Tape and Tukdi are added to the plan. Each is one shared piece for the whole job, so its group carries no size prefix."
      off={
        <Chips
          items={[
            ["Front", "base"],
            ["Back", "base"],
            ["Sleeve", "base"],
            ["Neck", "base"],
          ]}
        />
      }
      on={
        <Chips
          items={[
            ["Front", "base"],
            ["Back", "base"],
            ["Sleeve", "base"],
            ["Neck", "base"],
            ["Placket", "new"],
            ["Twill Tape", "new"],
            ["Tukdi", "new"],
          ]}
        />
      }
    />
  );
}

/* --------------------------------------------------------- 02 seam matching */

/** A disc split by a seam: the halves only read as one circle when aligned. */
function SplitDisc({ dy = 0 }: { dy?: number }) {
  return (
    <>
      <path d="M108 46 A34 34 0 0 0 108 114 Z" fill={ART} opacity={0.85} />
      <path
        d={`M128 ${46 + dy} A34 34 0 0 1 128 ${114 + dy} Z`}
        fill={ART}
        opacity={0.85}
      />
    </>
  );
}

function CenterMatch() {
  return (
    <Figure
      caption="A design crossing the button placket is joined across Front Left and Front Right using a 2.25in placket overlap, so the two halves read as one shape when buttoned."
      off={
        <Halves>
          <SplitDisc dy={22} />
          <line x1={128} y1={68} x2={228} y2={68} stroke={BAD} strokeWidth={1.3} strokeDasharray="3 3" />
          <Cap x={118} y={166} fill={BAD}>
            halves do not meet
          </Cap>
        </Halves>
      }
      on={
        <Halves>
          <SplitDisc />
          <line x1={8} y1={80} x2={228} y2={80} stroke={GOOD} strokeWidth={1.3} strokeDasharray="3 3" />
          <Cap x={118} y={166} fill={GOOD}>
            2.25in placket overlap
          </Cap>
        </Halves>
      }
    />
  );
}

function PatternSeamMatch() {
  // Each stripe is the line y = c - x, so continuing it across a 10 wide gap
  // means dropping c by 10 on the right half. The unmatched half is off by 26.
  const CS = [40, 85, 130, 175, 220, 265, 310];
  const stripes = (shift: number, clip: string) => (
    <g clipPath={`url(#${clip})`}>
      {CS.map((c) => (
        <line
          key={c}
          x1={0}
          y1={c + shift}
          x2={260}
          y2={c + shift - 260}
          stroke={ART}
          strokeWidth={9}
          opacity={0.8}
        />
      ))}
    </g>
  );
  return (
    <Figure
      caption="Striped or background artwork is shifted on the two front halves so the lines stay continuous across the placket seam. The layer has to be named Pattern exactly - there is no size-guessing fallback."
      off={
        <>
          <defs>
            <clipPath id="psm-off-l">
              <rect x={8} y={10} width={100} height={140} rx={4} />
            </clipPath>
            <clipPath id="psm-off-r">
              <rect x={128} y={10} width={100} height={140} rx={4} />
            </clipPath>
          </defs>
          <Halves>
            {stripes(0, "psm-off-l")}
            {stripes(26, "psm-off-r")}
          </Halves>
          <Cap x={118} y={166} fill={BAD}>
            lines break at the seam
          </Cap>
        </>
      }
      on={
        <>
          <defs>
            <clipPath id="psm-on-l">
              <rect x={8} y={10} width={100} height={140} rx={4} />
            </clipPath>
            <clipPath id="psm-on-r">
              <rect x={128} y={10} width={100} height={140} rx={4} />
            </clipPath>
          </defs>
          <Halves>
            {stripes(0, "psm-on-l")}
            {stripes(-10, "psm-on-r")}
          </Halves>
          <Cap x={118} y={166} fill={GOOD}>
            lines run straight through
          </Cap>
        </>
      }
    />
  );
}

/** Front and Back drawn as two flat panels, used by the stripe options. */
function FrontBack({ children }: { children?: ReactNode }) {
  return (
    <g>
      <rect x={8} y={10} width={104} height={136} rx={4} fill={FILL} stroke={OUT} strokeWidth={2} />
      <rect x={124} y={10} width={104} height={136} rx={4} fill={FILL} stroke={OUT} strokeWidth={2} />
      <Cap x={60} y={160}>
        FRONT
      </Cap>
      <Cap x={176} y={160}>
        BACK
      </Cap>
      {children}
    </g>
  );
}

function StripesMatch() {
  return (
    <Figure
      caption="The Back stripe artwork is moved to sit at the height the Front artwork sits at. Front is measured, Back is the one adjusted - the Front is never touched."
      off={
        <FrontBack>
          <rect x={10} y={62} width={100} height={16} fill={ART} opacity={0.85} />
          <rect x={126} y={34} width={100} height={16} fill={ART} opacity={0.85} />
          <line x1={10} y1={70} x2={228} y2={70} stroke={BAD} strokeWidth={1.2} strokeDasharray="3 3" />
          <Cap x={176} y={28} fill={BAD}>
            28mm too high
          </Cap>
        </FrontBack>
      }
      on={
        <FrontBack>
          <rect x={10} y={62} width={100} height={16} fill={ART} opacity={0.85} />
          <rect x={126} y={62} width={100} height={16} fill={ART} opacity={0.85} />
          <line x1={10} y1={70} x2={228} y2={70} stroke={GOOD} strokeWidth={1.2} strokeDasharray="3 3" />
          <Cap x={176} y={52} fill={GOOD}>
            same height
          </Cap>
        </FrontBack>
      }
    />
  );
}

function SideSeamMatch() {
  // The seam here is the torso side seam: Front's right edge sewn to Back's left.
  const art = (yFront: number, yBack: number, tone: string) => (
    <>
      <path d={`M64 ${yFront} L112 ${yFront} L112 ${yFront + 30} L64 ${yFront + 22} Z`} fill={ART} opacity={0.85} />
      <path d={`M124 ${yBack} L172 ${yBack + 8} L172 ${yBack + 38} L124 ${yBack + 30} Z`} fill={ART} opacity={0.85} />
      <line x1={112} y1={yFront + 15} x2={124} y2={yBack + 15} stroke={tone} strokeWidth={1.6} strokeDasharray="3 3" />
    </>
  );
  return (
    <Figure
      caption="A design that crosses the torso side seam is joined so it lines up across Front and Back, using a 14mm simulated sewing overlap."
      off={
        <FrontBack>
          <Seam x1={118} y1={6} x2={118} y2={150} />
          {art(48, 76, BAD)}
          <Cap x={118} y={172} fill={BAD}>
            jumps at the side seam
          </Cap>
        </FrontBack>
      }
      on={
        <FrontBack>
          <Seam x1={118} y1={6} x2={118} y2={150} />
          {art(48, 48, GOOD)}
          <Cap x={118} y={172} fill={GOOD}>
            14mm sewing overlap
          </Cap>
        </FrontBack>
      }
    />
  );
}

function HoodCenterMatch() {
  const hood = (
    <>
      <path d="M108 150 L108 44 Q108 12 72 12 L40 12 L40 150 Z" fill={FILL} stroke={OUT} strokeWidth={2} strokeLinejoin="round" />
      <path d="M128 150 L128 44 Q128 12 164 12 L196 12 L196 150 Z" fill={FILL} stroke={OUT} strokeWidth={2} strokeLinejoin="round" />
      <Seam x1={118} y1={8} x2={118} y2={154} />
    </>
  );
  return (
    <Figure
      caption="The two halves of the Outside Hood are joined across the center seam with a 19mm simulated overlap (14mm sewing plus the 5mm gap). The Right half is the copy that is kept. Inside Hood is never matched either way."
      off={
        <g>
          {hood}
          <SplitDisc dy={24} />
          <Cap x={118} y={168} fill={BAD}>
            seam design does not meet
          </Cap>
        </g>
      }
      on={
        <g>
          {hood}
          <SplitDisc />
          <Cap x={118} y={168} fill={GOOD}>
            19mm overlap, Right half kept
          </Cap>
        </g>
      }
    />
  );
}

function ArmholeMatch() {
  const units = [38, 70, 102];
  const rig = (dy: number, tone: string) => (
    <>
      {units.map((y, i) => (
        <g key={y}>
          <rect x={72} y={y} width={38} height={12} fill={ART} opacity={0.85} />
          <rect x={150} y={y + dy} width={38} height={12} fill={ART} opacity={0.85} />
          <line
            x1={110}
            y1={y + 6}
            x2={150}
            y2={y + dy + 6}
            stroke={tone}
            strokeWidth={1.4}
            strokeDasharray="3 3"
          />
          <Cap x={91} y={y - 3} fill={LBL}>
            {`unit ${i + 1}`}
          </Cap>
        </g>
      ))}
    </>
  );
  return (
    <Figure
      caption="Side-panel artwork is aligned across the armhole seam so body and sleeve meet exactly when sewn. Only the Back panel right side is measured; the left is mirrored from it. Parts that cannot be matched are rendered normally and listed at the end."
      off={
        <g>
          <rect x={8} y={14} width={102} height={136} rx={4} fill={FILL} stroke={OUT} strokeWidth={2} />
          <rect x={150} y={14} width={102} height={136} rx={4} fill={FILL} stroke={OUT} strokeWidth={2} />
          <Seam x1={130} y1={10} x2={130} y2={154} />
          {rig(18, BAD)}
          <Cap x={59} y={165}>
            BACK
          </Cap>
          <Cap x={201} y={165}>
            SLEEVE
          </Cap>
        </g>
      }
      on={
        <g>
          <rect x={8} y={14} width={102} height={136} rx={4} fill={FILL} stroke={OUT} strokeWidth={2} />
          <rect x={150} y={14} width={102} height={136} rx={4} fill={FILL} stroke={OUT} strokeWidth={2} />
          <Seam x1={130} y1={10} x2={130} y2={154} />
          {rig(0, GOOD)}
          <Cap x={59} y={165}>
            BACK
          </Cap>
          <Cap x={201} y={165}>
            SLEEVE
          </Cap>
        </g>
      }
    />
  );
}

function ArmholeCorrectionMode() {
  // Four cells, 142 wide on a 152 pitch: how a unit is allowed to be corrected
  // onto its target once armhole matching is on.
  const cell = (i: number, title: string, note: string, art: ReactNode) => {
    const x = 5 + i * 152;
    const cx = x + 71;
    return (
      <g key={title}>
        <rect x={x} y={16} width={142} height={122} rx={10} fill={FILL} stroke={OUT} strokeWidth={1.6} />
        <text x={cx} y={36} fontSize={10} fontWeight={700} textAnchor="middle" fill={TXT}>
          {title}
        </text>
        <g transform={`translate(${cx},0)`}>{art}</g>
        <text x={cx} y={152} fontSize={9} fontWeight={600} textAnchor="middle" fill={LBL}>
          {note}
        </text>
      </g>
    );
  };
  const unit = <rect x={-19} y={72} width={38} height={22} rx={2} fill={ART} opacity={0.85} />;
  const arrowStyle = {
    fill: "none",
    stroke: GOOD,
    strokeWidth: 1.6,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };
  const sideways = <path d="M-26 83h-22m6-5-6 5 6 5M26 83h22m-6-5 6 5-6 5" {...arrowStyle} />;
  const upDown = <path d="M0 66V48m-5 6 5-6 5 6M0 100v18m-5-6 5 6 5-6" {...arrowStyle} />;
  const bigger = (
    <>
      <rect x={-29} y={64} width={58} height={38} rx={2} fill="none" stroke={GOOD} strokeWidth={1.4} strokeDasharray="4 3" />
      <path d="M22 60l8-8m-6 0h6v6" {...arrowStyle} />
    </>
  );
  return (
    <WideFigure caption="Only offered once Armhole side sleeve matching is on. Anything the chosen method cannot fix is left exactly as drawn and reported at the end, never corrected a different way.">
      <text x={10} y={11} fontSize={10} fontWeight={700} fill={LBL} letterSpacing="0.09em">
        HOW A UNIT MAY BE CORRECTED ONTO ITS TARGET
      </text>
      {cell(0, "Auto (default)", "the machine decides", (
        <>
          {unit}
          {sideways}
          {upDown}
        </>
      ))}
      {cell(1, "Left/right move only", "no up/down, no resize", (
        <>
          {unit}
          {sideways}
        </>
      ))}
      {cell(2, "Up/down move only", "no sideways, no resize", (
        <>
          {unit}
          {upDown}
        </>
      ))}
      {cell(3, "Resize only", "scaled, never moved", (
        <>
          {unit}
          {bigger}
        </>
      ))}
    </WideFigure>
  );
}

/* --------------------------------------------------- 03 scaling & placement */

function DesignScaling() {
  const panel = (
    <rect x={30} y={10} width={200} height={132} rx={4} fill={FILL} stroke={OUT} strokeWidth={2} />
  );
  return (
    <Figure
      caption="Both modes fit the design by height so it keeps its proportions. The second mode additionally slides any Front or Back artwork marked side back onto its own side seam - moved sideways only, never stretched."
      offLabel="Height proportional (default)"
      onLabel="Height proportional, sides kept"
      neutral
      off={
        <g>
          {panel}
          <Seam x1={230} y1={6} x2={230} y2={146} />
          <rect x={92} y={40} width={76} height={72} rx={3} fill={ART} opacity={0.75} />
          <rect x={186} y={56} width={16} height={44} fill={ART} opacity={0.85} />
          <line x1={202} y1={78} x2={230} y2={78} stroke={BAD} strokeWidth={1.4} strokeDasharray="3 3" />
          <Cap x={216} y={70} fill={BAD}>
            gap
          </Cap>
          <Cap x={130} y={162}>
            side artwork floats off its seam
          </Cap>
        </g>
      }
      on={
        <g>
          {panel}
          <Seam x1={230} y1={6} x2={230} y2={146} />
          <rect x={92} y={40} width={76} height={72} rx={3} fill={ART} opacity={0.75} />
          <rect x={214} y={56} width={16} height={44} fill={ART} opacity={0.85} />
          <path d="M196 78h14m-5-5 5 5-5 5" fill="none" stroke={GOOD} strokeWidth={1.4} strokeLinecap="round" strokeLinejoin="round" />
          <Cap x={130} y={162} fill={GOOD}>
            moved sideways onto the side seam
          </Cap>
        </g>
      }
    />
  );
}

function SleeveBottomLine() {
  // Small and large sleeve of the same design; d is the rib line's distance
  // from the bottom edge. Proportional scaling grows d with the piece.
  const sleeve = (x: number, top: number, w: number, d: number, tone: string, size: string) => (
    <g>
      <path
        d={`M${x} ${top} L${x + w} ${top} L${x + w - 8} 146 L${x + 8} 146 Z`}
        fill={FILL}
        stroke={OUT}
        strokeWidth={2}
        strokeLinejoin="round"
      />
      <rect x={x + 9} y={146 - d - 10} width={w - 18} height={10} fill={ART} opacity={0.85} />
      <line x1={x + w + 6} y1={146 - d} x2={x + w + 6} y2={146} stroke={tone} strokeWidth={1.3} />
      <line x1={x + w + 2} y1={146} x2={x + w + 10} y2={146} stroke={tone} strokeWidth={1.3} />
      <line x1={x + w + 2} y1={146 - d} x2={x + w + 10} y2={146 - d} stroke={tone} strokeWidth={1.3} />
      <Cap x={x + w / 2} y={top - 6}>
        {size}
      </Cap>
    </g>
  );
  return (
    <Figure
      caption="The rib and cuff line keeps the distance from the sleeve bottom, and the height, that the test print had - on every size - instead of growing with the panel."
      off={
        <g>
          {sleeve(12, 62, 74, 16, BAD, "Small")}
          {sleeve(132, 22, 100, 34, BAD, "2XL")}
          <Cap x={130} y={164} fill={BAD}>
            distance grows with the size
          </Cap>
        </g>
      }
      on={
        <g>
          {sleeve(12, 62, 74, 16, GOOD, "Small")}
          {sleeve(132, 22, 100, 16, GOOD, "2XL")}
          <Cap x={130} y={164} fill={GOOD}>
            same distance as the test print
          </Cap>
        </g>
      }
    />
  );
}

/* ------------------------------------------------- 04 personalization & tags */

function LocalTag() {
  const tag = (x: number, y: number, w: number, label: string, dim: string | null, tone: string) => (
    <g>
      <rect x={x} y={y} width={w} height={44} rx={3} fill={FILL} stroke={tone} strokeWidth={2} />
      <text x={x + w / 2} y={y + 28} fontSize={14} fontWeight={700} textAnchor="middle" fill={TXT}>
        {label}
      </text>
      {dim && (
        <>
          <line x1={x} y1={y + 56} x2={x + w} y2={y + 56} stroke={tone} strokeWidth={1.3} />
          <line x1={x} y1={y + 52} x2={x} y2={y + 60} stroke={tone} strokeWidth={1.3} />
          <line x1={x + w} y1={y + 52} x2={x + w} y2={y + 60} stroke={tone} strokeWidth={1.3} />
          <Cap x={x + w / 2} y={y + 70} fill={tone}>
            {dim}
          </Cap>
        </>
      )}
    </g>
  );
  return (
    <Figure
      caption="The size letter on the tag is rewritten per piece and the bordered box is pinned to a fixed width: 3in for adult sizes, 2.5in for youth."
      off={
        <g>
          {tag(30, 8, 200, "X-LARGE", "as drawn", BAD)}
          {tag(30, 86, 132, "X-LARGE", "as drawn", BAD)}
        </g>
      }
      on={
        <g>
          {tag(30, 8, 200, "L", "3in adult", GOOD)}
          {tag(30, 86, 166, "YM", "2.5in youth", GOOD)}
        </g>
      }
    />
  );
}

/** The colours the mockup's own neck uses, copied onto the pattern's neck. */
const NECK_GOLD = "#d4a017";
const NECK_RED = "#d9534f";

function MockupNeckColor() {
  const strip = (y: number, label: string, a: string, b: string, c: string) => (
    <g>
      <Cap x={130} y={y - 6}>
        {label}
      </Cap>
      <rect x={20} y={y} width={220} height={34} rx={5} fill={FILL} stroke={OUT} strokeWidth={1.6} />
      <text x={70} y={y + 23} fontSize={13} fontWeight={700} textAnchor="middle" fill={a}>
        TIGERS
      </text>
      <text x={140} y={y + 23} fontSize={13} fontWeight={700} textAnchor="middle" fill={b}>
        2026
      </text>
      <text x={205} y={y + 23} fontSize={13} fontWeight={700} textAnchor="middle" fill={c}>
        XL
      </text>
    </g>
  );
  return (
    <Figure
      caption="Neck, Collar and Rib text takes the colour the mockup's own neck uses - fill and stroke both, read from the appearance, so text with no plain colour still comes out right. Matching is word by word: a word the mockup does not have is left exactly as the pattern drew it."
      off={
        <g>
          {strip(20, "MOCKUP NECK", NECK_GOLD, NECK_RED, TXT)}
          <path d="M130 62v16m-5-6 5 6 5-6" fill="none" stroke={LBL} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
          {strip(98, "PATTERN NECK PIECE", TXT, TXT, TXT)}
          <Cap x={130} y={152} fill={BAD}>
            stays the colour the pattern drew
          </Cap>
        </g>
      }
      on={
        <g>
          {strip(20, "MOCKUP NECK", NECK_GOLD, NECK_RED, TXT)}
          <path d="M130 62v16m-5-6 5 6 5-6" fill="none" stroke={GOOD} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
          {strip(98, "PATTERN NECK PIECE", NECK_GOLD, NECK_RED, TXT)}
          <Cap x={130} y={152} fill={GOOD}>
            matched words recoloured, XL left alone
          </Cap>
        </g>
      }
    />
  );
}

function TeamNameScale() {
  // Patterns grade wider faster than they grade taller, so a height-driven fit
  // leaves the team name covering less of the panel on every size up.
  const panel = (x: number, top: number, w: number, pct: number, size: string, tone: string) => {
    const bw = Math.round(w * pct);
    return (
      <g>
        <rect x={x} y={top} width={w} height={150 - top} rx={4} fill={FILL} stroke={OUT} strokeWidth={2} />
        <rect x={x + (w - bw) / 2} y={top + 28} width={bw} height={18} rx={2} fill={ART} opacity={0.85} />
        <Cap x={x + w / 2} y={top - 6}>
          {size}
        </Cap>
        <Cap x={x + w / 2} y={top + 66} fill={tone}>
          {`${Math.round(pct * 100)}% of the panel`}
        </Cap>
      </g>
    );
  };
  return (
    <Figure
      caption="The design is fitted by HEIGHT, so the team name keeps its height but covers less and less of the panel as sizes go up. This puts it back on the width percentage it had in the mockup, on every size - resized proportionally, top edge kept, centred on the panel. Nothing else in the design is touched."
      off={
        <g>
          {panel(8, 40, 88, 0.65, "Small", TXT)}
          {panel(116, 18, 136, 0.49, "6XL", BAD)}
        </g>
      }
      on={
        <g>
          {panel(8, 40, 88, 0.65, "Small", TXT)}
          {panel(116, 18, 136, 0.65, "6XL", GOOD)}
        </g>
      }
    />
  );
}

function PreviewRenders() {
  const row = (y: number, label: string, tone: ChipTone) => {
    const t = CHIP_TONES[tone];
    return (
      <g>
        <rect x={4} y={y} width={248} height={26} rx={6} fill={t.fill} stroke={t.stroke} strokeWidth={1.4} />
        <text x={16} y={y + 17} fontSize={9.5} fontWeight={600} fill={t.ink}>
          {label}
        </text>
      </g>
    );
  };
  return (
    <Figure
      caption="Rendering the JPEGs is most of a heavy job's runtime, so the default leaves them out. That changes nothing about the Illustrator file - every piece still sits on its own artboard and previews can be exported from it by hand later."
      offLabel="AI file only (default)"
      onLabel="AI file + JPEG previews"
      neutral
      off={
        <g>
          {row(20, "production_ready_order.ai", "base")}
          {row(54, "production_plan.json", "base")}
          {row(88, "debug_log.txt", "base")}
          <Cap x={128} y={140}>
            far smaller ZIP, job finishes much sooner
          </Cap>
        </g>
      }
      on={
        <g>
          {row(4, "production_ready_order.ai", "base")}
          {row(38, "S/Small1.jpg  ...  L/Large15.jpg", "new")}
          {row(72, "production_plan.json", "base")}
          {row(106, "debug_log.txt", "base")}
          <Cap x={128} y={152} fill={GOOD}>
            every piece rendered at 300 dpi
          </Cap>
        </g>
      }
    />
  );
}

function LogoPersonalization() {
  const marks: Record<string, ReactNode> = {
    circle: <circle cx={0} cy={0} r={17} fill={ART} opacity={0.85} />,
    triangle: <path d="M0 -18 L17 13 L-17 13 Z" fill={ART} opacity={0.85} />,
    square: <rect x={-15} y={-15} width={30} height={30} rx={3} fill={ART} opacity={0.85} />,
  };
  const card = (x: number, mark: string, excel: string, tone: string) => (
    <g>
      <rect x={x} y={10} width={74} height={92} rx={4} fill={FILL} stroke={OUT} strokeWidth={2} />
      <g transform={`translate(${x + 37},52)`}>{marks[mark]}</g>
      <rect x={x} y={112} width={74} height={22} rx={4} fill="var(--surface-3)" stroke={OUT} strokeWidth={1.2} />
      <text x={x + 37} y={127} fontSize={9} fontWeight={600} textAnchor="middle" fill={tone}>
        {excel}
      </text>
    </g>
  );
  return (
    <Figure
      caption="The logo on a part is swapped for the artwork named in that row of the Excel sheet. A name that matches nothing in the Logo Library is recorded as a warning, never guessed."
      off={
        <g>
          {card(4, "circle", "Falcon", BAD)}
          {card(93, "circle", "Tiger", BAD)}
          {card(182, "circle", "Hawk", BAD)}
          <Cap x={130} y={152} fill={BAD}>
            every piece keeps the mockup logo
          </Cap>
        </g>
      }
      on={
        <g>
          {card(4, "circle", "Falcon", GOOD)}
          {card(93, "triangle", "Tiger", GOOD)}
          {card(182, "square", "Hawk", GOOD)}
          <Cap x={130} y={152} fill={GOOD}>
            one logo per Excel row
          </Cap>
        </g>
      }
    />
  );
}

/* ---------------------------------------------------------------- registry */

/** Keyed by the exact option name used in docs chapter 06. */
export const OPTION_DIAGRAMS: Record<string, ReactNode> = {
  "Full Button Jersey": <FullButtonJersey />,
  "Center design match": <CenterMatch />,
  "Front and Back stripes match": <StripesMatch />,
  "Pattern seam match": <PatternSeamMatch />,
  Hoodie: <Hoodie />,
  "Hoodie Jersey": <HoodieJersey />,
  "Hood center design match": <HoodCenterMatch />,
  "Armhole side sleeve matching": <ArmholeMatch />,
  "Armhole correction method": <ArmholeCorrectionMode />,
  "Front and Back side seam match": <SideSeamMatch />,
  "LOCAL TAG": <LocalTag />,
  "Get mockup neck Text color": <MockupNeckColor />,
  "Team name keeps its width": <TeamNameScale />,
  "Logo personalization": <LogoPersonalization />,
  "Match sleeve bottom line to test print": <SleeveBottomLine />,
  "Design scaling": <DesignScaling />,
  "Extra parts": <ExtraParts />,
  "Preview renders": <PreviewRenders />,
};
