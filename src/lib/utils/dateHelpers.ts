// Phase 0 utility mock

export const formatDuration = (minutes: number) => {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h > 0 && m > 0) return `${h}h ${m}m`;
  if (h > 0) return `${h}h`;
  return `${m}m`;
};

export const isWithinOperatingHours = (date: Date = new Date()) => {
  // Phase 0 mock
  const day = date.getDay();
  const hour = date.getHours();
  // Mon-Fri (1-5), 8AM to 6PM
  if (day === 0 || day === 6) return false;
  if (hour < 8 || hour >= 18) return false;
  return true;
};
