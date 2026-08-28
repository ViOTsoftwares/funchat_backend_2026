import UserModel from "../models/user.js";

/**
 * Sanitizes an input string to be a valid base username.
 * Leaves lowercase alphanumeric and underscores.
 */
export const cleanBaseUsername = (input) => {
  if (!input) return "user";
  let base = String(input)
    .trim()
    .toLowerCase()
    .replace(/@.*$/, "") // Remove email domain if email passed
    .replace(/[^a-z0-9_]/g, "_") // Replace non-alphanumeric with underscores
    .replace(/_+/g, "_") // Replace multiple consecutive underscores with single
    .replace(/^_+|_+$/g, ""); // Trim leading/trailing underscores

  if (!base || base.length < 2) {
    base = "user";
  }
  return base.slice(0, 20);
};

/**
 * Checks if a username is currently available (case-insensitive).
 */
export const isUsernameAvailable = async (username, excludeUserId = null, allowGuestReserve = true) => {
  if (!username) return false;
  const clean = cleanBaseUsername(username);
  if (!clean || clean.length < 2) return false;

  try {
    const query = {
      username: { $regex: new RegExp(`^${clean}$`, "i") },
    };

    if (excludeUserId) {
      query._id = { $ne: excludeUserId };
    }

    const existing = await UserModel.findOne(query).select("_id email").lean();
    if (!existing) return true;

    // If the username is held by a temporary landing page guest profile (email ends with @funchat.local),
    // it is available for claiming by a real user during sign in/registration.
    if (allowGuestReserve && existing.email && existing.email.endsWith("@funchat.local")) {
      return true;
    }

    return false;
  } catch (err) {
    console.error("isUsernameAvailable check error:", err.message);
    return true;
  }
};

/**
 * Returns a list of available, natural, human-friendly professional username suggestions based on a seed name/email.
 */
export const getAvailableUsernameSuggestions = async (seed, count = 6, excludeUserId = null) => {
  const base = cleanBaseUsername(seed);
  const currentYear = new Date().getFullYear();

  // Expanded list of professional & aesthetic handle variations
  const normalSuggestions = [
    // Professional Prefixes & Suffixes
    `${base}_official`,
    `the_${base}`,
    `real_${base}`,
    `its_${base}`,
    `pro_${base}`,
    `${base}_pro`,
    `${base}_dev`,
    `${base}_hq`,
    `${base}_vibe`,
    `${base}_prime`,
    `${base}_studio`,
    `${base}_digital`,
    `${base}_live`,
    `${base}_tech`,
    `${base}_hub`,
    `${base}_zone`,
    `${base}_space`,
    `${base}_online`,
    `iam_${base}`,
    `hey_${base}`,
    `${base}_${currentYear}`,
    `${base}_${Math.floor(10 + Math.random() * 89)}`,
    `${base}_${Math.floor(100 + Math.random() * 899)}`,
  ];

  // If input contains underscore or dot (e.g. first_last or first.last), add clean joined variations
  if (base.includes("_") || seed.includes(".")) {
    const parts = base.split("_").filter(Boolean);
    if (parts.length >= 2) {
      normalSuggestions.unshift(parts.join("")); // e.g. johnsmith
      normalSuggestions.unshift(`${parts[0]}_${parts[1]}`); // e.g. john_smith
      normalSuggestions.unshift(`${parts[0][0]}_${parts[1]}`); // e.g. j_smith
      normalSuggestions.unshift(`${parts[0]}_${parts[1][0]}`); // e.g. john_s
    }
  }

  // Remove duplicates and preserve priority order
  const uniqueCandidates = [...new Set(normalSuggestions)];

  try {
    // Check which candidates already exist in the database
    const regexPatterns = uniqueCandidates.map((c) => new RegExp(`^${c}$`, "i"));
    const query = {
      username: { $in: regexPatterns },
    };
    if (excludeUserId) {
      query._id = { $ne: excludeUserId };
    }

    const takenRecords = await UserModel.find(query).select("username").lean();
    const takenSet = new Set(takenRecords.map((r) => (r.username || "").toLowerCase()));

    // Filter out any taken names
    const available = uniqueCandidates.filter((c) => !takenSet.has(c.toLowerCase()));

    return available.slice(0, count);
  } catch (err) {
    console.error("getAvailableUsernameSuggestions query error:", err.message);
    return uniqueCandidates.slice(0, count);
  }
};

/**
 * Generates a single guaranteed unique username.
 */
export const generateUniqueUsername = async (seed, excludeUserId = null) => {
  const base = cleanBaseUsername(seed);

  // 1. First check if base itself is available
  if (await isUsernameAvailable(base, excludeUserId)) {
    return base;
  }

  // 2. Fetch available natural suggestions
  const suggestions = await getAvailableUsernameSuggestions(base, 1, excludeUserId);
  if (suggestions.length > 0) {
    return suggestions[0];
  }

  // 3. Fallback: random suffix with timestamp
  let uniqueName = `${base}_${Date.now().toString().slice(-4)}`;
  while (!(await isUsernameAvailable(uniqueName, excludeUserId))) {
    uniqueName = `${base}_${Math.floor(1000 + Math.random() * 9000)}`;
  }

  return uniqueName;
};
