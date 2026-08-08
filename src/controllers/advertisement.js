import Advertisement from "../models/advertisement.js";
import { HandleError } from "../utils/error.js";

// ----- Public Endpoints -----

// Get active advertisements (with fallback)
export const GetPublicAds = async (req, res) => {
  try {
    const { placement } = req.query;
    let ads = [];

    if (placement) {
      // Find ads for the requested slot
      ads = await Advertisement.find({ isActive: true, placement })
        .sort({ priority: -1, createdAt: -1 })
        .lean();
    }

    // Fallback: If no ad specifically assigned to this slot, fetch active ads
    if (!ads || ads.length === 0) {
      ads = await Advertisement.find({ isActive: true })
        .sort({ priority: -1, createdAt: -1 })
        .lean();
    }

    res.status(200).json({ ok: true, data: ads });
  } catch (error) {
    HandleError(res, error, "Failed to get advertisements");
  }
};

// Track ad impression
export const RecordAdImpression = async (req, res) => {
  try {
    const { id } = req.params;
    await Advertisement.findByIdAndUpdate(id, { $inc: { impressions: 1 } });
    res.status(200).json({ ok: true });
  } catch (error) {
    res.status(200).json({ ok: true }); // non-blocking for metrics
  }
};

// Track ad click
export const RecordAdClick = async (req, res) => {
  try {
    const { id } = req.params;
    await Advertisement.findByIdAndUpdate(id, { $inc: { clicks: 1 } });
    res.status(200).json({ ok: true });
  } catch (error) {
    res.status(200).json({ ok: true });
  }
};

// ----- Admin Endpoints -----

export const AdList = async (req, res) => {
  try {
    const ads = await Advertisement.find().sort({ createdAt: -1 });
    res.status(200).json({ ok: true, data: ads });
  } catch (error) {
    HandleError(res, error, "Failed to get advertisements list");
  }
};

export const OneAd = async (req, res) => {
  try {
    const ad = await Advertisement.findById(req.params.id);
    if (!ad) return res.status(404).json({ ok: false, message: "Advertisement not found" });
    res.status(200).json({ ok: true, data: ad });
  } catch (error) {
    HandleError(res, error, "Failed to get advertisement");
  }
};

export const CreateAd = async (req, res) => {
  try {
    const payload = { ...req.body };
    if (req.file) {
      payload.image = req.file.filename;
    }
    if (payload.isActive !== undefined) {
      payload.isActive = payload.isActive === "true" || payload.isActive === true;
    }
    if (payload.popupEnabled !== undefined) {
      payload.popupEnabled = payload.popupEnabled === "true" || payload.popupEnabled === true;
    }
    if (payload.popupDelaySeconds !== undefined) {
      payload.popupDelaySeconds = Number(payload.popupDelaySeconds) || 0;
    }
    if (payload.popupAutoCloseSeconds !== undefined) {
      payload.popupAutoCloseSeconds = Number(payload.popupAutoCloseSeconds) || 0;
    }
    if (payload.priority !== undefined) {
      payload.priority = Number(payload.priority) || 0;
    }

    const newAd = await Advertisement.create(payload);
    res.status(201).json({ ok: true, data: newAd, message: "Advertisement created successfully" });
  } catch (error) {
    HandleError(res, error, "Failed to create advertisement");
  }
};

export const UpdateAd = async (req, res) => {
  try {
    const payload = { ...req.body };
    if (req.file) {
      payload.image = req.file.filename;
    }
    if (payload.isActive !== undefined) {
      payload.isActive = payload.isActive === "true" || payload.isActive === true;
    }
    if (payload.popupEnabled !== undefined) {
      payload.popupEnabled = payload.popupEnabled === "true" || payload.popupEnabled === true;
    }
    if (payload.popupDelaySeconds !== undefined) {
      payload.popupDelaySeconds = Number(payload.popupDelaySeconds) || 0;
    }
    if (payload.popupAutoCloseSeconds !== undefined) {
      payload.popupAutoCloseSeconds = Number(payload.popupAutoCloseSeconds) || 0;
    }
    if (payload.priority !== undefined) {
      payload.priority = Number(payload.priority) || 0;
    }

    const id = req.body._id || req.body.id;
    if (!id) {
      return res.status(400).json({ ok: false, message: "Advertisement ID is required" });
    }

    const updated = await Advertisement.findByIdAndUpdate(id, payload, { new: true });
    if (!updated) return res.status(404).json({ ok: false, message: "Advertisement not found" });
    res.status(200).json({ ok: true, data: updated, message: "Advertisement updated successfully" });
  } catch (error) {
    HandleError(res, error, "Failed to update advertisement");
  }
};

export const DeleteAd = async (req, res) => {
  try {
    const id = req.body._id || req.body.id;
    const deleted = await Advertisement.findByIdAndDelete(id);
    if (!deleted) return res.status(404).json({ ok: false, message: "Advertisement not found" });
    res.status(200).json({ ok: true, message: "Advertisement deleted successfully" });
  } catch (error) {
    HandleError(res, error, "Failed to delete advertisement");
  }
};

// Seed default sample ad model data
export const seedDefaultAds = async () => {
  try {
    const count = await Advertisement.countDocuments();
    if (count === 0) {
      const sampleAds = [
        {
          title: "NordVPN Pro - 68% Off + 3 Months Free",
          placement: "community_sidebar",
          adType: "custom_banner",
          thirdPartyNetwork: "NordVPN Affiliate",
          targetUrl: "https://nordvpn.com",
          description: "Ultra-fast encrypted connection with zero logs. Keep your chats & video calls 100% private.",
          ctaText: "Claim 68% Off",
          badgeText: "SPONSORED",
          impressions: 480,
          clicks: 34,
          priority: 10,
          isActive: true,
        },
        {
          title: "Google AdSense Sidebar Responsive Unit",
          placement: "community_sidebar",
          adType: "google_adsense",
          thirdPartyNetwork: "Google AdSense",
          googleClientId: "ca-pub-9876543210123456",
          googleSlotId: "8976543210",
          googleAdFormat: "auto",
          badgeText: "ADVERTISEMENT",
          impressions: 1250,
          clicks: 86,
          priority: 8,
          isActive: true,
        },
        {
          title: "GitHub Copilot - AI Pair Programmer",
          placement: "landing_featured",
          adType: "custom_banner",
          thirdPartyNetwork: "GitHub Developer Partner",
          targetUrl: "https://github.com/features/copilot",
          description: "Get code suggestions, whole-line completions, and AI chat directly inside your development workflow.",
          ctaText: "Try Free for 30 Days",
          badgeText: "FEATURED PARTNER",
          impressions: 2310,
          clicks: 195,
          priority: 9,
          isActive: true,
        },
        {
          title: "Media.net / Carbon Tech Ads Banner",
          placement: "chat_top_banner",
          adType: "custom_script",
          thirdPartyNetwork: "Media.net Network",
          scriptCode: '<div style="padding:10px 14px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;display:flex;align-items:center;justify-content:space-between;"><span style="font-weight:700;font-size:12px;color:#1e293b;">⚡ DigitalOcean Cloud: $200 Free Credits for Developers</span><a href="https://digitalocean.com" target="_blank" style="padding:4px 10px;background:#0284c7;color:#fff;font-size:11px;font-weight:700;border-radius:6px;text-decoration:none;">Claim Credit</a></div>',
          badgeText: "SPONSORED",
          impressions: 740,
          clicks: 42,
          priority: 7,
          isActive: true,
        },
        {
          title: "Loom Screen & Video Call Message Recorder",
          placement: "video_call_banner",
          adType: "custom_banner",
          thirdPartyNetwork: "Loom Video",
          targetUrl: "https://loom.com",
          description: "Record high-resolution screen, camera, and audio messages instantly to share with your group members.",
          ctaText: "Get Loom Free",
          badgeText: "PROMOTION",
          impressions: 310,
          clicks: 29,
          priority: 5,
          isActive: true,
        },
        {
          title: "Special Offer: 50% Off FunChat Premium Pass",
          placement: "popup_interstitial",
          adType: "custom_banner",
          thirdPartyNetwork: "FunChat Pro Special",
          targetUrl: "https://nordvpn.com",
          description: "Upgrade to Ad-Free high definition 4K video rooms, priority matching, and exclusive VIP badges!",
          ctaText: "Unlock Premium Deal",
          badgeText: "LIMITED TIME DEAL",
          impressions: 890,
          clicks: 142,
          priority: 10,
          isActive: true,
        },
      ];

      await Advertisement.insertMany(sampleAds);
      console.log("✅ Seeded default Advertisement model data successfully");
    }
  } catch (error) {
    console.error("Error seeding default ads:", error);
  }
};

export const SeedAdsEndpoint = async (req, res) => {
  try {
    await Advertisement.deleteMany({});
    await seedDefaultAds();
    res.status(200).json({ ok: true, message: "Sample ad model data seeded successfully!" });
  } catch (error) {
    HandleError(res, error, "Failed to seed sample advertisements");
  }
};
