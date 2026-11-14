'use client';

import Image from 'next/image';
import { type ComponentType, useEffect, useState } from 'react';
import { Box, Image as ImageIcon } from 'lucide-react';
import courtHero from './styles/assets/court-hero.webp';

function hasWebGLSupport(): boolean {
  if (typeof document === 'undefined') return false;
  try {
    const canvas = document.createElement('canvas');
    return Boolean(canvas.getContext('webgl2') || canvas.getContext('webgl'));
  } catch {
    return false;
  }
}

export function AccessSceneSlot() {
  const [canShow3D, setCanShow3D] = useState(false);
  const [show3D, setShow3D] = useState(false);
  const [loading3D, setLoading3D] = useState(false);
  const [SceneComponent, setSceneComponent] = useState<ComponentType | null>(null);

  useEffect(() => {
    const media = typeof window.matchMedia === 'function'
      ? window.matchMedia('(prefers-reduced-motion: reduce)')
      : null;

    const evaluate = () => {
      const reduced = Boolean(media?.matches);
      if (reduced) {
        setCanShow3D(false);
        setShow3D(false);
        return;
      }
      setCanShow3D(hasWebGLSupport());
    };

    evaluate();
    media?.addEventListener('change', evaluate);
    return () => media?.removeEventListener('change', evaluate);
  }, []);

  async function handleEnable3D() {
    if (!canShow3D) return;
    if (SceneComponent) {
      setShow3D(true);
      return;
    }
    setLoading3D(true);
    try {
      const mod = await import('./access-scene');
      setSceneComponent(() => mod.AccessScene);
      setShow3D(true);
    } catch {
      setCanShow3D(false);
      setShow3D(false);
    } finally {
      setLoading3D(false);
    }
  }

  return (
    <>
      <div className="access-poster" aria-hidden={show3D && Boolean(SceneComponent)}>
        <Image
          src={courtHero}
          alt="زمین تنیس باشگاه سام"
          fill
          priority
          sizes="(max-width: 840px) 100vw, 55vw"
          className="access-poster-img"
          referrerPolicy="no-referrer"
        />
        <div className="access-poster-scrim" aria-hidden="true" />
      </div>

      {show3D && SceneComponent ? (
        <>
          <SceneComponent />
          <button
            type="button"
            className="access-scene-mode-btn is-static"
            onClick={() => setShow3D(false)}
          >
            <ImageIcon size={15} aria-hidden="true" />
            <span>تصویر ثابت</span>
          </button>
        </>
      ) : (
        <>
          <div className="access-scene-badge">
            <strong>باشگاه تنیس سام</strong>
            <p>سامانهٔ مدیریت باشگاه، تقویم و امور مالی</p>
          </div>
          {canShow3D && (
            <div className="access-scene-controls access-scene-optin" dir="rtl">
              <button
                type="button"
                className="access-scene-mode-btn"
                onClick={() => void handleEnable3D()}
                disabled={loading3D}
                data-testid="load-3d-scene"
              >
                <Box size={15} aria-hidden="true" />
                <span>{loading3D ? 'در حال بارگیری نمای سه‌بعدی…' : 'نمایش نمای سه‌بعدی'}</span>
              </button>
            </div>
          )}
        </>
      )}
    </>
  );
}
