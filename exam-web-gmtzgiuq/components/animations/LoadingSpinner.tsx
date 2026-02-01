'use client';

import { motion } from 'framer-motion';

interface LoadingSpinnerProps {
  size?: 'sm' | 'md' | 'lg';
  color?: string;
  text?: string;
}

export default function LoadingSpinner({
  size = 'md',
  color = '#4F46E5',
  text,
}: LoadingSpinnerProps) {
  const sizes = {
    sm: { spinner: 24, stroke: 2 },
    md: { spinner: 40, stroke: 3 },
    lg: { spinner: 64, stroke: 4 },
  };

  const { spinner, stroke } = sizes[size];

  return (
    <div className="flex flex-col items-center justify-center">
      <motion.svg
        width={spinner}
        height={spinner}
        viewBox="0 0 50 50"
        initial={{ rotate: 0 }}
        animate={{ rotate: 360 }}
        transition={{
          duration: 1,
          repeat: Infinity,
          ease: 'linear',
        }}
      >
        <motion.circle
          cx="25"
          cy="25"
          r="20"
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          initial={{ pathLength: 0.2, opacity: 0.2 }}
          animate={{
            pathLength: [0.2, 0.8, 0.2],
            opacity: [0.2, 1, 0.2],
          }}
          transition={{
            duration: 1.5,
            repeat: Infinity,
            ease: 'easeInOut',
          }}
        />
      </motion.svg>
      {text && (
        <motion.p
          className="mt-3 text-gray-600"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.2 }}
        >
          {text}
        </motion.p>
      )}
    </div>
  );
}
