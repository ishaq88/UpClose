import type { ReactElement } from 'react';
import type { FreeFinding, Part1Verdict, PartSummary, PublicCoverage } from '../api/client';
import { conceptLabel, COVERAGE_LABEL, zoneTitle } from '../progress/labels';
import { describeReason } from '../progress/reasons';

/** Exact wording required for an assessed zone with no verified findings. Never "damage free". */
export const NO_FINDINGS_TEXT = 'No visible findings detected in assessed footage';

const SLOT_CLASS = 'min-h-[9rem] rounded-2xl border bg-white p-4 sm:p-5';

export interface Part1SlotProps {
  /** Part 1 as the server reports it (undefined until the first poll lands). */
  part1: PartSummary | undefined;
  verdict: Part1Verdict | null | undefined;
}

/**
 * The Part-1 free-verdict slot, rendered between the tab notice and the capture steps.
 *
 * Capture is never interrupted: the slot exists from the first render as one stable section, so when the
 * verdict arrives the section is filled in place instead of an element being inserted above the record
 * button. It is a collapsed disclosure (the user opens it), not a modal; it never takes focus, and polling
 * updates re-render text only. Free restriction: this renders only the owner-progress free DTO (Part-1
 * findings, coverage, locked zone totals); no image is ever requested from here.
 */
export function Part1Slot({ part1, verdict }: Part1SlotProps): ReactElement {
  return (
    <section aria-labelledby="free-verdict-heading" data-testid="free-verdict-slot"
      className={`${SLOT_CLASS} ${verdict ? 'border-teal-700' : 'border-dashed border-stone-300'}`}>
      {verdict ? <VerdictDisclosure verdict={verdict} /> : (
        <>
          <h2 id="free-verdict-heading" className="text-base font-semibold">Part 1 free result</h2>
          <p role="status" className="mt-1 text-sm leading-relaxed text-stone-700">{placeholderText(part1)}</p>
        </>
      )}
    </section>
  );
}

function placeholderText(part1: PartSummary | undefined): string {
  if (!part1) return 'Waiting for the service to report Part 1.';
  switch (part1.state) {
    case 'pending': return 'Appears here once the Driver side clip is uploaded and processed. Keep filming meanwhile.';
    case 'uploading': return 'The Driver side clip is still uploading.';
    case 'uploaded':
    case 'processing': return 'The Driver side clip is being processed. This result appears here when it is ready.';
    case 'processed': return 'The Driver side clip is processed; the result has not been reported yet.';
    case 'skipped': return 'Not scored. The Driver side step was skipped, so there is no free result.';
    case 'failed': return `Not scored. ${describeReason(part1.reason)}`;
  }
}

function VerdictDisclosure({ verdict }: { verdict: Part1Verdict }): ReactElement {
  const coverage = verdict.coverage[0];
  const findingCount = verdict.findings.length;
  return (
    <>
      <details>
        <summary className="flex min-h-11 cursor-pointer flex-wrap items-center justify-between gap-x-4 gap-y-1">
          <h2 id="free-verdict-heading" className="text-base font-semibold">Part 1 free result</h2>
          <span className="text-sm text-stone-800" data-testid="verdict-headline">
            {verdict.part1_score === null ? 'Not scored' : `Provisional index ${formatScore(verdict.part1_score)}`} · {findingCount} {findingCount === 1 ? 'finding' : 'findings'}
          </span>
          <span className="block w-full text-xs text-stone-600">Tap to show or hide the details. This card never moves your capture steps by itself.</span>
        </summary>
        <div className="mt-3 space-y-4">
          {isSynthetic(verdict) && (
            <p className="rounded-lg bg-amber-100 p-2 text-sm font-semibold text-amber-950" data-testid="synthetic-badge">
              Synthetic test result. No real inference was performed.
            </p>
          )}
          <ScoreBlock score={verdict.part1_score} coverage={coverage} />
          <Findings findings={verdict.findings} coverage={coverage} />
          <LockedZones zones={verdict.locked_zones} />
          <p className="text-sm leading-relaxed text-stone-800" data-testid="part1-summary">{verdict.part1_summary}</p>
          <p className="text-xs leading-relaxed text-stone-600">
            This is a provisional visual-condition screening of the Driver side only, not an inspection. It does not replace an in-person check by a qualified mechanic.
          </p>
        </div>
      </details>
    </>
  );
}

function isSynthetic(verdict: Part1Verdict): boolean {
  return /synthetic/i.test(verdict.part1_summary) || verdict.findings.some((finding) => /synthetic/i.test(finding.evidence_note));
}

/** One decimal, so a high score is never rounded up to look perfect. */
function formatScore(score: number): string {
  return score.toFixed(1);
}

function isNoFindingsReason(reason: string): boolean {
  return reason.replace(/\.$/, '').toLowerCase() === NO_FINDINGS_TEXT.toLowerCase();
}

function ScoreBlock({ score, coverage }: { score: number | null; coverage: PublicCoverage | undefined }): ReactElement {
  const reason = coverage?.reason ?? null;
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wide text-stone-600">
        Provisional visual-condition index (Part 1, {zoneTitle('driver_side')})
      </p>
      {score === null ? (
        <div>
          <p className="text-2xl font-semibold" data-testid="part1-score">Not scored</p>
          <p className="text-sm text-stone-800" data-testid="not-scored-reason">
            {reason ?? 'Coverage was not sufficient to give this zone a score. This is not a clean result.'}
          </p>
        </div>
      ) : (
        <p className="text-2xl font-semibold" data-testid="part1-score">
          {formatScore(score)} <span className="text-base font-normal text-stone-600">out of 100</span>
        </p>
      )}
      {coverage && (
        <p className="mt-1 text-sm text-stone-800" data-testid="coverage-state">
          Coverage: <span className="font-semibold">{COVERAGE_LABEL[coverage.state]}</span>
          {score !== null && reason && !isNoFindingsReason(reason) ? `. ${reason}` : ''}
        </p>
      )}
    </div>
  );
}

function Findings({ findings, coverage }: { findings: readonly FreeFinding[]; coverage: PublicCoverage | undefined }): ReactElement {
  if (findings.length === 0) {
    return coverage?.state === 'assessed'
      ? <p className="text-sm font-semibold" data-testid="no-findings">{NO_FINDINGS_TEXT}.</p>
      : <p className="text-sm" data-testid="no-findings">No findings are listed, but this zone was not fully assessed, so this is not a clean result.</p>;
  }
  return (
    <ul className="space-y-3" aria-label="Part 1 findings">
      {findings.map((finding) => (
        <li key={finding.id} className="rounded-lg border border-stone-200 p-3 text-sm" data-testid="free-finding">
          <p className="font-semibold">{conceptLabel(finding.concept)} <span className="font-normal text-stone-700">· severity {finding.severity}</span></p>
          <p className="mt-1 text-stone-800">{finding.evidence_note}</p>
          {finding.source_timestamp_ms != null && <p className="mt-1 text-xs text-stone-600">Source video: {formatSourceTime(finding.source_timestamp_ms)}. {finding.mapping_basis === 'user_declared' && 'Section marked by uploader; area coverage unverified.'}</p>}
          <p className="mt-1 text-xs text-stone-600">
            <span data-testid="confidence-label">{finding.confidence_label}</span>
            {finding.confidence === null ? null : <span>: {finding.confidence}</span>}
          </p>
          {finding.flags.length > 0 && <p className="mt-1 text-xs text-stone-600">Flags: {finding.flags.join(', ')}</p>}
          <p className="mt-1 text-xs font-semibold text-stone-700">
            {finding.evidence_available ? 'Evidence image not shown in this view' : 'Evidence image withheld'}
          </p>
        </li>
      ))}
    </ul>
  );
}

function LockedZones({ zones }: { zones: Part1Verdict['locked_zones'] }): ReactElement | null {
  if (zones.length === 0) return null;
  return (
    <div>
      <h3 className="text-sm font-semibold">Other zones (locked)</h3>
      <ul className="mt-1 space-y-1 text-sm text-stone-800">
        {zones.map((zone) => (
          <li key={zone.zone} className="flex items-center gap-2" data-testid={`locked-${zone.zone}`}>
            <LockIcon />
            <span>{zoneTitle(zone.zone)}: {zone.finding_count} {zone.finding_count === 1 ? 'finding' : 'findings'}. Details are in the full report.</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function LockIcon(): ReactElement {
  return (
    <svg role="img" aria-label="Locked" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="shrink-0">
      <rect x="5" y="11" width="14" height="9" rx="2" />
      <path d="M8 11V8a4 4 0 0 1 8 0v3" />
    </svg>
  );
}

function formatSourceTime(ms: number): string {
  return `${Math.floor(ms / 60000).toString().padStart(2, '0')}:${Math.floor((ms % 60000) / 1000).toString().padStart(2, '0')}.${Math.floor(ms % 1000).toString().padStart(3, '0')}`;
}
