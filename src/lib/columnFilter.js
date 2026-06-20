export const ColumnFilter = (data = {}) => {
  const filter = {};

  Object.entries(data).forEach(([key, value]) => {
    if (!value) return;
    const field = key.replace("fs_", "");

    // TEXT FILTER (fs_)
    if (key.replace("fs_", "") === "status") {
      filter[field] = value;
    } else {
      filter[field] = { $regex: value, $options: "i" };
    }

    // NUMBER FILTER (fn_)
    if (key.startsWith("fn_")) {
      filter[field] = Number(value);
    }

    // DATE FILTER (fd_)
    if (key.startsWith("fd_")) {
      const field = key.replace("fd_", "");
      filter[field] = new Date(value);
    }
  });

  return filter;
};
