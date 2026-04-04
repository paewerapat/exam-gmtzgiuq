'use client';

import { useState } from 'react';

interface UserAvatarProps {
  avatar?: string | null;
  name?: string | null;
  email?: string | null;
  size?: number; // px, e.g. 36, 44, 64, 80
  className?: string;
}

export default function UserAvatar({
  avatar,
  name,
  email,
  size = 44,
  className = '',
}: UserAvatarProps) {
  const [imgError, setImgError] = useState(false);

  const initial = (name?.[0] || email?.[0] || 'U').toUpperCase();

  const style = { width: size, height: size, minWidth: size };

  if (avatar && !imgError) {
    return (
      <img
        src={avatar}
        alt={name || 'avatar'}
        style={style}
        className={`rounded-full object-cover flex-shrink-0 ${className}`}
        onError={() => setImgError(true)}
      />
    );
  }

  return (
    <div
      style={style}
      className={`rounded-full flex-shrink-0 bg-indigo-600 flex items-center justify-center text-white font-bold ${className}`}
    >
      <span style={{ fontSize: size * 0.4 }}>{initial}</span>
    </div>
  );
}
