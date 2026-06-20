export const Pagination = ({ page = 1, limit = 10 }) => {
  page = Number(page);
  limit = Number(limit);

  const skip = (page - 1) * limit;

  return { page, limit, skip };
};
