import mongoose from "mongoose";

const TestimonialSchema = new mongoose.Schema(
  {
    name: { type: String, default: "" },
    designation: { type: String, default: "" },
    content: { type: String, default: "" },
    logo: { type: String, default: "" },
    status: { type: String, enum: ["active", "inactive"], default: "active" },
  },
  { timestamps: true }
);

export default mongoose.model("Testimonial", TestimonialSchema, "testimonials");
