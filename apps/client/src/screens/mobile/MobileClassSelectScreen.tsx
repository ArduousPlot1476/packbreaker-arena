// Mobile class-select / starter-relic screen. Ported from the M1.5b PR 1
// design board panels 7 (stage 1) + 8 (stage 2). Mobile drops the OR-SWITCH
// dimmed unselected class per visual ratification; the "CHANGE" affordance
// on the stage-2 sticky context header returns to stage 1.

import type { ClassId, RelicId } from '@packbreaker/content';
import { CLASSES, RELICS } from '@packbreaker/content';
import {
  BeginRunBtn,
  Body,
  ClassCard,
  ClassMark,
  Display,
  HEX_CLIP,
  Label,
  PanelShell,
  Pips,
  RelicCard,
} from '../class-select/atoms';
import { SignInAffordance } from '../../auth/SignInAffordance';

interface MobileClassSelectScreenProps {
  classId: ClassId | null;
  starterRelicId: RelicId | null;
  onSelectClass: (classId: ClassId) => void;
  onSelectRelic: (relicId: RelicId) => void;
  onChangeClass: () => void;
  onBeginRun: () => void;
}

const TINKER_ID = 'tinker' as ClassId;
const MARAUDER_ID = 'marauder' as ClassId;

const FONT =
  'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif';

export function MobileClassSelectScreen({
  classId,
  starterRelicId,
  onSelectClass,
  onSelectRelic,
  onChangeClass,
  onBeginRun,
}: MobileClassSelectScreenProps) {
  const stage: 1 | 2 = classId === null ? 1 : 2;
  return (
    <PanelShell>
      {/* Status placeholder row + stepper pips + optional sign-in (the
          mobile equivalent of the desktop top-right cluster; renders
          nothing when Clerk is unconfigured, so anonymous builds are
          unchanged). */}
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          height: 44,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'flex-end',
          gap: 12,
          padding: '0 22px',
        }}
      >
        <Pips stage={stage} />
        <SignInAffordance />
      </div>

      {stage === 1 ? (
        <MobileStage1 onSelectClass={onSelectClass} onBeginRun={onBeginRun} />
      ) : (
        <MobileStage2
          classId={classId!}
          starterRelicId={starterRelicId}
          onSelectRelic={onSelectRelic}
          onChangeClass={onChangeClass}
          onBeginRun={onBeginRun}
        />
      )}
    </PanelShell>
  );
}

function MobileStage1({
  onSelectClass,
  onBeginRun,
}: {
  onSelectClass: (classId: ClassId) => void;
  onBeginRun: () => void;
}) {
  return (
    <>
      {/* Header */}
      <div style={{ position: 'absolute', top: 70, left: 24, right: 24 }}>
        <Label style={{ marginBottom: 8 }}>Step 1 of 2</Label>
        <Display size={28}>Choose your class</Display>
        <Body
          size={13}
          weight={500}
          color="var(--text-secondary)"
          style={{ marginTop: 6 }}
        >
          Class shapes your bag affinity and round-start passive.
        </Body>
      </div>

      {/* Class card stack (Tinker + Marauder vertically) */}
      <div
        style={{
          position: 'absolute',
          top: 218,
          left: 24,
          right: 24,
          bottom: 100,
          display: 'flex',
          flexDirection: 'column',
          gap: 16,
          overflowY: 'auto',
        }}
      >
        <ClassCard
          klass={CLASSES[TINKER_ID]!}
          onClick={() => onSelectClass(TINKER_ID)}
          testId="class-card-tinker"
        />
        <ClassCard
          klass={CLASSES[MARAUDER_ID]!}
          onClick={() => onSelectClass(MARAUDER_ID)}
          testId="class-card-marauder"
        />
      </div>

      {/* Bottom CTA bar */}
      <div
        style={{
          position: 'absolute',
          bottom: 0,
          left: 0,
          right: 0,
          padding: '16px 20px 28px',
          background: 'var(--bg-mid)',
          borderTop: '1px solid var(--border-default)',
        }}
      >
        <BeginRunBtn enabled={false} onClick={onBeginRun} width="100%" testId="begin-run-cta" />
      </div>
    </>
  );
}

function MobileStage2({
  classId,
  starterRelicId,
  onSelectRelic,
  onChangeClass,
  onBeginRun,
}: {
  classId: ClassId;
  starterRelicId: RelicId | null;
  onSelectRelic: (relicId: RelicId) => void;
  onChangeClass: () => void;
  onBeginRun: () => void;
}) {
  const sel = CLASSES[classId]!;
  const relicIds = sel.starterRelicPool;

  return (
    <>
      {/* Slim sticky class context header */}
      <div
        style={{
          position: 'absolute',
          top: 52,
          left: 24,
          right: 24,
          background: 'var(--surface)',
          border: '1px solid var(--accent)',
          boxShadow: '0 0 24px -6px rgba(59, 130, 246, 0.33)',
          borderRadius: 10,
          padding: 14,
          display: 'flex',
          gap: 12,
          alignItems: 'center',
        }}
        data-testid="mobile-class-context"
      >
        <div
          style={{
            width: 44,
            height: 44,
            clipPath: HEX_CLIP,
            background: 'var(--bg-mid)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <ClassMark kind={sel.id} size={28} accent="var(--accent)" />
        </div>
        <div style={{ flex: 1, textAlign: 'left' }}>
          <Body size={15} weight={600} color="var(--text-primary)">
            {sel.displayName}
          </Body>
          <Body size={11} weight={500} color="var(--text-secondary)" style={{ marginTop: 2 }}>
            {sel.affinityTags.join(' · ')}
          </Body>
        </div>
        <button
          type="button"
          onClick={onChangeClass}
          data-testid="mobile-change-class"
          style={{
            background: 'transparent',
            border: '1px solid var(--border-default)',
            color: 'var(--text-secondary)',
            borderRadius: 6,
            padding: '6px 10px',
            fontFamily: FONT,
            fontSize: 11,
            fontWeight: 600,
            letterSpacing: '0.04em',
            textTransform: 'uppercase',
            cursor: 'pointer',
          }}
        >
          Change
        </button>
      </div>

      {/* Header */}
      <div style={{ position: 'absolute', top: 152, left: 24, right: 24 }}>
        <Label style={{ marginBottom: 8 }}>Step 2 of 2</Label>
        <Display size={24}>Choose your starter relic</Display>
      </div>

      {/* Relic stack (3 row cards) */}
      <div
        style={{
          position: 'absolute',
          top: 232,
          left: 24,
          right: 24,
          bottom: 108,
          display: 'flex',
          flexDirection: 'column',
          gap: 12,
          overflowY: 'auto',
        }}
      >
        {relicIds.map((rid) => {
          const relic = RELICS[rid]!;
          return (
            <RelicCard
              key={rid}
              relic={relic}
              selected={starterRelicId === rid}
              layout="row"
              onClick={() => onSelectRelic(rid)}
              testId={`relic-card-${String(rid)}`}
            />
          );
        })}
      </div>

      {/* Bottom CTA bar */}
      <div
        style={{
          position: 'absolute',
          bottom: 0,
          left: 0,
          right: 0,
          padding: '14px 20px 26px',
          background: 'var(--bg-mid)',
          borderTop: '1px solid var(--border-default)',
        }}
      >
        <BeginRunBtn
          enabled={starterRelicId !== null}
          onClick={onBeginRun}
          width="100%"
          testId="begin-run-cta"
        />
      </div>
    </>
  );
}
