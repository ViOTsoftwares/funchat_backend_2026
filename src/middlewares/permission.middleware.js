export const adminPermission = (moduleName, action = "view") => {
  return (req, res, next) => {
    try {
      const admin = req.admin;
      if (!admin) {
        return res.status(401).json({
          success: false,
          message: "Unauthorized",
        });
      }

      if (admin.role === "superadmin") {
        return next();
      }

      const permissions = Array.isArray(admin.restriction)
        ? admin.restriction
        : [];
      const match = permissions.find(
        (p) =>
          String(p?.module || "").toLowerCase() ===
          String(moduleName).toLowerCase(),
      );

      if (!match || !match[action]) {
        return res.status(403).json({
          success: false,
          message: "Forbidden: insufficient permission",
        });
      }

      return next();
    } catch (error) {
      console.error(error);
      return res.status(500).json({
        success: false,
        message: "Something went wrong",
      });
    }
  };
};
