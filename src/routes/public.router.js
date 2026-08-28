import express from "express";
import * as CommunityCrt from "../controllers/community.js";
import * as AdCrt from "../controllers/advertisement.js";
import * as SettingCrt from "../controllers/settings.js";
import * as CMSCrt from "../controllers/cms.js";
import * as UserAuthCrt from "../controllers/userAuth.js";
import { userAuthMiddleware } from "../middlewares/userAuth.js";

import { uploadCommunityImage } from "../lib/multer.js";

const router = express.Router();

// User Auth with OTP & Google
router.get("/auth/check-username", UserAuthCrt.CheckUsernameAvailability);
router.post("/auth/save-username", UserAuthCrt.SaveInitialUsername);
router.post("/auth/send-otp", UserAuthCrt.SendOtp);
router.post("/auth/verify-otp", UserAuthCrt.VerifyOtp);
router.post("/auth/google", UserAuthCrt.GoogleLogin);
router.get("/auth/me", userAuthMiddleware, UserAuthCrt.GetMe);
router.put("/auth/profile", userAuthMiddleware, UserAuthCrt.UpdateProfile);

// Community & Settings
router.get("/community", CommunityCrt.GetPublicCommunities);
router.post("/community/upload-image", userAuthMiddleware, uploadCommunityImage.single("image"), CommunityCrt.UploadCommunityImage);
router.get("/feature-control", SettingCrt.GetPublicFeatureControl);
router.get("/settings/community-media", SettingCrt.GetCommunityMediaSettings);
router.get("/settings", SettingCrt.GetPublicSetting);
router.get("/setting", SettingCrt.GetPublicSetting);

// CMS Pages
router.get("/cms", CMSCrt.GetPublicCMSList);
router.get("/cms/:identifier", CMSCrt.GetPublicCMSByIdentifier);

// Advertisements
router.get("/ads", AdCrt.GetPublicAds);
router.post("/ads/:id/impression", AdCrt.RecordAdImpression);
router.post("/ads/:id/click", AdCrt.RecordAdClick);

export default router;
