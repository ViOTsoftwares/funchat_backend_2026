import jwt from "jsonwebtoken";
import Admin from "../models/admin.js";
import { isEmpty } from "../lib/isEmpty.js";

export const adminAuthMiddleware = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    // 1. Check token exists

    const token = authHeader.split(" ")[1];
    console.log("--------", isEmpty(token));
    if (isEmpty(token)) {
      return res.status(401).json({
        success: false,
        message: "Access denied. No token provided====",
      });
    }

    // 2. Verify token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // 3. Find admin
    const admin = await Admin.findById(decoded.id).select("-password");
    if (!admin) {
      return res.status(401).json({
        success: false,
        message: "Admin not found",
      });
    }

    // 4. Attach admin to request
    req.admin = admin;

    next();
  } catch (error) {
    console.error("Auth middleware error:", error);

    return res.status(401).json({
      success: false,
      message: "Invalid or expired token",
    });
  }
};
