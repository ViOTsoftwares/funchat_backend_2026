import mongoose from "mongoose";

const advertisementSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
      trim: true,
    },
    placement: {
      type: String,
      enum: [
        "community_sidebar",
        "chat_top_banner",
        "chat_bottom_banner",
        "video_call_banner",
        "landing_featured",
        "popup_interstitial",
        "popup_dialog",
      ],
      default: "community_sidebar",
    },
    adType: {
      type: String,
      enum: ["custom_banner", "google_adsense", "custom_script", "iframe_embed"],
      default: "custom_banner",
    },
    thirdPartyNetwork: {
      type: String,
      default: "Direct Advertiser",
      trim: true,
    },
    googleClientId: {
      type: String,
      default: "",
      trim: true,
    },
    googleSlotId: {
      type: String,
      default: "",
      trim: true,
    },
    googleAdFormat: {
      type: String,
      default: "auto",
      trim: true,
    },
    iframeUrl: {
      type: String,
      default: "",
      trim: true,
    },
    popupDelaySeconds: {
      type: Number,
      default: 3,
    },
    popupFrequency: {
      type: String,
      enum: ["once_per_session", "every_page_view", "once_per_day"],
      default: "once_per_session",
    },
    popupAutoCloseSeconds: {
      type: Number,
      default: 0,
    },
    popupEnabled: {
      type: Boolean,
      default: true,
    },
    image: {
      type: String,
      default: "",
    },
    targetUrl: {
      type: String,
      default: "",
      trim: true,
    },
    description: {
      type: String,
      default: "",
    },
    ctaText: {
      type: String,
      default: "Learn More",
      trim: true,
    },
    badgeText: {
      type: String,
      default: "SPONSORED",
      trim: true,
    },
    scriptCode: {
      type: String,
      default: "",
    },
    impressions: {
      type: Number,
      default: 0,
    },
    clicks: {
      type: Number,
      default: 0,
    },
    priority: {
      type: Number,
      default: 0,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
  }
);

const Advertisement = mongoose.model("Advertisement", advertisementSchema);

export default Advertisement;
