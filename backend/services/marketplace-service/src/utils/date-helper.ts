export const formatEventDate = (date: Date): string => {
  const options: Intl.DateTimeFormatOptions = {
    weekday: 'short',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  };
  return new Date(date).toLocaleDateString('en-US', options);
};

export const getTimeUntilEvent = (eventDate: Date): string => {
  const now = new Date();
  const event = new Date(eventDate);
  const diff = event.getTime() - now.getTime();
  
  if (diff < 0) return 'Event has passed';
  
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  
  if (days > 0) return `${days} days, ${hours} hours`;
  if (hours > 0) return `${hours} hours`;
  
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
  return `${minutes} minutes`;
};

export const isEventStartingSoon = (eventDate: Date, hoursThreshold: number = 24): boolean => {
  const now = new Date();
  const event = new Date(eventDate);
  const diff = event.getTime() - now.getTime();
  const hoursDiff = diff / (1000 * 60 * 60);
  return hoursDiff > 0 && hoursDiff <= hoursThreshold;
};

export const calculateListingExpiry = (listedAt: Date, durationDays: number): Date => {
  const expiry = new Date(listedAt);
  expiry.setDate(expiry.getDate() + durationDays);
  return expiry;
};

export const isWithinTransferWindow = (eventDate: Date, windowHours: number = 2): boolean => {
  const now = new Date();
  const event = new Date(eventDate);
  const diff = event.getTime() - now.getTime();
  const hoursDiff = diff / (1000 * 60 * 60);
  return hoursDiff > windowHours;
};

export const formatTimestamp = (date: Date): string => {
  return new Date(date).toISOString();
};
