import bcrypt from "bcryptjs";

const saltRounds = 10;

export const hashPassword = async (password) => {
  try {
    return await bcrypt.hash(password, saltRounds);
  } catch (error) {
    console.error("Hash error:", error);
    throw error;
  }
};

export const comparePassword = async (password, hashedPassword) => {
  try {
    return await bcrypt.compare(password, hashedPassword);
  } catch (error) {
    console.error("Compare error:", error);
    throw error;
  }
};
