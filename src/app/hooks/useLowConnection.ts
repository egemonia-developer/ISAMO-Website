import { useState, useEffect } from 'react';

interface NetworkInformation extends EventTarget {
  effectiveType?: 'slow-2g' | '2g' | '3g' | '4g';
  saveData?: boolean;
}

function getConnection(): NetworkInformation | undefined {
  const nav = navigator as Navigator & {
    connection?: NetworkInformation;
    mozConnection?: NetworkInformation;
    webkitConnection?: NetworkInformation;
  };
  return nav.connection ?? nav.mozConnection ?? nav.webkitConnection;
}

function isLow(conn: NetworkInformation | undefined): boolean {
  if (!conn) return false;
  return conn.saveData === true || conn.effectiveType === 'slow-2g' || conn.effectiveType === '2g' || conn.effectiveType === '3g';
}

/** True when the Network Information API reports a slow connection or data-saver mode. */
export function useLowConnection(): boolean {
  const conn = getConnection();
  const [low, setLow] = useState(() => isLow(conn));

  useEffect(() => {
    if (!conn) return;
    const update = () => setLow(isLow(conn));
    conn.addEventListener('change', update);
    return () => conn.removeEventListener('change', update);
  }, [conn]);

  return low;
}
