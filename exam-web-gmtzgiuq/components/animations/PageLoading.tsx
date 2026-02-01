'use client';

import { motion, AnimatePresence } from 'framer-motion';

interface PageLoadingProps {
  isLoading: boolean;
  text?: string;
}

export default function PageLoading({ isLoading, text = 'กำลังโหลด...' }: PageLoadingProps) {
  return (
    <AnimatePresence>
      {isLoading && (
        <motion.div
          initial={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.3 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-white"
        >
          <div className="text-center">
            {/* Animated Logo/Dots */}
            <div className="flex items-center justify-center space-x-2 mb-4">
              {[0, 1, 2].map((i) => (
                <motion.div
                  key={i}
                  className="w-4 h-4 bg-indigo-600 rounded-full"
                  initial={{ y: 0 }}
                  animate={{
                    y: [-8, 0, -8],
                  }}
                  transition={{
                    duration: 0.6,
                    repeat: Infinity,
                    delay: i * 0.1,
                    ease: 'easeInOut',
                  }}
                />
              ))}
            </div>

            {/* Text */}
            <motion.p
              className="text-gray-600 font-medium"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.2 }}
            >
              {text}
            </motion.p>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
