const DEFAULT_EXAM_TIMEZONE = 'Asia/Kolkata';
const DASHBOARD_TIMEZONE = 'Asia/Kolkata';

export const getExamTimezone = (exam) => {
  const timezone = exam?.wizard_config?.timezone;
  return typeof timezone === 'string' && timezone.trim() ? timezone : DEFAULT_EXAM_TIMEZONE;
};

export const formatExamDateTime = (value, exam, options = {}) => {
  if (!value) return 'N/A';

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'N/A';

  return date.toLocaleString('en-US', {
    timeZone: getExamTimezone(exam),
    ...options,
  });
};

export const formatExamDate = (value, exam, options = {}) => {
  if (!value) return 'N/A';

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'N/A';

  return date.toLocaleDateString('en-US', {
    timeZone: getExamTimezone(exam),
    ...options,
  });
};

export const formatExamTime = (value, exam, options = {}) => {
  if (!value) return 'N/A';

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'N/A';

  return date.toLocaleTimeString('en-US', {
    timeZone: getExamTimezone(exam),
    ...options,
  });
};

export const formatIstDateTime = (value, options = {}) => {
  if (!value) return 'N/A';

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'N/A';

  return date.toLocaleString('en-US', {
    timeZone: DASHBOARD_TIMEZONE,
    ...options,
  });
};

export const formatIstDate = (value, options = {}) => {
  if (!value) return 'N/A';

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'N/A';

  return date.toLocaleDateString('en-US', {
    timeZone: DASHBOARD_TIMEZONE,
    ...options,
  });
};

export const formatIstTime = (value, options = {}) => {
  if (!value) return 'N/A';

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'N/A';

  return date.toLocaleTimeString('en-US', {
    timeZone: DASHBOARD_TIMEZONE,
    ...options,
  });
};
