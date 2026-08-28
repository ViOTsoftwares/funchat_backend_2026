import jwt from "jsonwebtoken";
import { UserModel } from "../models/index.js";
import { isEmpty } from "../lib/isEmpty.js";
import { ENV } from "../config/env.js";

export const userAuthMiddleware = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({
        success: false,
        message: "Access denied. No token provided",
      });
    }

    const token = authHeader.split(" ")[1];
    if (isEmpty(token)) {
      return res.status(401).json({
        success: false,
        message: "Access denied. Invalid token format",
      });
    }

    const decoded = jwt.verify(token, ENV.JWT_SECRET);
    if (!decoded || !decoded.userId) {
      return res.status(401).json({
        success: false,
        message: "Invalid token payload",
      });
    }

    const user = await UserModel.findById(decoded.userId);
    if (!user) {
      return res.status(401).json({
        success: false,
        message: "User not found",
      });
    }

    if (user.status === "banned") {
      return res.status(403).json({
        success: false,
        message: "Your account has been suspended",
      });
    }

    req.user = user;
    next();
  } catch (error) {
    return res.status(401).json({
      success: false,
      message: "Invalid or expired session. Please log in again.",
    });
  }
};
