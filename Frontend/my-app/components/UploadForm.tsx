"use client";

import { useState, type ReactNode } from "react";
import {
  Alert,
  CheckBox,
  Icon,
  Name,
  Panel,
  RadioDot,
  Requires,
  SectionHead,
  cn,
} from "./ui";
import type { JobResult } from "./types";
import { PLAN_API, agentFetch } from "@/lib/api";

/* --------------------------------------------------------------- atoms */

function FileDrop({
  name,
  label,
  hint,
  accept,
  required,
  multiple,
  icon,
  picked,
  onPick,
}: {
  name: string;
  label: string;
  hint: string;
  accept?: string;
  required?: boolean;
  multiple?: boolean;
  icon: ReactNode;
  picked?: string;
  onPick: (key: string, files: FileList | null) => void;
}) {
  return (
    <div className="group relative rounded-xl border border-dashed border-line-strong bg-surface-2 p-4 transition-colors hover:border-brand/60 has-[:focus-visible]:border-brand has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-brand/30">
      {/* The real input covers the whole card: click and drag-drop both work,
          and required/accept/name stay exactly as the backend expects. */}
      <input
        type="file"
        name={name}
        accept={accept}
        required={required}
        multiple={multiple}
        aria-label={label}
        onChange={(e) => onPick(name, e.target.files)}
        className="absolute inset-0 z-10 h-full w-full cursor-pointer opacity-0"
      />
      <div className="flex items-start gap-3">
        <span
          className={cn(
            "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border transition-colors",
            picked
              ? "border-ok/40 bg-ok-soft text-ok-ink"
              : "border-line bg-surface text-faint group-hover:text-brand"
          )}
        >
          {picked ? <Icon.Check className="h-4 w-4" /> : icon}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-ink">
            {label}
            {required ? (
              <span className="ml-1 text-danger">*</span>
            ) : (
              <span className="ml-1.5 text-2xs font-medium uppercase tracking-wide text-faint">
                optional
              </span>
            )}
          </p>
          <p className="mt-0.5 text-xs leading-relaxed text-muted">{hint}</p>
          <p
            className={cn(
              "mt-1.5 truncate text-xs font-medium",
              picked ? "text-ok-ink" : "text-faint"
            )}
          >
            {picked ?? "Click to browse, or drop the file here"}
          </p>
        </div>
      </div>
    </div>
  );
}

function Toggle({
  name,
  title,
  badge,
  children,
  requires,
  checked,
  onChange,
  nested,
}: {
  name?: string;
  title: string;
  badge?: string;
  children: ReactNode;
  requires?: ReactNode;
  checked?: boolean;
  onChange?: (e: React.ChangeEvent<HTMLInputElement>) => void;
  nested?: ReactNode;
}) {
  return (
    <div className="rounded-xl border border-line bg-surface transition-colors has-[:checked]:border-brand/60 has-[:checked]:bg-brand-soft/40">
      <label className="flex cursor-pointer gap-3 p-4">
        <CheckBox
          name={name}
          value={name ? "true" : undefined}
          checked={checked}
          onChange={onChange}
          className="mt-0.5"
        />
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-semibold text-ink">{title}</span>
            {badge && (
              <span className="rounded-full border border-line bg-surface-2 px-2 py-0.5 text-2xs font-semibold uppercase tracking-wide text-muted">
                {badge}
              </span>
            )}
          </span>
          <span className="mt-1 block text-xs leading-relaxed text-muted">{children}</span>
          {requires && <Requires>{requires}</Requires>}
        </span>
      </label>
      {nested}
    </div>
  );
}

function Nested({ children }: { children: ReactNode }) {
  return (
    <div className="animate-fade-up border-t border-line/70 bg-surface-2/60 px-4 py-3">
      <p className="mb-2.5 text-2xs font-bold uppercase tracking-[0.16em] text-faint">
        Options for this mode
      </p>
      <div className="space-y-2.5">{children}</div>
    </div>
  );
}

function RadioCard({
  name,
  value,
  title,
  children,
  defaultChecked,
}: {
  name: string;
  value: string;
  title: ReactNode;
  children: ReactNode;
  defaultChecked?: boolean;
}) {
  return (
    <label className="flex cursor-pointer gap-3 rounded-lg border border-line bg-surface p-3 transition-colors hover:border-line-strong has-[:checked]:border-brand/60 has-[:checked]:bg-brand-soft/50">
      <RadioDot name={name} value={value} defaultChecked={defaultChecked} className="mt-0.5" />
      <span className="min-w-0">
        <span className="block text-sm font-semibold text-ink">{title}</span>
        <span className="mt-0.5 block text-xs leading-relaxed text-muted">{children}</span>
      </span>
    </label>
  );
}

function Section({
  step,
  title,
  hint,
  icon,
  children,
}: {
  step: string;
  title: string;
  hint: string;
  icon: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="space-y-4 px-5 py-6 sm:px-7">
      <SectionHead step={step} title={title} hint={hint} icon={icon} />
      {children}
    </section>
  );
}

/* ---------------------------------------------------------------- form */

export default function UploadForm({
  onPlanGenerated,
  jobRunning = false,
}: {
  onPlanGenerated: (plan: JobResult) => void;
  /** A job from this session is still rendering. Illustrator can only build
   *  one order at a time, so a second start is blocked here as well as by the
   *  backend's own lock. */
  jobRunning?: boolean;
}) {
  const [loading, setLoading] = useState(false);
  // Which half of the submit is in flight - the two take very different times
  // (a model call, then a local file copy), so saying which is honest feedback
  // rather than one spinner covering both.
  const [step, setStep] = useState<"plan" | "send" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [logoEnabled, setLogoEnabled] = useState(false);
  const [fullButtonJerseyEnabled, setFullButtonJerseyEnabled] = useState(false);
  const [armholeMatchEnabled, setArmholeMatchEnabled] = useState(false);
  const [hoodieEnabled, setHoodieEnabled] = useState(false);
  const [picked, setPicked] = useState<Record<string, string>>({});

  const onPick = (key: string, files: FileList | null) => {
    setPicked((prev) => {
      const next = { ...prev };
      if (!files || files.length === 0) delete next[key];
      else if (files.length === 1) next[key] = files[0].name;
      else next[key] = `${files.length} files selected`;
      return next;
    });
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setStep(null);

    const formData = new FormData(e.currentTarget);

    try {
      // Ask before uploading, not after. The agent rejects a second job with a
      // 409 either way, but the multipart body - pattern.ai alone is ~135MB -
      // is fully transferred before the handler ever runs. This also covers the
      // case `jobRunning` cannot see: a page refresh mid-job, which wipes the
      // browser's own state while the agent keeps rendering.
      const busy = await agentFetch("/jobs/running")
        .then((r) => r.json())
        .then((d) => d.job_id as string | null)
        .catch(() => null); // agent unreachable - AgentStatus already says so
      if (busy) {
        throw new Error(
          `Job "${busy}" is still running. Illustrator can only build one order at a time - wait for it to finish, or stop it, then start this one.`
        );
      }

      // STEP 1 - the cloud plans. Only the Excel and the checkboxes go; a few
      // hundred KB, twenty seconds or so with the model call.
      setStep("plan");
      const planForm = new FormData();
      planForm.append("excel_file", formData.get("excel_file") as File);
      for (const [key, value] of formData.entries()) {
        if (key === "excel_file" || key === "mockup_ai" || key === "pattern_ai") continue;
        if (key === "logo_library_ai" || key === "fonts") continue;
        planForm.append(key, value);
      }

      const planRes = await fetch(PLAN_API, { method: "POST", body: planForm });
      if (!planRes.ok) {
        const err = await planRes.json().catch(() => ({}));
        throw new Error(err.detail || "Could not read the order sheet and build a plan.");
      }
      const { production_plan: plan } = await planRes.json();

      // STEP 2 - the agent renders. THE .ai FILES GO HERE, NOT TO THE CLOUD.
      // This is a copy from one folder to another on the same machine, which
      // is why a 135MB pattern costs nothing.
      setStep("send");
      const jobForm = new FormData();
      jobForm.append("job_name", formData.get("job_name") as string);
      jobForm.append("plan_json", JSON.stringify(plan));
      jobForm.append("pattern_ai", formData.get("pattern_ai") as File);
      jobForm.append("mockup_ai", formData.get("mockup_ai") as File);
      const logo = formData.get("logo_library_ai");
      if (logo instanceof File && logo.size > 0) jobForm.append("logo_library_ai", logo);
      for (const font of formData.getAll("fonts")) {
        if (font instanceof File && font.size > 0) jobForm.append("fonts", font);
      }

      const jobRes = await agentFetch("/jobs", { method: "POST", body: jobForm });
      if (!jobRes.ok) {
        const err = await jobRes.json().catch(() => ({}));
        throw new Error(err.detail || "The agent could not start the job.");
      }
      const job = await jobRes.json();
      onPlanGenerated({ ...job, production_plan: plan });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
      setStep(null);
    }
  };

  return (
    <form onSubmit={handleSubmit} noValidate={false}>
      <Panel className="overflow-hidden">
        {/* --------------------------------------------- 1 · job name */}
        {/* Deliberately the FIRST thing on the form: the name decides the job
            folder, the render folder inside it and the job id, so the user
            names the order before touching anything else. */}
        <Section
          step="01"
          title="Job name"
          hint="Name this order first - everything it produces is filed under this name."
          icon={<Icon.Type className="h-4 w-4" />}
        >
          <div>
            <label htmlFor="job_name" className="mb-1.5 block text-sm font-semibold text-ink">
              Order Name{" "}
              <span className="text-2xs font-medium uppercase tracking-wide text-brand">
                required
              </span>
            </label>
            <input
              id="job_name"
              type="text"
              name="job_name"
              required
              autoFocus
              maxLength={60}
              placeholder="e.g. Kings Club Order"
              className="w-full rounded-lg border border-line bg-surface-2 px-3 py-2.5 text-sm text-ink placeholder:text-faint focus:border-brand focus:bg-surface focus:outline-none"
            />
            <p className="mt-1.5 text-xs leading-relaxed text-muted">
              Names the job folder, the render folder inside it and the download. Spaces and
              punctuation become <code>_</code>; a repeated name gets a <code>-2</code> suffix so an
              earlier job is never overwritten.
            </p>
          </div>
        </Section>

        <div className="h-px bg-line" />

        {/* ------------------------------------------------ 2 · files */}
        <Section
          step="02"
          title="Production files"
          hint="The three files every job needs, plus any fonts the mockup uses."
          icon={<Icon.Upload className="h-4 w-4" />}
        >
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <FileDrop
              name="excel_file"
              label="Orders Excel"
              hint=".xlsx, one row per piece"
              accept=".xlsx"
              required
              icon={<Icon.Sheet className="h-4 w-4" />}
              picked={picked["excel_file"]}
              onPick={onPick}
            />
            <FileDrop
              name="mockup_ai"
              label="Design Mockup"
              hint=".ai, the test print with named layers"
              accept=".ai"
              required
              icon={<Icon.Shirt className="h-4 w-4" />}
              picked={picked["mockup_ai"]}
              onPick={onPick}
            />
            <FileDrop
              name="pattern_ai"
              label="Master Pattern"
              hint=".ai, graded cut pieces per size"
              accept=".ai"
              required
              icon={<Icon.Pattern className="h-4 w-4" />}
              picked={picked["pattern_ai"]}
              onPick={onPick}
            />
            <FileDrop
              name="fonts"
              label="Required Fonts"
              hint="Any font the mockup uses that isn't installed on this PC"
              multiple
              icon={<Icon.Type className="h-4 w-4" />}
              picked={picked["fonts"]}
              onPick={onPick}
            />
          </div>

          <div>
            <label
              htmlFor="user_instructions"
              className="mb-1.5 block text-sm font-semibold text-ink"
            >
              Special instructions{" "}
              <span className="text-2xs font-medium uppercase tracking-wide text-faint">
                optional
              </span>
            </label>
            <input
              id="user_instructions"
              type="text"
              name="user_instructions"
              placeholder="e.g. Short Sleeve / Long Sleeve"
              className="w-full rounded-lg border border-line bg-surface-2 px-3 py-2.5 text-sm text-ink placeholder:text-faint focus:border-brand focus:bg-surface focus:outline-none"
            />
          </div>
        </Section>

        <div className="h-px bg-line" />

        {/* ----------------------------------------- 3 · garment type */}
        <Section
          step="03"
          title="Garment type"
          hint="Leave both off for a normal jersey. Each type adds its own pieces and its own matching options."
          icon={<Icon.Shirt className="h-4 w-4" />}
        >
          <div className="rounded-xl border border-line bg-surface p-4">
            <p className="text-sm font-semibold text-ink">Extra parts</p>
            <p className="mt-1 text-xs leading-relaxed text-muted">
              Check only the parts this order includes. They are added to the plan and looked up in
              the pattern/mockup files.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {[
                { name: "include_placket", label: "Placket" },
                { name: "include_twill_tape", label: "Twill Tape" },
                { name: "include_tukdi", label: "Tukdi" },
              ].map((p) => (
                <label
                  key={p.name}
                  className="flex cursor-pointer items-center gap-2 rounded-lg border border-line bg-surface-2 px-3 py-2 text-sm font-medium text-ink transition-colors hover:border-line-strong has-[:checked]:border-brand/60 has-[:checked]:bg-brand-soft has-[:checked]:text-brand-ink"
                >
                  <CheckBox name={p.name} value="true" />
                  {p.label}
                </label>
              ))}
            </div>
          </div>

          <Toggle
            name="full_button_jersey"
            title="Full Button Jersey"
            checked={fullButtonJerseyEnabled}
            onChange={(e) => setFullButtonJerseyEnabled(e.target.checked)}
            requires={
              <>
                Mockup groups named <Name>Front Left</Name> and <Name>Front Right</Name>.
              </>
            }
            nested={
              fullButtonJerseyEnabled ? (
                <Nested>
                  <Toggle
                    name="full_button_center_match"
                    title="Center design match"
                    requires={
                      <>
                        A group/layer named exactly <Name>Center</Name> in the mockup, with the same
                        name on both sides.
                      </>
                    }
                  >
                    Joins a design that crosses the button placket seam so it lines up across
                    Front Left and Front Right.
                  </Toggle>

                  <Toggle
                    name="full_button_front_back_match"
                    title="Front/Back stripes match"
                    requires={
                      <>
                        A shape whose name starts with <Name>Match_</Name>, present on{" "}
                        <strong>both</strong> Front Left and Back. Front Left is measured,
                        Back is adjusted. If the name is missing the job still runs and Back
                        is left alone.
                      </>
                    }
                  >
                    Aligns the Back stripes design to the position of Front Left&apos;s /
                    Right&apos;s stripes.
                  </Toggle>

                  <Toggle
                    name="full_button_pattern_match"
                    title="Pattern seam match"
                    requires={
                      <>
                        A group/layer named exactly <Name>Pattern</Name> on both sides, with no
                        size-guessing fallback, so the name must be exact.
                      </>
                    }
                  >
                    Shifts the striped/background pattern on Front Left and Front Right so it
                    stays continuous across the placket seam.
                  </Toggle>
                </Nested>
              ) : null
            }
          >
            Front is two separate pieces (Front Left / Front Right) and adds a Patti (button
            strip) sized per size.
          </Toggle>

          <Toggle
            name="hoodie"
            title="Hoodie"
            checked={hoodieEnabled}
            onChange={(e) => setHoodieEnabled(e.target.checked)}
            requires={
              <>
                Pattern: a <Name>Hood</Name> group (with <Name>Left</Name>/<Name>Right</Name>{" "}
                children), a <Name>Pocket</Name> and a <Name>Border</Name>. Mockup:{" "}
                <Name>Outside Hood</Name> / <Name>Inside Hood</Name> groups (each with
                Left/Right children) and a Border design group. Missing any of these pauses the
                job before it starts.
              </>
            }
            nested={
              hoodieEnabled ? (
                <Nested>
                  <Toggle
                    name="hoodie_center_design_match"
                    title="Hood center design match"
                    requires={
                      <>
                        In the mockup&apos;s <Name>Outside Hood</Name> group, name the shared
                        design <Name>Center</Name> in <strong>both</strong> the Right and Left
                        halves. The Right one is kept and re-centered across the seam. Missing
                        either pauses the job. Inside Hood is not matched.
                      </>
                    }
                  >
                    Lines up a design that crosses the hood&apos;s center seam across the
                    Outside Hood&apos;s two halves, using a <strong>19mm</strong> simulated
                    sewing overlap (14mm sewing + the 5mm gap), the same for every size. The
                    exported cut pieces keep the pattern&apos;s own shape and orientation.
                  </Toggle>
                </Nested>
              ) : null
            }
          >
            Runs the normal Front/Back/Sleeve flow and additionally builds Outside Hood, Inside
            Hood, Border and a Pocket.
          </Toggle>
        </Section>

        <div className="h-px bg-line" />

        {/* ------------------------------------ 4 · scaling & matching */}
        <Section
          step="04"
          title="Design placement & seam matching"
          hint="How the mockup art is fitted onto each panel, and which seams have to line up when the pieces are sewn."
          icon={<Icon.Ruler className="h-4 w-4" />}
        >
          {/* Job-wide: applies to Full Button Jersey, Hoodie and normal jerseys alike. */}
          <div className="rounded-xl border border-line bg-surface p-4">
            <p className="text-sm font-semibold text-ink">Design scaling</p>
            <p className="mt-1 text-xs leading-relaxed text-muted">
              How the mockup design is fitted onto each pattern panel. Applies to every job type:
              Full Button Jersey, Hoodie and normal jerseys.
            </p>
            <div className="mt-3 space-y-2.5">
              <RadioCard
                name="design_scale_mode"
                value="height"
                defaultChecked
                title={
                  <>
                    Height scales proportionally only{" "}
                    <span className="font-normal text-faint">(default)</span>
                  </>
                }
              >
                One scale amount, taken from height, applied to both directions, so the design
                keeps its original proportions and is centered on the panel. Anything wider than
                the panel is trimmed at the panel edge. On a Full Button Jersey, Front Left,
                Front Right and Back share one common scale (driven by Back) so the three panels
                stay consistent across the placket seam.
              </RadioCard>
              <RadioCard
                name="design_scale_mode"
                value="height_sides"
                title="Height scales proportionally, sides kept perfect"
              >
                The same proportional height fit, and then any Front or Back artwork you marked{" "}
                <Name>side</Name> in the mockup is moved back onto its own side seam. A
                proportional fit cannot widen the design to the panel, so side-seam artwork would
                otherwise float in the middle. Which seam a piece belongs to is read from the
                mockup. The artwork is only moved sideways, never stretched or resized.
                <span className="mt-1.5 block text-faint">
                  Mark it by layer name. If that name is already taken by another feature, for
                  example an <Name>unit 1</Name> used by armhole matching, write{" "}
                  <Name>side</Name> in the object&apos;s Note instead (Illustrator&apos;s
                  Attributes panel). The name is checked first, the note second.
                </span>
              </RadioCard>
            </div>
          </div>

          <Toggle
            name="match_sleeve_to_side"
            title="Armhole side sleeve matching"
            checked={armholeMatchEnabled}
            onChange={(e) => setArmholeMatchEnabled(e.target.checked)}
            requires={
              <>
                In the mockup, group the design(s) to match as <Name>armhole match</Name> and
                name each piece inside it <Name>unit 1</Name>, <Name>unit 2</Name>, etc. The{" "}
                <strong>Back</strong> view and <strong>each sleeve</strong> view need this group;
                pieces are paired by name (unit 1 ↔ unit 1). Where one side is a separate shape
                (typically on a sleeve), name the two pieces <Name>unit left 1</Name> /{" "}
                <Name>unit right 1</Name>: both still pair with the body&apos;s{" "}
                <Name>unit 1</Name> and are placed on their own side. Only the Back panel&apos;s
                right side is measured, and it is mirrored to the left automatically.
              </>
            }
            nested={
              armholeMatchEnabled ? (
                <div className="animate-fade-up border-t border-line/70 bg-surface-2/60 px-4 py-3">
                  <p className="mb-2.5 text-2xs font-bold uppercase tracking-[0.16em] text-faint">
                    How should a design be corrected onto its target?
                  </p>
                  <div className="space-y-2.5">
                    <RadioCard
                      name="sleeve_match_mode"
                      value="auto"
                      defaultChecked
                      title={
                        <>
                          Auto <span className="font-normal text-faint">(default)</span>
                        </>
                      }
                    >
                      The machine decides: a &quot;unit left/right&quot; piece slides sideways, a
                      centered &quot;unit 1&quot; slides up/down, and either is resized only when
                      sliding cannot close the gap.
                    </RadioCard>
                    <RadioCard
                      name="sleeve_match_mode"
                      value="horizontal"
                      title="Left/right move only"
                    >
                      Pieces are slid sideways (either direction) and nothing else. No up/down, no
                      resizing, so every shape stays exactly as drawn.
                    </RadioCard>
                    <RadioCard name="sleeve_match_mode" value="vertical" title="Up/down move only">
                      Pieces are slid up or down and nothing else. No sideways, no resizing.
                    </RadioCard>
                    <RadioCard name="sleeve_match_mode" value="resize" title="Resize only">
                      The piece is scaled proportionally, smaller or larger, and never moved.
                    </RadioCard>
                  </div>
                  <p className="mt-2.5 text-xs leading-relaxed text-muted">
                    Anything the chosen method cannot fix is left untouched and reported at the
                    end, never &quot;fixed&quot; a different way.
                  </p>
                </div>
              ) : null
            }
          >
            Align side-panel designs across the armhole seam so the body and sleeve meet exactly
            when sewn. Parts that can&apos;t be matched are rendered normally and reported at the
            end.
          </Toggle>

          <Toggle
            name="front_back_side_match"
            title="Front/Back side-seam match"
            requires={
              <>
                Name the shared design <Name>Front side match</Name> +{" "}
                <Name>Back side match</Name> for one seam only (Front&apos;s right edge to
                Back&apos;s left edge), or use <Name>Front Left side match</Name> /{" "}
                <Name>Front Right side match</Name> with matching{" "}
                <Name>Back Right side match</Name> / <Name>Back Left side match</Name> to match
                both side seams independently. Missing all of these name pairs pauses the job
                before it starts.
              </>
            }
          >
            Joins a design that crosses the torso side seam so it lines up across Front and Back
            (14mm simulated sewing overlap).
          </Toggle>

          <Toggle
            name="preserve_sleeve_rib_distance"
            title="Match sleeve bottom line to test print"
          >
            Keeps the rib/cuff line&apos;s distance from the sleeve bottom, and its height, the
            same as the test print (mockup) instead of a fixed size. Leave unchecked to let it
            scale normally with the rest of the design.
          </Toggle>
        </Section>

        <div className="h-px bg-line" />

        {/* -------------------------------------- 5 · personalization */}
        <Section
          step="05"
          title="Personalization & tags"
          hint="Per-row text and artwork coming from the Excel sheet, plus the size tag."
          icon={<Icon.Type className="h-4 w-4" />}
        >
          <Toggle
            name="local_tag_enabled"
            title="LOCAL TAG"
            requires={
              <>
                A mockup group named exactly <Name>LOCAL TAG</Name> with a text frame named{" "}
                <Name>SIZE</Name> inside it. Applies to every job type. Missing either name
                pauses the job before it starts.
              </>
            }
          >
            Personalizes the size-tag letter and pins its bordered box to a fixed width:{" "}
            <strong>3in for adult sizes</strong> (XS, S, M, L, XL, 2XL…) and{" "}
            <strong>2.5in for youth sizes</strong> (YXS, YS, YM, YL, YXL).
          </Toggle>

          <Toggle
            name="neck_contrast"
            title="Neck contrast text"
            requires={
              <>
                Nothing extra in the files. It judges the neck panel&apos;s own fill, so the neck
                design group needs its <Name>base-path</Name> like every other part.
              </>
            }
          >
            Forces the text and any <Name>label</Name> / <Name>size</Name> / <Name>logo</Name> shape
            on the Neck, Collar and Rib pieces to pure white or pure black, whichever reads against
            that panel&apos;s color. Leave unchecked to keep every color the mockup and pattern drew.
          </Toggle>

          <Toggle
            title="Logo personalization"
            badge="needs a logo library"
            checked={logoEnabled}
            onChange={(e) => setLogoEnabled(e.target.checked)}
            requires={
              <>
                Each logo must be its own named group/layer in the library file below, and the
                name must match the Excel value exactly (case and spacing don&apos;t matter).
              </>
            }
            nested={
              logoEnabled ? (
                <div className="animate-fade-up border-t border-line/70 bg-surface-2/60 px-4 py-3">
                  <FileDrop
                    name="logo_library_ai"
                    label="Logo Library"
                    hint=".ai, one file holding every named logo"
                    accept=".ai"
                    required
                    icon={<Icon.Layers className="h-4 w-4" />}
                    picked={picked["logo_library_ai"]}
                    onPick={onPick}
                  />
                </div>
              ) : null
            }
          >
            Check this if the Excel sheet has a Logo column (Front/Back/Neck/Sleeve Logo) with
            values.
          </Toggle>
        </Section>

        {/* ------------------------------------------------- submit bar */}
        <div className="space-y-3 border-t border-line bg-surface-2 px-5 py-5 sm:px-7">
          {error && (
            <Alert tone="danger" title="Upload failed">
              <p>{error}</p>
              <p className="text-xs opacity-80">
                Check that the backend is running on{" "}
                <code className="font-mono">localhost:8765</code> and that the plan service is
                reachable, then try again.
              </p>
            </Alert>
          )}

          <button
            type="submit"
            disabled={loading || jobRunning}
            aria-busy={loading}
            className={cn(
              "relative w-full overflow-hidden rounded-xl px-5 py-3.5 text-sm font-bold text-white transition-all",
              loading
                ? "animate-sheen cursor-not-allowed bg-faint"
                : jobRunning
                  ? "cursor-not-allowed bg-faint"
                  : "bg-gradient-to-r from-brand to-accent shadow-[0_10px_30px_-12px_var(--brand)] hover:brightness-110 active:scale-[0.995]"
            )}
          >
            <span className="relative z-10 flex items-center justify-center gap-2.5">
              {loading ? (
                <>
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
                  {step === "send"
                    ? "Sending files to the agent…"
                    : "Reading the order sheet & building the plan…"}
                </>
              ) : jobRunning ? (
                <>
                  <Icon.Clock className="h-4 w-4" />
                  A job is already rendering…
                </>
              ) : (
                <>
                  <Icon.Spark className="h-4 w-4" />
                  Start AI Orchestration
                </>
              )}
            </span>
          </button>

          {jobRunning && (
            <p className="mt-2 text-center text-xs text-muted">
              Illustrator can only build one order at a time. The progress panel below shows the
              running job.
            </p>
          )}

          <p className="text-center text-xs text-faint">
            Illustrator is opened and driven by the job, so keep it closed before you start.
          </p>
        </div>
      </Panel>
    </form>
  );
}
