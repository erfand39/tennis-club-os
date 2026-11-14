'use client';

import type { ReactNode } from 'react';
import { MotionConfig, motion } from 'motion/react';
import { usePathname } from 'next/navigation';

const EASE_OUT: [number, number, number, number] = [0.22, 1, 0.36, 1];

export function ClubPageMotion({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  return (
    <MotionConfig reducedMotion="user">
      <motion.div
        key={pathname}
        className="club-page-motion"
        initial={{ opacity: 0, y: 4 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.16, ease: EASE_OUT }}
      >
        {children}
      </motion.div>
    </MotionConfig>
  );
}

export function AccessCardMotion({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <MotionConfig reducedMotion="user">
      <motion.section
        className={className}
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.18, ease: EASE_OUT }}
      >
        {children}
      </motion.section>
    </MotionConfig>
  );
}
