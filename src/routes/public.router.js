import express from "express";
import * as CommunityCrt from "../controllers/community.js";
import * as AdCrt from "../controllers/advertisement.js";

const router = express.Router();

router.get("/community", CommunityCrt.GetPublicCommunities);

// Advertisements
router.get("/ads", AdCrt.GetPublicAds);
router.post("/ads/:id/impression", AdCrt.RecordAdImpression);
router.post("/ads/:id/click", AdCrt.RecordAdClick);

export default router;
