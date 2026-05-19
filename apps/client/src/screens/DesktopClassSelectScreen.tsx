// Desktop class-select / starter-relic screen. Ported from the M1.5b PR 1
// design board panels 5 (stage 1) + 6 (stage 2). Selection recap dropped
// per Q3 disposition (b) — bottom-left of CTA row is empty space on stage 2.

import type { ClassId, RelicId } from '@packbreaker/content';
import { CLASSES, RELICS } from '@packbreaker/content';
import {
  BeginRunBtn,
  Body,
  ClassCard,
  Display,
  Label,
  PanelShell,
  Pips,
  RelicCard,
} from './class-select/atoms';

interface DesktopClassSelectScreenProps {
  classId: ClassId | null;
  starterRelicId: RelicId | null;
  onSelectClass: (classId: ClassId) => void;
  onSelectRelic: (relicId: RelicId) => void;
  onSwitchClass: (classId: ClassId) => void;
  onBeginRun: () => void;
}

const TINKER_ID = 'tinker' as ClassId;
const MARAUDER_ID = 'marauder' as ClassId;

export function DesktopClassSelectScreen({
  classId,
  starterRelicId,
  onSelectClass,
  onSelectRelic,
  onSwitchClass,
  onBeginRun,
}: DesktopClassSelectScreenProps) {
  const stage: 1 | 2 = classId === null ? 1 : 2;
  return (
    <PanelShell>
      {/* Top chrome row: wordmark (left) + stepper (right) */}
      <div
        style={{
          position: 'absolute',
          top: 28,
          left: 40,
          right: 40,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <Label>Packbreaker Arena</Label>
        <Pips stage={stage} />
      </div>

      {stage === 1 ? (
        <DesktopStage1
          onSelectClass={onSelectClass}
          onBeginRun={onBeginRun}
        />
      ) : (
        <DesktopStage2
          classId={classId!}
          starterRelicId={starterRelicId}
          onSelectRelic={onSelectRelic}
          onSwitchClass={onSwitchClass}
          onBeginRun={onBeginRun}
        />
      )}
    </PanelShell>
  );
}

function DesktopStage1({
  onSelectClass,
  onBeginRun,
}: {
  onSelectClass: (classId: ClassId) => void;
  onBeginRun: () => void;
}) {
  return (
    <>
      {/* Header */}
      <div
        style={{
          position: 'absolute',
          top: 90,
          left: 40,
          right: 40,
          textAlign: 'center',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
        }}
      >
        <Label style={{ marginBottom: 12 }}>Step 1 of 2</Label>
        <Display size={44}>Choose your class</Display>
        <Body
          size={15}
          weight={500}
          color="var(--text-secondary)"
          style={{ marginTop: 10, maxWidth: 520 }}
        >
          Your class shapes your bag affinity and your round-start passive.
        </Body>
      </div>

      {/* Class cards row */}
      <div
        style={{
          position: 'absolute',
          top: 240,
          left: 0,
          right: 0,
          display: 'flex',
          justifyContent: 'center',
          gap: 32,
        }}
      >
        <div style={{ width: 360 }}>
          <ClassCard
            klass={CLASSES[TINKER_ID]!}
            onClick={() => onSelectClass(TINKER_ID)}
            testId="class-card-tinker"
          />
        </div>
        <div style={{ width: 360 }}>
          <ClassCard
            klass={CLASSES[MARAUDER_ID]!}
            onClick={() => onSelectClass(MARAUDER_ID)}
            testId="class-card-marauder"
          />
        </div>
      </div>

      {/* Footer */}
      <div
        style={{
          position: 'absolute',
          bottom: 28,
          left: 40,
          right: 40,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <Body size={13} weight={500} color="var(--text-muted)">
          Pick a class to continue. You can&apos;t change classes mid-run.
        </Body>
        <BeginRunBtn enabled={false} onClick={onBeginRun} testId="begin-run-cta" />
      </div>
    </>
  );
}

function DesktopStage2({
  classId,
  starterRelicId,
  onSelectRelic,
  onSwitchClass,
  onBeginRun,
}: {
  classId: ClassId;
  starterRelicId: RelicId | null;
  onSelectRelic: (relicId: RelicId) => void;
  onSwitchClass: (classId: ClassId) => void;
  onBeginRun: () => void;
}) {
  const sel = CLASSES[classId]!;
  const otherId = classId === TINKER_ID ? MARAUDER_ID : TINKER_ID;
  const other = CLASSES[otherId]!;
  const relicIds = sel.starterRelicPool;

  return (
    <>
      {/* Two-column layout: condensed class column + relic column */}
      <div
        style={{
          position: 'absolute',
          top: 88,
          left: 40,
          right: 40,
          bottom: 96,
          display: 'grid',
          gridTemplateColumns: '300px 1fr',
          gap: 36,
        }}
      >
        {/* Left: class context */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <Label>Your class</Label>
          <div style={{ transform: 'scale(0.92)', transformOrigin: 'top left', width: '100%' }}>
            <ClassCard klass={sel} state="selected" size="lg" testId="selected-class-context" />
          </div>
          <div style={{ marginTop: 8 }}>
            <Label style={{ marginBottom: 8 }}>Or switch</Label>
            <div
              style={{
                transform: 'scale(0.66)',
                transformOrigin: 'top left',
                width: 360,
              }}
            >
              <ClassCard
                klass={other}
                state="dim"
                size="sm"
                onClick={() => onSwitchClass(otherId)}
                testId="or-switch-class"
              />
            </div>
          </div>
        </div>

        {/* Right: relic picker */}
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <Label style={{ marginBottom: 12 }}>Step 2 of 2</Label>
          <Display size={32} style={{ marginBottom: 6 }}>
            Choose your starter relic
          </Display>
          <Body
            size={14}
            weight={500}
            color="var(--text-secondary)"
            style={{ marginBottom: 24 }}
          >
            One {sel.displayName.toLowerCase()}-pool relic. You&apos;ll find more
            on the road.
          </Body>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(3, 1fr)',
              gap: 16,
            }}
          >
            {relicIds.map((rid) => {
              const relic = RELICS[rid]!;
              return (
                <RelicCard
                  key={rid}
                  relic={relic}
                  selected={starterRelicId === rid}
                  onClick={() => onSelectRelic(rid)}
                  testId={`relic-card-${String(rid)}`}
                />
              );
            })}
          </div>
        </div>
      </div>

      {/* Footer: bottom-left empty space (recap dropped per Q3 disposition b),
          Begin Run CTA on the right. */}
      <div
        style={{
          position: 'absolute',
          bottom: 28,
          left: 40,
          right: 40,
          display: 'flex',
          justifyContent: 'flex-end',
          alignItems: 'center',
        }}
      >
        <BeginRunBtn
          enabled={starterRelicId !== null}
          onClick={onBeginRun}
          testId="begin-run-cta"
        />
      </div>
    </>
  );
}
