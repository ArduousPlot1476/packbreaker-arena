// Class-select / starter-relic dispatcher. Owns the two-stage state
// (classId + starterRelicId) and branches between Desktop + Mobile
// orchestrators by viewport. Mounted by RunProvider when sim's createRun
// is gated on pendingRunInput (useRun.ts M1.5b PR 1 Implementation C).
//
// Mobile orchestrator ships in its own lazy chunk per the M1.3.3
// viewport-branching screen precedent, so desktop users don't parse
// mobile-only layout code.

import { lazy, Suspense, useCallback, useState } from 'react';
import type { ClassId, RelicId } from '@packbreaker/content';
import { useViewport } from '../run/useViewport';
import { DesktopClassSelectScreen } from './DesktopClassSelectScreen';

const MobileClassSelectScreen = lazy(() =>
  import('./mobile/MobileClassSelectScreen').then((m) => ({
    default: m.MobileClassSelectScreen,
  })),
);

function MobileFallback() {
  return (
    <div
      data-testid="mobile-classselect-suspense-fallback"
      style={{ width: '100%', minHeight: '100vh', background: 'var(--bg-deep)' }}
    />
  );
}

export interface ClassSelectScreenProps {
  onConfirm: (input: { classId: ClassId; startingRelicId: RelicId }) => void;
}

export function ClassSelectScreen({ onConfirm }: ClassSelectScreenProps) {
  const viewport = useViewport();
  const [classId, setClassId] = useState<ClassId | null>(null);
  const [starterRelicId, setStarterRelicId] = useState<RelicId | null>(null);

  const handleSelectClass = useCallback((newClassId: ClassId) => {
    setClassId(newClassId);
    setStarterRelicId(null);
  }, []);

  const handleSwitchClass = useCallback((newClassId: ClassId) => {
    setClassId(newClassId);
    setStarterRelicId(null);
  }, []);

  const handleChangeClass = useCallback(() => {
    setClassId(null);
    setStarterRelicId(null);
  }, []);

  const handleSelectRelic = useCallback((rid: RelicId) => {
    setStarterRelicId(rid);
  }, []);

  const handleBeginRun = useCallback(() => {
    if (classId === null || starterRelicId === null) return;
    onConfirm({ classId, startingRelicId: starterRelicId });
  }, [classId, starterRelicId, onConfirm]);

  if (viewport === 'desktop') {
    return (
      <DesktopClassSelectScreen
        classId={classId}
        starterRelicId={starterRelicId}
        onSelectClass={handleSelectClass}
        onSelectRelic={handleSelectRelic}
        onSwitchClass={handleSwitchClass}
        onBeginRun={handleBeginRun}
      />
    );
  }
  return (
    <Suspense fallback={<MobileFallback />}>
      <MobileClassSelectScreen
        classId={classId}
        starterRelicId={starterRelicId}
        onSelectClass={handleSelectClass}
        onSelectRelic={handleSelectRelic}
        onChangeClass={handleChangeClass}
        onBeginRun={handleBeginRun}
      />
    </Suspense>
  );
}
