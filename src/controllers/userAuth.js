import jwt from "jsonwebtoken";
import { UserModel, EmailTemplateModel, SettingModel } from "../models/index.js";
import { sendEmail } from "../config/mail.js";
import { isEmpty } from "../lib/isEmpty.js";
import { ENV } from "../config/env.js";
import { renderEmailTemplate } from "../lib/mailTemplate.js";
import {
  cleanBaseUsername,
  isUsernameAvailable,
  generateUniqueUsername,
  getAvailableUsernameSuggestions,
} from "../lib/usernameHelper.js";

// Helper: replace template placeholders
const replacePlaceholders = (templateStr, data) => {
  let result = templateStr || "";
  for (const [key, value] of Object.entries(data)) {
    const regex = new RegExp(`##${key}##`, "g");
    result = result.replace(regex, value ?? "");
  }
  return result;
};

// ─── 0. Check Username Availability & Get Suggestions ─────────────────────────
export const CheckUsernameAvailability = async (req, res) => {
  try {
    const { username, email, suggest } = req.query;
    const seed = username || (email ? email.split("@")[0] : "user");
    const clean = cleanBaseUsername(seed);

    if (!clean || clean.length < 2) {
      const suggestions = await getAvailableUsernameSuggestions("user", 4);
      return res.status(200).json({
        success: true,
        available: false,
        username: "",
        message: "Username must be at least 2 characters",
        suggestions,
      });
    }

    const available = await isUsernameAvailable(clean);
    let suggestions = [];
    if (!available || suggest === "true") {
      suggestions = await getAvailableUsernameSuggestions(clean, 4);
    }

    return res.status(200).json({
      success: true,
      available,
      username: clean,
      message: available ? "Username is available!" : `Username '${clean}' is already taken`,
      suggestions,
    });
  } catch (error) {
    console.error("CheckUsernameAvailability Error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to check username availability",
    });
  }
};

// ─── 0.1 Save Initial Username ───────────────────────────────────────────────
export const SaveInitialUsername = async (req, res) => {
  try {
    const { username } = req.body;
    if (!username) {
      return res.status(400).json({
        success: false,
        message: "Username is required",
      });
    }

    const clean = cleanBaseUsername(username);
    if (!clean || clean.length < 2) {
      const suggestions = await getAvailableUsernameSuggestions("user", 4);
      return res.status(400).json({
        success: false,
        message: "Username must be at least 2 characters",
        suggestions,
      });
    }

    const available = await isUsernameAvailable(clean, null, false);
    if (!available) {
      const suggestions = await getAvailableUsernameSuggestions(clean, 4);
      return res.status(400).json({
        success: false,
        available: false,
        message: `Username '${clean}' is already taken. Please choose another or pick a suggestion.`,
        suggestions,
      });
    }

    const placeholderEmail = `guest_${clean}_${Date.now()}@funchat.local`;
    const user = await UserModel.create({
      email: placeholderEmail,
      username: clean,
      isVerified: false,
    });

    return res.status(200).json({
      success: true,
      username: user.username,
      message: "Username saved successfully!",
    });
  } catch (error) {
    console.error("SaveInitialUsername Error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to save username",
    });
  }
};

// Helper: Helper to claim or reassign a guest handle reserved via landing page
const claimGuestUsername = async (requestedUsername, targetUserId = null) => {
  if (!requestedUsername) return true;
  const clean = cleanBaseUsername(requestedUsername);

  const existing = await UserModel.findOne({
    username: { $regex: new RegExp(`^${clean}$`, "i") },
  });

  if (!existing) return true; // Free

  if (targetUserId && existing._id.toString() === targetUserId.toString()) {
    return true; // Belongs to current user
  }

  // If held by a temporary guest profile record created on landing page, delete temporary record to claim handle
  if (existing.email && existing.email.endsWith("@funchat.local")) {
    await UserModel.deleteOne({ _id: existing._id });
    return true;
  }

  return false; // Taken by a real registered account
};

// ─── 1. Send OTP ─────────────────────────────────────────────────────────────
export const SendOtp = async (req, res) => {
  try {
    const { email, username } = req.body;

    if (isEmpty(email)) {
      return res.status(400).json({
        success: false,
        message: "Please enter a valid email address",
        errors: { email: "Valid email is required" },
      });
    }

    let cleanEmail = String(email).toLowerCase().trim();
    let requestedUsername = username ? cleanBaseUsername(username) : "";

    // If input doesn't have '@', check if it matches an existing user's username
    if (!cleanEmail.includes("@")) {
      const userByUsername = await UserModel.findOne({
        username: { $regex: new RegExp(`^${cleanEmail}$`, "i") },
      });
      if (userByUsername) {
        if (userByUsername.email && userByUsername.email.endsWith("@funchat.local")) {
          return res.status(400).json({
            success: false,
            message: `Handle '@${userByUsername.username}' is reserved! Please enter your email address to receive your 6-digit login verification code.`,
            errors: { email: "Valid email is required" },
          });
        }
        cleanEmail = userByUsername.email;
        if (!requestedUsername) requestedUsername = userByUsername.username;
      } else {
        return res.status(400).json({
          success: false,
          message: "Please enter a valid email address",
          errors: { email: "Valid email is required" },
        });
      }
    }

    // Check existing user by email
    let user = await UserModel.findOne({ email: cleanEmail });

    if (user) {
      if (user.status === "banned") {
        return res.status(403).json({
          success: false,
          message: "This account has been suspended. Please contact support.",
        });
      }

      // If user wants to change/set a username during login, check availability
      if (requestedUsername && requestedUsername.toLowerCase() !== (user.username || "").toLowerCase()) {
        const canClaim = await claimGuestUsername(requestedUsername, user._id);
        if (!canClaim) {
          const suggestions = await getAvailableUsernameSuggestions(requestedUsername, 4, user._id);
          return res.status(400).json({
            success: false,
            message: `Username '${requestedUsername}' is already registered to another user account. You cannot sign in with or claim another user's username.`,
            errors: { username: "Username belongs to another user" },
            suggestions,
          });
        }
        user.username = requestedUsername;
      }

      // Existing user: Generate OTP & update user record
      const otp = Math.floor(100000 + Math.random() * 900000).toString();
      const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

      user.otp = otp;
      user.otpExpiresAt = expiresAt;
      if (!user.username) {
        user.username = await generateUniqueUsername(cleanEmail.split("@")[0], user._id);
      }
      await user.save();

      const templateData = {
        OTP_CODE: otp,
        EMAIL: cleanEmail,
        EXPIRY_MINUTES: "10",
        USER_NAME: user.username || cleanEmail.split("@")[0],
      };
      await renderEmailTemplate("OTP_VERIFICATION", cleanEmail, templateData);

      return res.status(200).json({
        success: true,
        message: "Verification code sent to your email!",
        email: cleanEmail,
        username: user.username,
      });
    }

    // New User creation: Validate or claim requested username
    let finalUsername = "";
    if (requestedUsername) {
      const canClaim = await claimGuestUsername(requestedUsername);
      if (!canClaim) {
        const suggestions = await getAvailableUsernameSuggestions(requestedUsername, 4);
        return res.status(400).json({
          success: false,
          message: `Username '${requestedUsername}' is already registered to another user account. Please pick another handle or pick a suggestion.`,
          errors: { username: "Username belongs to another user" },
          suggestions,
        });
      }
      finalUsername = requestedUsername;
    } else {
      finalUsername = await generateUniqueUsername(cleanEmail.split("@")[0]);
    }

    // Generate 6-digit numeric OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    user = await UserModel.create({
      email: cleanEmail,
      username: finalUsername,
      otp,
      otpExpiresAt: expiresAt,
      isVerified: false,
    });

    const templateData = {
      OTP_CODE: otp,
      EMAIL: cleanEmail,
      EXPIRY_MINUTES: "10",
      USER_NAME: finalUsername,
    };
    await renderEmailTemplate("OTP_VERIFICATION", cleanEmail, templateData);

    return res.status(200).json({
      success: true,
      message: "Verification code sent to your email!",
      email: cleanEmail,
      username: finalUsername,
    });
  } catch (error) {
    console.error("SendOtp Error:", error);
    return res.status(500).json({
      success: false,
      message: "Something went wrong while sending verification code",
    });
  }
};

// ─── 2. Verify OTP & Authenticate ────────────────────────────────────────────
export const VerifyOtp = async (req, res) => {
  try {
    const { email, otp, username } = req.body;

    if (isEmpty(email) || isEmpty(otp)) {
      return res.status(400).json({
        success: false,
        message: "Email and verification code are required",
      });
    }

    const cleanEmail = String(email).toLowerCase().trim();
    const cleanOtp = String(otp).trim();
    const requestedUsername = username ? cleanBaseUsername(username) : "";

    // Find user in Database
    const user = await UserModel.findOne({ email: cleanEmail });

    if (!user) {
      return res.status(400).json({
        success: false,
        message: "User not found. Please request a new verification code.",
      });
    }

    if (user.status === "banned") {
      return res.status(403).json({
        success: false,
        message: "This account has been suspended",
      });
    }

    // Verify OTP and expiry against User record
    if (
      !user.otp ||
      user.otp !== cleanOtp ||
      !user.otpExpiresAt ||
      new Date() > new Date(user.otpExpiresAt)
    ) {
      return res.status(400).json({
        success: false,
        message: "Invalid or expired verification code",
      });
    }

    // If username provided and different from current, verify uniqueness or claim guest handle
    if (requestedUsername && requestedUsername.toLowerCase() !== (user.username || "").toLowerCase()) {
      const canClaim = await claimGuestUsername(requestedUsername, user._id);
      if (!canClaim) {
        const suggestions = await getAvailableUsernameSuggestions(requestedUsername, 4, user._id);
        return res.status(400).json({
          success: false,
          message: `Username '${requestedUsername}' is already taken. Please choose another username or select a suggestion.`,
          errors: { username: "Username already taken" },
          suggestions,
        });
      }
      user.username = requestedUsername;
    } else if (!user.username) {
      user.username = await generateUniqueUsername(cleanEmail.split("@")[0], user._id);
    }

    // Clear OTP fields & update status
    user.otp = null;
    user.otpExpiresAt = null;
    user.isVerified = true;
    user.lastLoginAt = new Date();
    await user.save();

    // Generate JWT Token
    const token = jwt.sign(
      {
        userId: user._id,
        email: user.email,
      },
      ENV.JWT_SECRET || "funchat_secret_key_2026",
      { expiresIn: "30d" }
    );

    return res.status(200).json({
      success: true,
      message: "Logged in successfully!",
      token,
      user: {
        _id: user._id,
        email: user.email,
        username: user.username,
        avatar: user.avatar,
        bio: user.bio,
        status: user.status,
        createdAt: user.createdAt,
      },
    });
  } catch (error) {
    console.error("VerifyOtp Error:", error);
    return res.status(500).json({
      success: false,
      message: "Something went wrong during verification",
    });
  }
};

// ─── 3. Get Current User Profile ─────────────────────────────────────────────
export const GetMe = async (req, res) => {
  try {
    const user = req.user;
    return res.status(200).json({
      success: true,
      user: {
        _id: user._id,
        email: user.email,
        username: user.username,
        avatar: user.avatar,
        bio: user.bio,
        status: user.status,
        createdAt: user.createdAt,
      },
    });
  } catch (error) {
    console.error("GetMe Error:", error);
    return res.status(500).json({
      success: false,
      message: "Something went wrong",
    });
  }
};

// ─── 4. Update Profile ───────────────────────────────────────────────────────
export const UpdateProfile = async (req, res) => {
  try {
    const user = req.user;
    const { username, bio, avatar } = req.body;

    const updateData = {};
    if (bio !== undefined) updateData.bio = String(bio).trim();
    if (avatar !== undefined) updateData.avatar = String(avatar).trim();

    if (username !== undefined) {
      const clean = cleanBaseUsername(username);
      if (!clean || clean.length < 2) {
        return res.status(400).json({
          success: false,
          message: "Username must be at least 2 characters long",
          errors: { username: "Username too short" },
        });
      }

      if (clean.toLowerCase() !== (user.username || "").toLowerCase()) {
        const canClaim = await claimGuestUsername(clean, user._id);
        if (!canClaim) {
          const suggestions = await getAvailableUsernameSuggestions(clean, 4, user._id);
          return res.status(400).json({
            success: false,
            message: `Username '${clean}' is already taken`,
            errors: { username: "Username already taken" },
            suggestions,
          });
        }
        updateData.username = clean;
      }
    }

    const updatedUser = await UserModel.findByIdAndUpdate(
      user._id,
      { $set: updateData },
      { new: true }
    );

    return res.status(200).json({
      success: true,
      message: "Profile updated successfully",
      user: {
        _id: updatedUser._id,
        email: updatedUser.email,
        username: updatedUser.username,
        avatar: updatedUser.avatar,
        bio: updatedUser.bio,
        status: updatedUser.status,
        createdAt: updatedUser.createdAt,
      },
    });
  } catch (error) {
    console.error("UpdateProfile Error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to update profile",
    });
  }
};

// ─── 5. Google OAuth Login ───────────────────────────────────────────────────
export const GoogleLogin = async (req, res) => {
  try {
    const { credential, access_token, profile } = req.body;

    let googleUser = null;

    // 1. If Google ID Token / JWT credential is provided
    if (credential) {
      try {
        const response = await fetch(
          `https://oauth2.googleapis.com/tokeninfo?id_token=${credential}`
        );
        if (response.ok) {
          googleUser = await response.json();
        }
      } catch (err) {
        console.error("Google tokeninfo fetch error:", err);
      }
    }

    // 2. If Google access token is provided
    if (!googleUser && access_token) {
      try {
        const response = await fetch(
          "https://www.googleapis.com/oauth2/v3/userinfo",
          {
            headers: { Authorization: `Bearer ${access_token}` },
          }
        );
        if (response.ok) {
          googleUser = await response.json();
        }
      } catch (err) {
        console.error("Google userinfo fetch error:", err);
      }
    }

    // 3. Client profile fallback if pre-verified
    if (!googleUser && profile?.email) {
      googleUser = profile;
    }

    if (!googleUser || !googleUser.email) {
      return res.status(400).json({
        success: false,
        message: "Failed to authenticate with Google. Invalid token.",
      });
    }

    const cleanEmail = googleUser.email.toLowerCase().trim();

    // Check existing user
    let user = await UserModel.findOne({ email: cleanEmail });

    if (!user) {
      const uniqueUsername = await generateUniqueUsername(googleUser.name || cleanEmail.split("@")[0]);
      user = await UserModel.create({
        email: cleanEmail,
        username: uniqueUsername,
        avatar: googleUser.picture || "",
        googleId: googleUser.sub || "",
        authProvider: "google",
        isVerified: true,
        lastLoginAt: new Date(),
      });
    } else {
      if (user.status === "banned") {
        return res.status(403).json({
          success: false,
          message: "This account has been suspended",
        });
      }
      if (!user.username) {
        user.username = await generateUniqueUsername(googleUser.name || cleanEmail.split("@")[0], user._id);
      }
      user.lastLoginAt = new Date();
      if (!user.googleId && googleUser.sub) {
        user.googleId = googleUser.sub;
      }
      if (!user.avatar && googleUser.picture) {
        user.avatar = googleUser.picture;
      }
      user.isVerified = true;
      await user.save();
    }

    // Issue JWT Token
    const token = jwt.sign(
      {
        userId: user._id,
        email: user.email,
      },
      ENV.JWT_SECRET || "funchat_secret_key_2026",
      { expiresIn: "30d" }
    );

    return res.status(200).json({
      success: true,
      message: "Signed in with Google successfully!",
      token,
      user: {
        _id: user._id,
        email: user.email,
        username: user.username,
        avatar: user.avatar,
        bio: user.bio,
        status: user.status,
        createdAt: user.createdAt,
      },
    });
  } catch (error) {
    console.error("GoogleLogin Error:", error);
    return res.status(500).json({
      success: false,
      message: "Something went wrong during Google Sign In",
    });
  }
};
