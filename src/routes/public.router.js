import express from "express";
import * as CommunityCrt from "../controllers/community.js";
import * as AdCrt from "../controllers/advertisement.js";
import * as SettingCrt from "../controllers/settings.js";
import * as CMSCrt from "../controllers/cms.js";

const router = express.Router();

router.get("/community", CommunityCrt.GetPublicCommunities);
router.get("/feature-control", SettingCrt.GetPublicFeatureControl);

// CMS Pages
router.get("/cms", CMSCrt.GetPublicCMSList);
router.get("/cms/:identifier", CMSCrt.GetPublicCMSByIdentifier);

// Advertisements
router.get("/ads", AdCrt.GetPublicAds);
router.post("/ads/:id/impression", AdCrt.RecordAdImpression);
router.post("/ads/:id/click", AdCrt.RecordAdClick);

export default router;
