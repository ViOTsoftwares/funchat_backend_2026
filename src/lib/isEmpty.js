export const isEmpty = (value) => {
  // null or undefined
  if (value === null || value === undefined) return true;

  // string
  if (typeof value === "string") {
    return value.trim().length === 0;
  }

  // array
  if (Array.isArray(value)) {
    return value.length === 0;
  }

  // object
  if (typeof value === "object") {
    return Object.keys(value).length === 0;
  }

  return false;
};
