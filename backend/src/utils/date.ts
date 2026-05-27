export function isCurrentTimeInQuietHours(quietHoursStart: string | null | undefined, quietHoursEnd: string | null | undefined): boolean {
  if (!quietHoursStart || !quietHoursEnd) return false;

  const now = new Date();
  const currentHours = now.getHours();
  const currentMinutes = now.getMinutes();
  const currentTotalMinutes = currentHours * 60 + currentMinutes;

  const parseTime = (timeStr: string) => {
    const [hours, minutes] = timeStr.split(':').map(Number);
    return (hours || 0) * 60 + (minutes || 0);
  };

  const startTotalMinutes = parseTime(quietHoursStart);
  const endTotalMinutes = parseTime(quietHoursEnd);

  if (startTotalMinutes <= endTotalMinutes) {
    // e.g., 08:00 to 17:00
    return currentTotalMinutes >= startTotalMinutes && currentTotalMinutes < endTotalMinutes;
  } else {
    // e.g., 22:00 to 06:00 (crosses midnight)
    return currentTotalMinutes >= startTotalMinutes || currentTotalMinutes < endTotalMinutes;
  }
}
